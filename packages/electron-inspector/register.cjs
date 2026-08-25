'use strict';

const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { installElectronInspector } = require('./main.cjs');

const registerPreloadPath = path.join(__dirname, 'register-preload.cjs');
let registration = null;

function registerElectronInspector() {
  if (registration) return registration;
  if (!electron.app || electron.app.isPackaged) {
    registration = Promise.resolve(null);
    return registration;
  }

  const registeredSessions = new Set();
  const ownedSessionPreloads = new Set();
  const registeredWindows = new Set();
  const windowListeners = new Map();
  let disposed = false;

  function addSessionPreload(targetSession) {
    if (!targetSession?.getPreloads || !targetSession?.setPreloads || registeredSessions.has(targetSession)) {
      return;
    }
    const existingPreloads = targetSession.getPreloads();
    if (!existingPreloads.includes(registerPreloadPath)) {
      targetSession.setPreloads([...existingPreloads, registerPreloadPath]);
      ownedSessionPreloads.add(targetSession);
    }
    registeredSessions.add(targetSession);
  }

  const handleSessionCreated = (targetSession) => addSessionPreload(targetSession);
  electron.app.on?.('session-created', handleSessionCreated);

  function initialize() {
    const targetSession = electron.session?.defaultSession;
    if (!targetSession) {
      throw new Error('Electron Inspector requires session preload registration.');
    }
    addSessionPreload(targetSession);

    const applicationName = String(electron.app.getName?.() || 'Electron App').trim() || 'Electron App';
    const hostName = resolveHostName(electron.app, applicationName);
    const hostId = applicationName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'electron-app';
    const inspector = installElectronInspector({
      app: electron.app,
      ipcMain: electron.ipcMain,
      getMainWindow: () => electron.BrowserWindow.getFocusedWindow?.()
        || [...registeredWindows].find((window) => !window.isDestroyed?.())
        || null,
      isTrustedSender: (sender) => [...registeredWindows]
        .some((window) => !window.isDestroyed?.() && window.webContents === sender),
      hostId,
      hostName
    });

    function attachWindow(window) {
      if (disposed || !window?.webContents || registeredWindows.has(window)) return;
      registeredWindows.add(window);
      const handleInput = (event, input = {}) => {
        if (disposed) return;
        const isInspectorShortcut = input.type === 'keyDown'
          && input.code === 'Period'
          && input.shift
          && (input.meta || input.control)
          && !input.alt
          && !input.isAutoRepeat;
        if (!isInspectorShortcut) return;
        event.preventDefault?.();
        inspector.inspect(window);
      };
      const handleClosed = () => detachWindow(window);
      windowListeners.set(window, { handleInput, handleClosed });
      window.webContents.on('before-input-event', handleInput);
      window.once?.('closed', handleClosed);
    }

    function detachWindow(window) {
      const listeners = windowListeners.get(window);
      if (!listeners) return;
      window.webContents?.removeListener?.('before-input-event', listeners.handleInput);
      window.removeListener?.('closed', listeners.handleClosed);
      windowListeners.delete(window);
      registeredWindows.delete(window);
    }

    const handleWindowCreated = (_event, window) => attachWindow(window);
    electron.BrowserWindow.getAllWindows?.().forEach(attachWindow);
    electron.app.on?.('browser-window-created', handleWindowCreated);

    return Object.freeze({
      preloadPath: registerPreloadPath,
      async dispose() {
        if (disposed) return;
        disposed = true;
        electron.app.removeListener?.('session-created', handleSessionCreated);
        electron.app.removeListener?.('browser-window-created', handleWindowCreated);
        [...registeredWindows].forEach(detachWindow);
        ownedSessionPreloads.forEach((target) => {
          if (!target?.getPreloads || !target?.setPreloads) return;
          target.setPreloads(target.getPreloads().filter((preload) => preload !== registerPreloadPath));
        });
        ownedSessionPreloads.clear();
        registeredSessions.clear();
        await inspector.dispose();
      }
    });
  }

  registration = new Promise((resolve, reject) => {
    const start = () => {
      try {
        resolve(initialize());
      } catch (error) {
        reject(error);
      }
    };
    if (electron.app.isReady?.()) {
      start();
    } else if (typeof electron.app.once === 'function') {
      electron.app.once('ready', start);
    } else {
      electron.app.whenReady().then(start, reject);
    }
  });
  return registration;
}

function resolveHostName(app, fallback) {
  try {
    const appPath = app.getAppPath?.();
    if (!appPath) return fallback;
    const manifest = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf8'));
    const configuredName = manifest.productName || manifest.build?.productName;
    const productName = typeof configuredName === 'string' ? configuredName.trim() : '';
    return productName || fallback;
  } catch {
    return fallback;
  }
}

registerElectronInspector().catch((error) => {
  console.error(`[DevFeedback] ${error.message}`);
});

module.exports = {
  registerElectronInspector
};
