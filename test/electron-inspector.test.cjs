const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const util = require('node:util');

const execFile = util.promisify(childProcess.execFile);

const { installElectronInspector } = require('../packages/electron-inspector/main.cjs');
const { installElectronInspectorPreload } = require('../packages/electron-inspector/preload.cjs');
const { describeFeature, implicitRole } = require('../packages/electron-inspector/renderer.cjs');

test('published package contains the one-line register entry and its self-contained preload', async () => {
  const packageRoot = path.resolve(__dirname, '..', 'packages', 'electron-inspector');
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.exports['./register'], './register.cjs');
  assert.equal(manifest.files.includes('register.cjs'), true);
  assert.equal(manifest.files.includes('register-preload.cjs'), true);
  assert.equal(manifest.files.includes('LICENSE'), true);

  const license = await fs.readFile(path.join(packageRoot, 'LICENSE'), 'utf8');
  assert.match(license, /^MIT License/);

  const bundledPreload = await fs.readFile(path.join(packageRoot, 'register-preload.cjs'), 'utf8');
  assert.match(bundledPreload, /dev-feedback-electron:start/);
  assert.match(bundledPreload, /Copy History/);
  assert.doesNotMatch(bundledPreload, /require\(['"]\.\/renderer\.cjs['"]\)/);
});

test('package-owned session preload installs the inspector bridge by itself', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-register-preload-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const electronModuleRoot = path.join(tempRoot, 'node_modules', 'electron');
  await fs.mkdir(electronModuleRoot, { recursive: true });
  await fs.writeFile(path.join(electronModuleRoot, 'index.js'), `
    const { EventEmitter } = require('node:events');
    const ipcRenderer = new EventEmitter();
    ipcRenderer.sent = [];
    ipcRenderer.invoke = async () => ({});
    ipcRenderer.send = (...args) => ipcRenderer.sent.push(args);
    module.exports = { ipcRenderer };
  `);
  const registerPreloadPath = path.resolve(
    __dirname,
    '..',
    'packages',
    'electron-inspector',
    'register-preload.cjs'
  );
  const script = `
    const electron = require('electron');
    global.document = {
      readyState: 'loading',
      addEventListener() {},
      removeEventListener() {}
    };
    global.window = {};
    require(${JSON.stringify(registerPreloadPath)});
    process.stdout.write(JSON.stringify({
      channels: electron.ipcRenderer.eventNames(),
      sent: electron.ipcRenderer.sent
    }));
  `;
  const result = await execFile(process.execPath, ['-e', script], {
    env: { ...process.env, NODE_PATH: path.join(tempRoot, 'node_modules') }
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    channels: ['dev-feedback-electron:start'],
    sent: [['dev-feedback-electron:ready']]
  });
});

test('one registration import preserves existing session preloads', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-register-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const electronModuleRoot = path.join(tempRoot, 'node_modules', 'electron');
  await fs.mkdir(electronModuleRoot, { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'package.json'), JSON.stringify({
    build: { productName: 'Fixture Product' }
  }));
  await fs.writeFile(path.join(electronModuleRoot, 'index.js'), `
    const { EventEmitter } = require('node:events');
    class FixtureApp extends EventEmitter {
      constructor() { super(); this.isPackaged = false; }
      isReady() { return true; }
      whenReady() { return Promise.resolve(); }
      getName() { return 'Fixture App'; }
      getAppPath() { return ${JSON.stringify(tempRoot)}; }
      getPath() { return ${JSON.stringify(tempRoot)}; }
    }
    const defaultSession = {
      preloads: ['/fixture/existing-preload.cjs'],
      getPreloads() { return [...this.preloads]; },
      setPreloads(value) { this.preloads = [...value]; }
    };
    const webContents = new EventEmitter();
    webContents.sent = [];
    webContents.isDestroyed = () => false;
    webContents.send = (...args) => webContents.sent.push(args);
    const fixtureWindow = new EventEmitter();
    fixtureWindow.webContents = webContents;
    fixtureWindow.isDestroyed = () => false;
    module.exports = {
      app: new FixtureApp(),
      session: { defaultSession },
      ipcMain: { handle() {}, removeHandler() {} },
      BrowserWindow: {
        getFocusedWindow() { return fixtureWindow; },
        getAllWindows() { return [fixtureWindow]; }
      },
      fixtureWindow
    };
  `);

  const registerPath = path.resolve(__dirname, '..', 'packages', 'electron-inspector', 'register.cjs');
  const script = `
    (async () => {
      const electron = require('electron');
      const { registerElectronInspector } = require(${JSON.stringify(registerPath)});
      const registration = await registerElectronInspector();
      const customSession = {
        preloads: ['/fixture/custom-preload.cjs'],
        getPreloads() { return [...this.preloads]; },
        setPreloads(value) { this.preloads = [...value]; }
      };
      electron.app.emit('session-created', customSession);
      const externallyOwnedSession = {
        preloads: [registration.preloadPath],
        getPreloads() { return [...this.preloads]; },
        setPreloads(value) { this.preloads = [...value]; }
      };
      electron.app.emit('session-created', externallyOwnedSession);
      let prevented = false;
      electron.fixtureWindow.webContents.emit('before-input-event', {
        preventDefault() { prevented = true; }
      }, {
        type: 'keyDown', code: 'Period', key: '>', meta: true, control: false,
        shift: true, alt: false, isAutoRepeat: false
      });
      const sentBeforeDispose = electron.fixtureWindow.webContents.sent.length;
      await registration.dispose();
      electron.fixtureWindow.webContents.emit('before-input-event', {
        preventDefault() { prevented = true; }
      }, {
        type: 'keyDown', code: 'Period', key: '>', meta: true, control: false,
        shift: true, alt: false, isAutoRepeat: false
      });
      process.stdout.write(JSON.stringify({
        preloads: electron.session.defaultSession.getPreloads(),
        customPreloads: customSession.getPreloads(),
        externallyOwnedPreloads: externallyOwnedSession.getPreloads(),
        sent: electron.fixtureWindow.webContents.sent,
        sentBeforeDispose,
        prevented
      }));
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = await execFile(process.execPath, ['-e', script], {
    env: { ...process.env, NODE_PATH: path.join(tempRoot, 'node_modules') }
  });
  const observed = JSON.parse(result.stdout);
  assert.deepEqual(observed.preloads, ['/fixture/existing-preload.cjs']);
  assert.deepEqual(observed.customPreloads, ['/fixture/custom-preload.cjs']);
  assert.equal(observed.externallyOwnedPreloads.length, 1);
  assert.match(observed.externallyOwnedPreloads[0], /register-preload\.cjs$/);
  assert.equal(observed.prevented, true);
  assert.equal(observed.sentBeforeDispose, 1);
  assert.deepEqual(observed.sent, [[
    'dev-feedback-electron:start',
    { hostId: 'fixture-app', hostName: 'Fixture Product' }
  ]]);
});

test('one registration import is inert in a packaged application', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-register-production-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const electronModuleRoot = path.join(tempRoot, 'node_modules', 'electron');
  await fs.mkdir(electronModuleRoot, { recursive: true });
  await fs.writeFile(path.join(electronModuleRoot, 'index.js'), `
    module.exports = {
      app: {
        isPackaged: true,
        whenReady() { throw new Error('packaged registration must not wait for readiness'); }
      },
      session: {
        defaultSession: {
          getPreloads() { return ['/fixture/production-preload.cjs']; },
          setPreloads() { throw new Error('packaged registration must not change preloads'); }
        }
      }
    };
  `);

  const registerPath = path.resolve(__dirname, '..', 'packages', 'electron-inspector', 'register.cjs');
  const script = `
    (async () => {
      const electron = require('electron');
      require(${JSON.stringify(registerPath)});
      await new Promise((resolve) => setImmediate(resolve));
      process.stdout.write(JSON.stringify(electron.session.defaultSession.getPreloads()));
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = await execFile(process.execPath, ['-e', script], {
    env: { ...process.env, NODE_PATH: path.join(tempRoot, 'node_modules') }
  });
  assert.deepEqual(JSON.parse(result.stdout), ['/fixture/production-preload.cjs']);
});

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

  assert.doesNotThrow(() => documentListeners.get('DOMContentLoaded')());
  assert.equal(listeners.has('dev-feedback-electron:start'), true);

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
  webContents.mainFrame = { routingId: 1 };
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

  const event = { sender: webContents, senderFrame: webContents.mainFrame };
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

  const historyPath = path.join(userDataRoot, 'dev-feedback-electron', 'forge3d-history.json');
  await fs.writeFile(historyPath, JSON.stringify({
    schemaVersion: 1,
    storageKey: 'dev-feedback-app-forge3d',
    items: [{
      ...saved.record,
      elementInfo: {
        ...saved.record.elementInfo,
        tag: 'div',
        role: '',
        text: 'legacy editor source that must not be exported',
        surroundingText: 'legacy terminal output that must not be exported'
      }
    }]
  }));

  const history = await handlers.get('dev-feedback-electron:history-list')(event);
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].note, 'Make the build state clearer');
  assert.equal(history.items[0].elementInfo.text, '');
  assert.equal(history.items[0].elementInfo.surroundingText, '');

  const exported = await handlers.get('dev-feedback-electron:history-export-text')(event);
  assert.equal(exported.count, 1);
  assert.match(exported.text, /Build button/);
  assert.match(exported.text, /Make the build state clearer/);
  assert.match(exported.text, /app:\/\/forge3d/);
  assert.match(exported.text, /width: 120, height: 44/);
  assert.equal(exported.path, undefined);

  await inspector.dispose();
});

