'use strict';

const { mountElectronInspector } = require('./renderer.cjs');

const START_CHANNEL = 'dev-feedback-electron:start';
const READY_CHANNEL = 'dev-feedback-electron:ready';

function installElectronInspectorPreload(options = {}) {
  const ipcRenderer = options.ipcRenderer;
  const documentRef = options.document || globalThis.document;
  const windowRef = options.window || globalThis.window;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function' || typeof ipcRenderer.on !== 'function') {
    throw new TypeError('Electron Inspector preload requires ipcRenderer.');
  }
  if (!documentRef || !windowRef) {
    throw new TypeError('Electron Inspector preload requires a renderer document and window.');
  }

  const pendingStarts = [];
  let controller = null;
  let disposed = false;
  let documentReady = documentRef.readyState !== 'loading';

  const bridge = Object.freeze({
    saveElement: (draft) => ipcRenderer.invoke('dev-feedback-electron:capture-element', draft),
    listHistory: () => ipcRenderer.invoke('dev-feedback-electron:history-list'),
    getHistoryText: () => ipcRenderer.invoke('dev-feedback-electron:history-export-text')
  });

  function mount() {
    if (disposed || controller || !documentReady || !pendingStarts.length) return;
    controller = mountElectronInspector({
      document: documentRef,
      window: windowRef,
      bridge
    });
    pendingStarts.splice(0).forEach((payload) => controller.start(payload));
  }

  function handleStart(_event, payload) {
    if (controller) controller.start(payload);
    else {
      pendingStarts.push(payload);
      mount();
    }
  }

  function handleDocumentReady() {
    documentReady = true;
    mount();
  }

  ipcRenderer.on(START_CHANNEL, handleStart);
  if (!documentReady) documentRef.addEventListener('DOMContentLoaded', handleDocumentReady, { once: true });
  ipcRenderer.send?.(READY_CHANNEL);

  return Object.freeze({
    dispose() {
      disposed = true;
      ipcRenderer.removeListener?.(START_CHANNEL, handleStart);
      documentRef.removeEventListener?.('DOMContentLoaded', handleDocumentReady);
      controller?.dispose?.();
      controller = null;
      pendingStarts.length = 0;
    }
  });
}

module.exports = {
  installElectronInspectorPreload
};
