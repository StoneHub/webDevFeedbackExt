const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { installElectronInspector } = require('../packages/electron-inspector/main.cjs');
const { installElectronInspectorPreload } = require('../packages/electron-inspector/preload.cjs');
const { describeFeature, implicitRole } = require('../packages/electron-inspector/renderer.cjs');

test('feature identity honors Host App attributes and native input roles', () => {
  const featureElement = {
    tagName: 'DIV',
    isContentEditable: false,
    innerText: '',
    getAttribute: (name) => name === 'data-feature' ? 'Build controls' : null,
    closest() { return this; }
  };
  assert.deepEqual(describeFeature(featureElement), {
    label: 'Build controls div',
    kind: 'div',
    context: 'Build controls'
  });

  const checkbox = {
    tagName: 'INPUT',
    getAttribute: (name) => name === 'type' ? 'checkbox' : null
  };
  const radio = {
    tagName: 'INPUT',
    getAttribute: (name) => name === 'type' ? 'radio' : null
  };
  assert.equal(implicitRole(checkbox), 'checkbox');
  assert.equal(implicitRole(radio), 'radio');
});

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

test('main installer validates Element drafts, stores History, and prepares an explicit clipboard export', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-electron-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const userDataRoot = path.join(tempRoot, 'user-data');
  const downloadsRoot = path.join(tempRoot, 'Downloads');
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
      feature: {
        label: 'Build button',
        kind: 'button',
        context: 'Build controls'
      },
      geometry: { x: 20, y: 30, width: 120, height: 44 },
      surroundingText: 'private terminal output that must not be captured',
      styles: { color: '#ffffff', backgroundColor: '#5b55c5' }
    },
    position: { x: 20, y: 30 },
    viewport: { width: 1400, height: 900, devicePixelRatio: 2 },
    note: 'Make the build state clearer'
  });

  assert.equal(saved.record.type, 'element');
  assert.equal(saved.record.selector, 'button[data-action="build"]');
  assert.equal(saved.record.pageUrl, 'app://forge3d');
  assert.deepEqual(saved.record.elementInfo.feature, {
    label: 'Build button',
    kind: 'button',
    context: 'Build controls'
  });
  assert.deepEqual(saved.record.elementInfo.geometry, { x: 20, y: 30, width: 120, height: 44 });
  assert.equal(saved.record.elementInfo.surroundingText, '');
  assert.equal(JSON.stringify(saved.record).includes('/Users/monroe'), false);
  assert.equal(JSON.stringify(saved.record).includes('private terminal output'), false);

  const history = await handlers.get('dev-feedback-electron:history-list')(event);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].note, 'Make the build state clearer');

  const exported = await handlers.get('dev-feedback-electron:history-export-text')(event);
  assert.equal(exported.count, 1);
  assert.match(exported.text, /Build button/);
  assert.match(exported.text, /Make the build state clearer/);
  assert.match(exported.text, /app:\/\/forge3d/);
  assert.match(exported.text, /width: 120, height: 44/);
  assert.equal(exported.path, undefined);

  await inspector.dispose();
});