test('main installer rejects child-frame IPC from an otherwise trusted window', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-electron-frame-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const handlers = new Map();
  const webContents = { mainFrame: { routingId: 1 } };
  const inspector = installElectronInspector({
    app: { getPath: () => tempRoot },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel)
    },
    getMainWindow: () => ({ webContents }),
    hostId: 'fixture',
    hostName: 'Fixture'
  });

  await assert.rejects(
    handlers.get('dev-feedback-electron:history-list')({
      sender: webContents,
      senderFrame: { routingId: 2 }
    }),
    /main-frame IPC/
  );
  await inspector.dispose();
});

test('main installer serializes simultaneous History captures', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-feedback-electron-race-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const handlers = new Map();
  const webContents = { mainFrame: { routingId: 1 } };
  const inspector = installElectronInspector({
    app: { getPath: () => tempRoot },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel)
    },
    getMainWindow: () => ({ webContents }),
    hostId: 'fixture',
    hostName: 'Fixture',
    clock: () => new Date('2026-08-24T12:00:00.000Z')
  });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const capture = handlers.get('dev-feedback-electron:capture-element');
  const draft = (selector, note) => ({
    selector,
    elementInfo: { tag: 'button', text: note, role: 'button' },
    position: { x: 1, y: 1 },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    note
  });

  await Promise.all([
    capture(event, draft('#first', 'First capture')),
    capture(event, draft('#second', 'Second capture'))
  ]);
  const history = await handlers.get('dev-feedback-electron:history-list')(event);
  assert.deepEqual(history.items.map((item) => item.selector), ['#first', '#second']);
  await inspector.dispose();
});
