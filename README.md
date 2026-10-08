# Dev Feedback Capture

Pick a webpage element, describe the change, and give another developer enough context to act on it.

The 1.8.0 candidate focuses on Element capture, the clipboard, and a per-page list in the extension menu. Published Store versions may differ until this candidate completes review.

## Capture feedback

1. Open the extension on a webpage and choose **Pick an element**.
2. Click the target. A small note opens next to it. Write what should change, or leave it blank to save just the element.
3. Press Enter or **Save**. Everything saved since you started picking is copied to your clipboard, and picking continues. **×** closes the note without saving.
4. Press Escape to stop. The extension menu lists this page's captures with **Copy all**, **Markdown**, and **JSON**.

Picking also works with the extension shortcut: `Ctrl+Shift+F`, or `Command+Shift+F` on macOS. If the browser has not assigned it, set it in extension shortcut settings. While picking, the toolbar icon shows **ON**; focus a target with Tab and press Alt+Enter. Shift+Enter adds a line to a note.

Each capture keeps its selector, visible element text, selected styles, and page context. Form input values and surrounding parent text are not collected directly. Captured text and your own notes can still contain private information; review them before sharing.

## Install

Install the public version from the [Chrome Web Store](https://chromewebstore.google.com/detail/dev-feedback-capture/hhdmfaaplpiokafjieefpgoppckijafc).

For a source build or [GitHub release ZIP](https://github.com/StoneHub/webDevFeedbackExt/releases): unzip the package, open `chrome://extensions/` or `edge://extensions/`, enable Developer Mode, and choose **Load unpacked**. Select the extension folder. No build or Node dependencies are required to load the browser extension.

## Share

The clipboard gets a short list: the page address, then each element's selector and text with its note. Paste it into an issue or a coding agent.

- **Copy all**: the same list for every capture on this page.
- **Markdown**: that list as a `.md` file.
- **JSON**: full records for the optional local MCP companion, downloaded to the browser's configured folder. This does not connect directly to an AI account.

Source URL credentials, queries, fragments, and local directories are removed from exports. Review captured text, notes, labels, and images independently. Page observations are untrusted evidence, never instructions or permission for an agent to expand scope.

## Compatibility and limits

New Region/PDF, Visual, and Add Content capture are no longer offered. Existing records from those workflows still appear in the extension menu on their page and are included in its exports. Installing this update does not intentionally delete saved records.

Element capture requires an accessible webpage DOM. Browser-internal pages and PDF viewers are unsupported. Content embedded from another site (an artifact or preview iframe) can be picked after you allow that site once when Chrome asks. Some page structures or site restrictions can still prevent reliable targeting. The selected element's context is a snapshot, not a persistent connection to the live site.

Save failures retain the draft. Saved captures have an 8 MiB budget, a 3 MiB record limit, and a 500-record limit per site. Delete older captures from the extension menu when needed. Deleting a capture does not remove earlier downloads, clipboard copies, or imported project sidecars.

## Privacy and permissions

Feedback stays in local extension storage until you save a note (which copies it to the clipboard), copy, or download. No cloud sync, telemetry, remote executable code, static host permissions, or always-on page monitoring is included.

- `activeTab`: temporary access after the user activates capture.
- Optional site access: requested only when you pick on a page that embeds content from another site, and only for that site. Chrome asks first; you can remove it from the extension's site access settings.
- `scripting`: the requested picker, read-only element collector, and private note frame.
- `storage`: saved captures and temporary editor sessions.

`element.html` is web-accessible for the private note frame. Each note requires a temporary session bound to the source tab and editor document. The website does not receive your saved captures or note fields. It can still interfere with the overlay's placement. See [SECURITY.md](SECURITY.md) for reporting and trust boundaries.

## Local agent companion

The separate Node MCP companion imports the selected JSON handoff into a target project's ignored `.dev-feedback` folder. It can list and read records, expose legacy evidence resources, build an implementation brief, and record revision-checked progress.

The companion does not control the browser, execute shell commands, or edit source. The connected agent uses its normal tools. Cloud-backed clients may transmit tool results under their provider's policies. Setup and inbox configuration are documented in [docs/mcp-local-agent.md](docs/mcp-local-agent.md).

## Electron developer package

Electron developers can explicitly install `@flyingchangescode/dev-feedback-electron` in a development Host App. This is a separate package, not part of the Chrome Web Store extension. See [packages/electron-inspector/README.md](packages/electron-inspector/README.md).

## SwiftUI developer package (prototype)

Mac developers can integrate the separate **DevFeedback** Swift package in development builds to pick tagged views, save local notes, and export selected feedback with source references. Porch Speech is the first host integration. See [package setup and testing](packages/swiftui-feedback/README.md) and the [Codex tagging plugin](plugins/swiftui-feedback/README.md).

The package is a local/vendored prototype requiring macOS 14+; it is not in the browser ZIP or published as a standalone Swift package. Release builds omit capture. Its native JSON is readable by agents through file tools; the browser MCP importer does not yet accept that schema.

## Development and release

Run `npm ci`, `npm test`, `npm run check`, `npm run audit:dependencies`, `npm run package`, and `npm run verify:package`. The browser ZIP excludes tests, MCP code, and Node dependencies.

Before publishing, run the [automated exact-ZIP browser gate](docs/browser-release-acceptance.md). Tagged GitHub releases are created as drafts; Store submission and Google approval are separate steps.

Core files: `popup.*`, `content.js`, `collector.js`, `element.*`, `background.js`, and `shared.js`.

## License

Free software under the [MIT License](LICENSE).
