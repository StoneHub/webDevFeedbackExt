# Changelog

## 0.2.0

- Added the development-only `@flyingchangescode/dev-feedback-electron/register` entrypoint.
- Reduced Host App integration to one guarded import before window creation.
- Moved the inspector preload, multi-window shortcut, IPC trust checks, and local History lifecycle into the package.
- Preserved existing session preloads and removed package hooks during explicit disposal.
- Kept packaged applications inert and production artifacts free to omit the development dependency.
- Released the package under the MIT License.
