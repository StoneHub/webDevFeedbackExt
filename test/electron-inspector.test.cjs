const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { installElectronInspector } = require('../packages/electron-inspector/main.cjs');
const { installElectronInspectorPreload } = require('../packages/electron-inspector/preload.cjs');

test('main installer exposes one Host App action and starts inspection in the target window', async () => {
  const handlers = new Map();
  const listeners = new Map();
  const sent = [];
  const webContents = {
    isDestroyed: () => false,
    send: (...args) => sent.push(args)
  };
  const mainWindow = {
    isDestroyed: () => false,
    webContents
  };
  const inspector = installElectronInspector({
    app: { getPath: () => '/tmp/dev-feedback-electron-test' },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: (channel, handler) => listeners.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
      removeListener: (channel) => listeners.delete(channel)
    },
    getMainWindow: () => mainWindow,
    hostId: 'forge3d',
    hostName: 'Forge3D'
  });

  const menuItem = inspector.menuItem();
  assert.equal(menuItem.label, 'Inspect this app');
  assert.equal(menuItem.accelerator, 'CmdOrCtrl+Shift+.');

  menuItem.click();
  assert.deepEqual(sent, [['dev-feedback-electron:start', { hostId: 'forge3d', hostName: 'Forge3D' }]]);

  await inspector.dispose();
  assert.equal(handlers.size, 0);
  assert.equal(listeners.size, 0);
});

test('preload hook registers the narrow inspector bridge without exposing Electron to the Host App', () => {
  const listeners = new Map();
  const sent = [];
  const documentListeners = new Map();
  const ipcRenderer = {
    invoke: async () => ({}),
    on: (channel, handler) => listeners.set(channel, handler),
    removeListener: (channel) => listeners.delete(channel),
    send: (...args) => sent.push(args)
  };
  const fakeDocument = {
    readyState: 'loading',
    addEventListener: (name, handler) => documentListeners.set(name, handler),
    removeEventListener: (name) => documentListeners.delete(name)
  };

  const preload = installElectronInspectorPreload({
    ipcRenderer,
    document: fakeDocument,
    window: {}
  });

  assert.equal(listeners.has('dev-feedback-electron:start'), true);
  assert.equal(documentListeners.has('DOMContentLoaded'), true);
  assert.deepEqual(sent, [['dev-feedback-electron:ready']]);
  assert.equal(globalThis.devFeedbackInspector, undefined);

  preload.dispose();
  assert.equal(listeners.size, 0);
  assert.equal(documentListeners.size, 0);
});

test('main installer validates Element drafts, stores History, and writes the existing handoff contract', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-electron-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const userDataRoot = path.join(tempRoot, 'user-data');
  const downloadsRoot = path.join(tempRoot, 'Downloads');
  const inboxRoot = path.join(downloadsRoot, 'Forge3D');
  await fs.mkdir(userDataRoot, { recursive: true });
  await fs.mkdir(downloadsRoot, { recursive: true });

  const handlers = new Map();
  const webContents = { isDestroyed: () => false, send: () => {} };
  const inspector = installElectronInspector({
    app: {
      getPath: (name) => name === 'userData' ? userDataRoot : downloadsRoot
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: () => {},
      removeHandler: (channel) => handlers.delete(channel),
      removeListener: () => {}
    },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }),
    hostId: 'forge3d',
    hostName: 'Forge3D',
    inboxRoot,
    clock: () => new Date('2026-08-24T12:00:00.000Z')
  });

  const event = { sender: webContents };
  const saved = await handlers.get('dev-feedback-electron:capture-element')(event, {
    selector: 'button[data-action="build"]',
    pageUrl: 'file:///Users/monroe/private/project.scad',
    pageTitle: 'private project',
    elementInfo: {
      tag: 'button',
      text: 'Build',
      classes: ['primary'],
      role: 'button',
      styles: { color: '#ffffff', backgroundColor: '#5b55c5' }
    },
    position: { x: 20, y: 30 },
    viewport: { width: 1400, height: 900, devicePixelRatio: 2 },
    note: 'Make the build state clearer'
  });

  assert.equal(saved.record.type, 'element');
  assert.equal(saved.record.selector, 'button[data-action="build"]');
  assert.equal(saved.record.pageUrl, 'app://forge3d');
  assert.equal(JSON.stringify(saved.record).includes('/Users/monroe'), false);

  const history = await handlers.get('dev-feedback-electron:history-list')(event);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].note, 'Make the build state clearer');

  const exported = await handlers.get('dev-feedback-electron:handoff-export')(event);
  assert.equal(exported.count, 1);
  assert.equal(path.dirname(exported.path), await fs.realpath(inboxRoot));
  const payload = JSON.parse(await fs.readFile(exported.path, 'utf8'));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.histories[0].storageKey, 'dev-feedback-app-forge3d');
  assert.equal(payload.histories[0].items[0].pageUrl, 'app://forge3d');

  await inspector.dispose();
});
