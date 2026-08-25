# @dev-feedback/electron

`@dev-feedback/electron` adds an explicit Element inspector, local History, and a plain-text `Copy History` action to an Electron development build.

The Host App keeps ownership of its window and menu. The package owns DOM selection, Capture Record validation, app-local storage, and the in-app History panel.

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
- V1 captures one explicitly selected DOM element, its safe accessibility and feature signals, its rectangle, and the user's note.
- It does not collect broad parent text, source files, local paths, terminal buffers, build logs, existing clipboard contents, or network data.
- History stays under Electron `userData`.
- `Copy History` puts a readable Markdown summary on the clipboard only after the user clicks it. Paste it into any Codex task, issue, or document.
- Region capture, direct MCP transport, cloud sync, and Chrome extension loading are not part of V1.
