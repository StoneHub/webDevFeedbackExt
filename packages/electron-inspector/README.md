# @dev-feedback/electron

`@dev-feedback/electron` adds an explicit Element inspector, local History, and a plain-text `Copy History` action to an Electron development build.

The Host App keeps ownership of its windows and preload. The package owns its session preload, shortcut, DOM selection, Capture Record validation, app-local storage, and in-app History panel.

## Install

Install the development dependency from npm:

```sh
npm install --save-dev @dev-feedback/electron
```

Add this one line to the Electron main-process entry before creating any windows:

```js
if (!app.isPackaged) await import('@dev-feedback/electron/register')
```

That is the complete Host App integration. In a CommonJS entry, use:

```js
if (!app.isPackaged) require('@dev-feedback/electron/register')
```

Run the app and press `Cmd/Ctrl+Shift+.` in the window you want to inspect. The package appends its own preload without replacing existing session preloads and works across windows created after registration. It does not expose `ipcRenderer` or a new global to the Host App renderer. Keep `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.

The guard is deliberate. Packaged production builds do not register the inspector, and a production package can omit this development dependency.

## Trust contract

- Capture starts only when the developer presses `Cmd/Ctrl+Shift+.` in a registered Host App window.
- V1 captures one explicitly selected DOM element, its safe accessibility and feature signals, its rectangle, and the user's note.
- It does not collect broad parent text, source files, local paths, terminal buffers, build logs, existing clipboard contents, or network data.
- History stays under Electron `userData`.
- `Copy History` puts a readable Markdown summary on the clipboard only after the user clicks it. Paste it into any Codex task, issue, or document.
- Region capture, direct MCP transport, cloud sync, and Chrome extension loading are not part of V1.

## Maintainer release

From the repository root, install the locked toolchain and verify the package before publishing:

```sh
npm ci
npm test
npm run check
cd packages/electron-inspector
npm pack --dry-run
npm publish --access public
```
