# Safari development preview

The Safari build packages the same release files as the Chrome ZIP. There is no Safari fork of the extension code and no native component beyond Apple's converter template.

**Status: packaged, not working in Safari 27.0.1.** Safari 27 cannot restrict `storage.local` to extension pages, so the extension refuses to pick and says why. The extension menu's saved list, Copy all, and downloads still work. Element capture needs a Safari release that ships the WebKit change below.

## Build

Requires Xcode with `xcrun safari-web-extension-converter`.

```sh
npm run safari:preview            # stage files, generate the Xcode project once
npm run safari:preview -- --build # also build unsigned and check the bundle
```

Everything is written under the ignored `.build/safari/`: `extension/` holds the staged release files, `Dev Feedback Capture/` the generated project, and `DerivedData/` the build. The project points at the staged files, so rerunning the script refreshes the next build. To regenerate the project, delete `.build/safari/`.

The script corrects Safari 27's converter, which writes the app identifier as `app.stonehub.Dev-Feedback-Capture` while the extension keeps `app.stonehub.dev-feedback-capture.Extension`. `--build` checks both identifiers, the Safari extension point, and that every packaged resource is byte-identical to the release file.

Signing stays local: choose your own development team in Xcode. No team or signing setting is committed.

## Safari API audit

| Boundary | Safari support | What this build does |
| --- | --- | --- |
| `storage.local.setAccessLevel` keeps History out of content scripts | Not in Safari 27.0.1. WebKit added it on 2026-08-11 ([bug 320697](https://bugs.webkit.org/show_bug.cgi?id=320697)). Before that, only `storage.session` has the method. | Background refuses every request with "This browser cannot keep saved notes private…". The popup shows that message on **Pick an element**. The keyboard shortcut does nothing. |
| `storage.session` holds capture sessions and picking runs | Safari 16.4. Untrusted contexts can't read it by default, according to the WebKit change above. | Unchanged. The extension never relaxes it. |
| `sender.documentId` binds the note frame to one document | Safari 18.4 (MDN compatibility data) | If it is missing, the editor fails with "Missing editor document identity." |
| `scripting.executeScript` / `insertCSS` with `files`, `func`, `allFrames` | Safari 15.4; `InjectionResult.result` 17 | Unchanged. |
| `background.service_worker` + `importScripts` | Service worker 15.4 | Unchanged; unverified in a running Safari. |
| `optional_host_permissions`, `permissions.request` for embedded frames | 15.5. Safari asks through its own per-site access popover. | Unchanged; prompt flow unverified. |
| Clipboard after Save (`navigator.clipboard.writeText` in the note frame, after a message round trip) | WebKit requires user activation. Whether it still holds after the await is unverified. | If the write fails, the toast says "Saved. Copy it from the extension menu." No native clipboard bridge or `clipboardRead`. |
| Note frame from `web_accessible_resources` | 15.4. The base URL changes on every launch. | Unchanged. `trustedPage` compares against `runtime.getURL`. |

The converter's `SafariWebExtensionHandler.swift` echoes native messages. The manifest has no `nativeMessaging` permission, so the extension can't reach it.

How the Safari 27 finding was checked: the WebKit commit changes `isPropertyAllowed("setAccessLevel")` from session-only to every storage area. This Mac's Safari 27.0.1 WebKit binary contains the legacy `SessionStorageAllowedInContentScripts` key but not the `StorageAccessLevels` key the change introduces. That shows the shipped WebKit predates it. It has not been observed in a running Safari.

## Validate in Safari

These steps are manual and change Safari settings, so the person testing does them:

1. Build and sign locally in Xcode with your own team, run the app once, and enable the extension in Safari Settings → Extensions.
2. Open a local test page and choose **Pick an element**. On Safari 27.0.1, the popup should show the "cannot keep saved notes private" message, and nothing should be saved.
3. On a Safari release with `storage.local.setAccessLevel`, run the Chromium checklist in `AGENTS.md`: Element picking, the note beside the element, the clipboard after each save, and the menu list and downloads. Also check that `chrome.storage.local` is undefined in a content script.
