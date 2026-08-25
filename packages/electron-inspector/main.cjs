'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const captureRecords = loadCaptureRecordModule();

const START_CHANNEL = 'dev-feedback-electron:start';
const CAPTURE_ELEMENT_CHANNEL = 'dev-feedback-electron:capture-element';
const HISTORY_LIST_CHANNEL = 'dev-feedback-electron:history-list';
const HISTORY_EXPORT_TEXT_CHANNEL = 'dev-feedback-electron:history-export-text';
const REGISTERED_CHANNELS = Object.freeze([
  CAPTURE_ELEMENT_CHANNEL,
  HISTORY_LIST_CHANNEL,
  HISTORY_EXPORT_TEXT_CHANNEL
]);
const MAX_HISTORY_ITEMS = 200;

function installElectronInspector(options = {}) {
  const app = options.app;
  const ipcMain = options.ipcMain;
  const getMainWindow = options.getMainWindow;
  const hostId = normalizeRequiredText(options.hostId, 'hostId');
  const hostName = normalizeRequiredText(options.hostName, 'hostName');
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();

  if (!app || typeof app.getPath !== 'function') {
    throw new TypeError('Electron Inspector requires app.getPath.');
  }
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new TypeError('Electron Inspector requires ipcMain.');
  }
  if (typeof getMainWindow !== 'function') {
    throw new TypeError('Electron Inspector requires getMainWindow.');
  }

  let disposed = false;
  const userDataRoot = path.resolve(app.getPath('userData'));
  const historyRoot = path.join(userDataRoot, 'dev-feedback-electron');
  const historyPath = path.join(historyRoot, `${safeSegment(hostId)}-history.json`);
  const storageKey = `dev-feedback-app-${hostId}`;

  ipcMain.handle(CAPTURE_ELEMENT_CHANNEL, async (event, draft) => {
    assertTrustedSender(event, getMainWindow());
    const record = buildElementRecord(draft, { hostId, hostName, clock });
    const history = await readHistory(historyPath, storageKey);
    const items = [...history.items, record].slice(-MAX_HISTORY_ITEMS);
    await writeJsonAtomic(historyPath, { schemaVersion: 1, storageKey, items });
    return { record, count: items.length };
  });

  ipcMain.handle(HISTORY_LIST_CHANNEL, async (event) => {
    assertTrustedSender(event, getMainWindow());
    return readHistory(historyPath, storageKey);
  });

  ipcMain.handle(HISTORY_EXPORT_TEXT_CHANNEL, async (event) => {
    assertTrustedSender(event, getMainWindow());
    const history = await readHistory(historyPath, storageKey);
    if (!history.items.length) {
      throw new Error('Electron Inspector History is empty.');
    }
    return {
      count: history.items.length,
      text: captureRecords.buildMarkdownExport(`app://${hostId}`, history.items, {
        exportedAt: clock().toISOString()
      })
    };
  });

  function inspect() {
    if (disposed) {
      throw new Error('Electron Inspector is disposed.');
    }
    const mainWindow = getMainWindow();
    if (
      !mainWindow ||
      mainWindow.isDestroyed?.() ||
      !mainWindow.webContents ||
      mainWindow.webContents.isDestroyed?.()
    ) {
      throw new Error('Electron Inspector has no available Host App window.');
    }
    mainWindow.webContents.send(START_CHANNEL, { hostId, hostName });
  }

  return Object.freeze({
    inspect,
    menuItem() {
      return {
        label: 'Inspect this app',
        accelerator: 'CmdOrCtrl+Shift+.',
        click: inspect
      };
    },
    async dispose() {
      disposed = true;
      REGISTERED_CHANNELS.forEach((channel) => ipcMain.removeHandler?.(channel));
    }
  });
}

function buildElementRecord(draft, context) {
  const input = draft && typeof draft === 'object' ? draft : {};
  const elementInfo = input.elementInfo && typeof input.elementInfo === 'object'
    ? { ...input.elementInfo, surroundingText: '' }
    : input.elementInfo;
  const syntheticUrl = `app://${context.hostId}`;
  return captureRecords.createElementRecord({
    selector: input.selector,
    pageUrl: syntheticUrl,
    pageTitle: context.hostName,
    elementInfo,
    position: input.position,
    pageContext: {
      url: syntheticUrl,
      title: context.hostName,
      viewport: input.viewport
    },
    note: input.note,
    acceptance: input.acceptance,
    timestamp: context.clock().toISOString()
  });
}

function assertTrustedSender(event, mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed?.() || event?.sender !== mainWindow.webContents) {
    throw new Error('Electron Inspector rejected an untrusted IPC sender.');
  }
}

async function readHistory(historyPath, storageKey) {
  try {
    const parsed = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    const items = captureRecords.sanitizeFeedbackItems(parsed?.items);
    return { schemaVersion: 1, storageKey, items: items.slice(-MAX_HISTORY_ITEMS) };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { schemaVersion: 1, storageKey, items: [] };
    }
    throw error;
  }
}

async function writeJsonAtomic(destination, value) {
  const directory = path.dirname(destination);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tempPath, destination);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function safeSegment(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
}

function loadCaptureRecordModule() {
  try {
    return require('./vendor/capture-record.cjs');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return require('../../shared.js');
  }
}

function normalizeRequiredText(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new TypeError(`Electron Inspector requires ${name}.`);
  }
  return normalized;
}

module.exports = {
  installElectronInspector
};
