# Safari development preview

The Safari build packages the same release files as the Chrome ZIP. There is no Safari fork of the extension code and no native component beyond Apple's converter template.

**Status: packaged and built unsigned; no Safari behavior has been observed.** The build has not been installed or run in Safari. A source and binary audit (below) indicates Safari 27.0.1 cannot restrict `storage.local` to extension pages. If that holds, the extension refuses to pick and says why. The extension menu's saved list, Copy all, and downloads are meant to keep working because the menu reads History directly, but that is unverified in Safari. Element capture needs a Safari release that ships the WebKit change below.

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
| `storage.local.setAccessLevel` keeps History out of content scripts | Inferred missing from Safari 27.0.1 (audit below, not observed). WebKit added it on 2026-08-11 ([bug 320697](https://bugs.webkit.org/show_bug.cgi?id=320697)). Before that, only `storage.session` has the method. | If the call is missing or rejects, the background refuses every request with "This browser cannot keep saved notes private…". The popup should show that message on **Pick an element**, and the keyboard shortcut does nothing. Unit-tested; unobserved in Safari. |
| `storage.session` holds capture sessions | Safari 16.4. Untrusted contexts can't read it by default, according to the WebKit change above. | Unchanged. The extension never relaxes it. |
| `sender.documentId` binds the note frame to one document | Safari 18.4 (MDN compatibility data) | If it is missing, the editor fails with "Missing editor document identity." |
| `scripting.executeScript` / `insertCSS` with `files`, `func`, `allFrames` | Safari 15.4; `InjectionResult.result` 17 | Unchanged. |
| `background.service_worker` + `importScripts` | Service worker 15.4 | Unchanged; unverified in a running Safari. |
| `optional_host_permissions`, `permissions.request` for embedded frames | 15.5. Safari asks through its own per-site access popover. | Unchanged; prompt flow unverified. |
| Clipboard after Save: the note frame copies this page's stored feedback (same page match and text as Copy all) with `navigator.clipboard.writeText`, then falls back to `document.execCommand('copy')`, after a message round trip | WebKit requires user activation for both. Whether it survives the await, and how Safari applies a page's `clipboard-write` Permissions Policy to the extension frame, is unverified. | If both writes fail, the note stays open, says it was saved but not copied, and Save becomes **Copy again**; the retry does not store the item twice. Verified in Chromium only. No native clipboard bridge or `clipboardRead`. |
| Note frame from `web_accessible_resources` | 15.4. The base URL changes on every launch. | Unchanged. `trustedPage` compares against `runtime.getURL`. |

The converter's `SafariWebExtensionHandler.swift` echoes native messages. The manifest has no `nativeMessaging` permission, so the extension can't reach it.

How the Safari 27 finding was inferred (no live extension was run): the WebKit commit changes `isPropertyAllowed("setAccessLevel")` from session-only to every storage area. This Mac's Safari 27.0.1 WebKit binary contains the legacy `SessionStorageAllowedInContentScripts` key but not the `StorageAccessLevels` key the change introduces. That shows the shipped WebKit predates it. It has not been observed in a running Safari.

## Validate in Safari

These steps are manual and change Safari settings, so the person testing does them:

1. Build and sign locally in Xcode with your own team, run the app once, and enable the extension in Safari Settings → Extensions.
2. Open a local test page and choose **Pick an element**. On Safari 27.0.1, the audit predicts the "cannot keep saved notes private" message and nothing saved. Also check that the menu still lists, copies, and downloads any existing History; that is expected but unverified.
3. On a Safari release with `storage.local.setAccessLevel`, run the Chromium checklist in `AGENTS.md`: Element picking, the note beside the element, the clipboard after each save (it should hold all of this page's feedback, and **Copy again** should appear if copying is blocked), and the menu list and downloads. Also check that `chrome.storage.local` is undefined in a content script.
