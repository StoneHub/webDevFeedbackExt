# @dev-feedback/electron

`@dev-feedback/electron` adds an explicit Element inspector, local History, and a `Send to Codex` handoff to an Electron development build.

The Host App keeps ownership of its window and menu. The package owns DOM selection, Capture Record validation, app-local storage, and the Downloads handoff.

## Install from this checkout

Build a local package:

```sh
cd packages/electron-inspector
npm pack
```

Install the resulting archive in the Electron app:

```sh
npm install --save-dev /absolute/path/to/dev-feedback-electron-<version>.tgz
```

Registry publication is not part of the first dogfood slice.

## Main process

Install after Electron is ready and keep the returned module available to the Host App menu builder:

```js
import { installElectronInspector } from '@dev-feedback/electron/main'

const feedbackInspector = installElectronInspector({
  app,
  ipcMain,
  getMainWindow: () => mainWindow,
  hostId: 'forge3d',
  hostName: 'Forge3D',
  inboxRoot: path.join(app.getPath('downloads'), 'Forge3D'),
})

const menuItem = feedbackInspector.menuItem()
```

Add `menuItem` to a Host App-owned menu. The item is labeled `Inspect this app` and uses `CmdOrCtrl+Shift+.`. The shortcut avoids the find-command collision common in Electron editors.

## Preload

Call the preload hook from the Host App's existing preload source:

```js
const { installElectronInspectorPreload } = require('@dev-feedback/electron/preload')

installElectronInspectorPreload({ ipcRenderer })
```

Electron's sandboxed preload cannot load arbitrary npm modules at runtime. Bundle the Host App preload source and this hook into one CommonJS preload file, keeping `electron` external. For example:

```sh
esbuild electron/preload.cjs --bundle --platform=node --format=cjs \
  --external:electron --outfile=electron/preload.bundle.cjs
```

Point `BrowserWindow.webPreferences.preload` at the bundle. The hook does not expose `ipcRenderer` or a new global to the Host App renderer. Keep `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.

## Trust contract

- Capture starts only from the Host App menu or another visible call to `inspect()`.
- V1 captures one DOM element and the user's note.
- Source files, local paths, terminal text, build logs, clipboard contents, and network data are not collected automatically.
- History stays under Electron `userData`.
- `Send to Codex` writes the existing standalone History JSON envelope into the configured Downloads inbox. The local MCP companion imports it as a separate explicit step.
- Region capture, direct MCP transport, cloud sync, and Chrome extension loading are not part of V1.
