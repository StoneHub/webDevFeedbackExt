# Changelog

## Unreleased

- Detach window shortcuts from the captured webContents emitter after a BrowserWindow closes, avoiding access to Electron's destroyed window getter.
- Keep explicit disposal idempotent and remove window, app, session-preload and IPC hooks when a registered window has already been destroyed.

## 0.2.0

- Added the development-only `@flyingchangescode/dev-feedback-electron/register` entrypoint.
- Reduced Host App integration to one guarded import before window creation.
- Moved the inspector preload, multi-window shortcut, IPC trust checks, and local History lifecycle into the package.
- Preserved existing session preloads and removed package hooks during explicit disposal.
- Kept packaged applications inert and production artifacts free to omit the development dependency.
- Released the package under the MIT License.
