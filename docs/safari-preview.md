# Safari development preview

**Status: installed and partly observed in Safari 27.0.1. Closing the note after Save failed in the installed build; the change below is built but not yet observed.**

A signed Debug 1.8.3 is installed in `/Applications`. After install, all 36 bundle files matched the build, the strict signature check passed, Safari had one registered copy, and the extension is enabled. Observed on the installed signed Debug builds, using a local test page and synthetic notes:

| Area | Observed |
| --- | --- |
| History through the native handler | A saved record was still listed after a page reload |
| Menu **Copy all** | Reported Copied; a paste matched the saved record, with the setup app closed |
| Picking and the note | Picking opens the note beside the element (manual test). After Save, the note stayed open saying it could not close |
| Copy on Save/Enter | Save stored the note and the native copy reported success; the pasted text was not checked |
| Markdown and JSON downloads, Safari restart, embedded frames, a second tab | Not checked |

Debug and Release also build unsigned. The JavaScript broker and the Swift bridge pass their tests with fakes. The remaining live checks are under [Validate in Safari](#validate-in-safari).

## How Safari differs

Safari 27.0.1 cannot close `storage.local` to content scripts: `setAccessLevel` exists only on `storage.session` until WebKit [bug 320697](https://bugs.webkit.org/show_bug.cgi?id=320697) ships. So on Safari, History never goes into `storage.local`. It goes to the app extension's native handler, in the sandbox container that web pages and content scripts cannot reach. The same handler writes the clipboard. The core extension files are shared with Chrome; Safari adds one bootstrap file and the native code.

| Piece | Chrome | Safari |
| --- | --- | --- |
| History | `storage.local`, restricted with `setAccessLevel('TRUSTED_CONTEXTS')`; picking refuses if that fails | `safari/platform.js` → `browser.runtime.sendNativeMessage` → `safari/NativeBridge.swift`, one JSON file per Safari profile under the app extension's Application Support |
| Clipboard after Save/Enter | Background returns the page's text; the note frame writes it (Clipboard API, then `execCommand('copy')`) | Background asks the native side to write the same text to `NSPasteboard`; the reply says whether the pasteboard accepted it |
| Copy all in the menu | Background returns the text; the menu writes it | Same native write as Save |
| Page controls (pick on/off, open the note, page state) | `tabs.sendMessage` to `content.js` | `scripting.executeScript` calling the fixed controller `content.js` defines in the content-script world; `frameId` 0 calls go to the top frame only |
| Menu page state | Background asks the page | Same, through the executeScript controller |
| Background | Service worker | Nonpersistent background page loading `shared.js`, `safari-platform.js`, `background.js` |
| Manifest | Unchanged | Adds `nativeMessaging` only; no host permissions or content scripts |

The note frame and the menu don't know which browser they're in. The background either returns `clipboard` text for them to write, or reports `copied`. A refused write leaves the note saved and open with **Copy again**. The retry repeats the same idempotent save, so nothing is stored twice.

### Native boundary

Apple documents that only background scripts and extension pages can call `sendNativeMessage`, never content scripts. Safari also delivers only to the extension's own handler and ignores the application id ([Messaging between the app and JavaScript](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)). Only `safari/platform.js` in the background page calls it. The handler accepts exactly four requests and fails closed on anything else:

| Request | Accepts |
| --- | --- |
| `history.read` / `history.usage` | a key starting `dev-feedback-` (≤ 4 KiB) |
| `history.write` | that key and a JSON array of objects (≤ 10 MiB); an empty array removes the key |
| `clipboard.write` | text ≤ 10 MiB; returns `copied: true/false` |

There is no clipboard read, no path or file argument, and no other command. The background still enforces who can do what: content scripts and embedded frames may only pick and stop; only the menu may list, copy, or delete; and only the note frame that owns a session may save. It also enforces the 500-item and 8 MiB budgets. Native adds a 10 MiB ceiling that never blocks shrinking. One actor serializes all History reads and writes. Copies are queued behind History writes, so the last copy holds the latest saves.

History is keyed by Safari profile (`SFExtensionProfileKey`, macOS 14+). Chrome History is untouched. Safari starts with empty History, because no Safari build ever saved notes.

## Build

Requires Xcode with `xcrun safari-web-extension-converter`.

```sh
npm run safari:preview              # stage files, generate the Xcode project, install the native handler
npm run safari:preview -- --build   # also build Debug and Release unsigned and check both bundles
npm run test:safari                 # native bridge checks (temporary folder, fake clipboard)
```

Everything is written under the ignored `.build/safari/`. `extension/` holds the staged files, `Dev Feedback Capture/` the generated project, and `DerivedData/` the builds. Staging copies the Chrome release ZIP, adds `safari-platform.js`, and adds Safari's manifest changes. The converter's echo handler is then replaced with `safari/NativeBridge.swift` + `safari/SafariWebExtensionHandler.swift`. If the staged file list changes, the project is regenerated. The script also corrects Safari 27's converter, which writes the app identifier as `app.stonehub.Dev-Feedback-Capture`.

`--build` checks the following in each bundle:

- Both bundle identifiers and the Safari extension point.
- Every packaged resource is byte-identical to the staged file.
- Permissions are exactly `storage, activeTab, scripting, nativeMessaging`, with no host permissions or content scripts.
- The background is the nonpersistent page.
- The native bridge is compiled in and the converter's echo handler is not.

The converter warns that `persistent` is unsupported. The key matches Apple's guidance for nonpersistent pages and the working Android OTP preview.

## Signed build and local install

Signing stays private. Put your own team in an ignored file, for example `.build/local-signing.xcconfig`:

```
DEVELOPMENT_TEAM = <your team id>
CODE_SIGN_STYLE = Automatic
```

```sh
npm run safari:preview -- --xcconfig .build/local-signing.xcconfig
node scripts/safari-install.cjs --build-settings .build/safari/build-settings.json
```

The signed build verifies its signature strictly and checks that both bundles are sandboxed. It writes the build settings for that exact product.

The installer works like this:

- It refuses a running app, an unsigned build, or a different team.
- It copies to `/Applications/Dev Feedback Capture.app` and compares every file.
- It keeps the previous copy until the new one verifies, and rolls back on failure.
- It registers the installed extension, then removes only this build product's registration so Safari doesn't list it twice. If that cleanup fails, it warns; the install itself stands.
- After an update, Safari can keep running the previous extension code: turn the extension off and on in Safari Settings → Extensions, then reload the test page.
- It does not enable the extension or grant website access.

## Closing the note

In Safari 27.0.1, messages from the background to the page stopped getting an answer once the note frame was open. Before that, the same messages worked: Pick, opening the note, and the menu's page check. The background's request to close the note came back empty in under a second, and the menu showed **Pick an element** instead of **Return to open note**. Current WebKit source targets frame 0 correctly, so the cause inside Safari is not known.

The note therefore closes itself. After the background forgets the session, the note frame sends `postMessage` to the page. The message carries only a random token that the content script put in the frame's URL, which the page cannot read. The content script accepts it only from its own note frame's window with the matching token, removes the frame, and resumes picking. It then asks the background for the toast text over the extension channel, so the page never sees the item count. A page that navigates the note frame elsewhere can at most close the note, as it already could by removing the overlay. If the note is still open two seconds later, it says to reload the page.

While a note is open, a **Pick an element** that the page does not confirm reports "Save or close the open note first."

## Page controls in Safari

On 3608b0d, after a clean refresh, **Pick an element** reported "The page did not confirm picking." The confirmation asked the page with `tabs.sendMessage`, and the answer never arrived. So Safari no longer uses `tabs.sendMessage` for page controls. `content.js` defines a controller in its content-script world, `DevFeedbackPage.control`. It accepts only `get-state`, `set-feedback-mode` and `show-capture-overlay`, and returns only that frame's picking and note state, never History or notes. Safari's background calls it with `scripting.executeScript` and a function argument. That is the pattern the background already used successfully to run the collector. Pick confirmation, opening the note, and the menu's page state go to the top frame only; on/off goes to every frame. Page scripts can't see the controller.

The menu now gets the page state from the background (`get-page-state`, menu only). Chrome keeps `tabs.sendMessage`.

Tests run the real `content.js` controller behind a simulated `executeScript` while `tabs.sendMessage` never answers. The Chromium exact-ZIP gate also checks that the controller answers an injected call and is hidden from page scripts. Neither proves Safari's behavior; that needs the live checks.

The error text the background builds is ASCII or escaped. Safari reads the generated background page as Latin-1, which garbled a × in an earlier error.

## Debug trace

A Debug native build adds `debug: true` to its replies. The background page then logs one `[dev-feedback]` line per request, page message, and native call. Each line holds a fixed action label and its outcome (`ok`, `refused`, `no-reply`, `timeout`, `error`, `copied=true/false`) and nothing else: no notes, URLs, clipboard text, or session ids. A request whose action is not one the extension handles is logged as `unknown`, never by its content. To read it, open Develop → Web Extension Background Content → Dev Feedback Capture. A Release build never sends the flag, so it never logs. A `request` line with no matching `reply` points to the request that stalled. **Pick an element** also logs each injection step (`inject content-type`, `styles`, `scripts`), then the top frame's `get-state` confirmation. When the page does not confirm picking, or the scripts do not load in time, the menu stays open with an error instead of closing.

## Validate in Safari

Steps 1 and 4 (list and Copy all only) have been observed; the rest have not. The person testing does these steps, because they change Safari settings:

1. Install as above, open the app once, enable **Dev Feedback Capture** in Safari Settings → Extensions, then quit the app.
2. On a local test page: **Pick an element**, pick, type a note, press Enter. The toast should say it copied; paste it elsewhere. The clipboard should hold this page's feedback, oldest first.
3. Pick again with a blank note, then Stop and Start, then pick again. Each paste should hold every note on the page in order. Repeat in a second tab on the same page.
4. Open the menu: the list, **Copy all**, Markdown, JSON, and delete should all work. Quit and reopen Safari: the list should still be there.
5. On a page that sends `Permissions-Policy: clipboard-write=()`, saving should still copy (the native write doesn't use the page's policy).
6. In a content script context (Web Inspector on the page, extension context), `chrome.storage.local.get(null)` should return no notes, and `browser.runtime.sendNativeMessage` should be unavailable.
7. Check that the History file exists only under `~/Library/Containers/app.stonehub.dev-feedback-capture.Extension/`.
8. Embedded frames: allowing a frame's site should prompt through Safari's own popover, and picking inside it should open the note.

Still open: how a refused pasteboard write shows up live (the retry path is tested with a fake writer only), and whether Safari unloading the nonpersistent background mid-save loses the copy.
