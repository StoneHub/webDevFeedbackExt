# Dev Feedback Capture

Pick a webpage element, describe the change, and give another developer enough context to act on it.

The 1.8.0 candidate focuses on Element capture, local History, and explicit selected exports. Published Store versions may differ until this candidate completes review.

## Capture feedback

1. Open the extension on a webpage and choose **Pick an element**.
2. Click the target. A compact private note editor opens beside the page.
3. Describe the requested change. Add optional acceptance checks and inspect the captured details.
4. Choose **Save note**, or **Save & pick next** to review several elements.
5. Open **History & export** in an on-page panel to edit notes and acceptance checks, select records, and review the export preview before sharing.

Picking also works with the extension shortcut: `Ctrl+Shift+F`, or `Command+Shift+F` on macOS. If the browser has not assigned it, set it in extension shortcut settings. While picking, focus a target with Tab and press Alt+Enter. Escape stops picking or offers to discard a draft. In the editor, Cmd/Ctrl+Enter saves; adding Shift starts the next pick.

Each note keeps its selector, visible element text, selected styles, page context, and acceptance checks. Form input values and surrounding parent text are not collected directly. Captured text and your own notes can still contain private information; review them before sharing.

## Install

Install the public version from the [Chrome Web Store](https://chromewebstore.google.com/detail/dev-feedback-capture/hhdmfaaplpiokafjieefpgoppckijafc).

For a source build or [GitHub release ZIP](https://github.com/StoneHub/webDevFeedbackExt/releases): unzip the package, open `chrome://extensions/` or `edge://extensions/`, enable Developer Mode, and choose **Load unpacked**. Select the extension folder. No build or Node dependencies are required to load the browser extension.

## Review and share

History opens over the working page without creating a tab. On restricted pages, it opens inside the extension menu. History keeps notes after the source page closes. Editing a note updates its request and acceptance checks while preserving the original target and capture context.

Filters clear selection. **Select shown** selects only the displayed records. All export actions preview the same selected snapshot; hidden records stay out. Deletion removes only the exact selected or shown records.

- **Copy AI Prompt**: implementation instructions with source context and acceptance checks.
- **Copy Markdown**: notes for an issue or review document.
- **Download HTML Report**: a self-contained report.
- **Download AI Bundle**: structured records, prompt, report, and any legacy evidence images.
- **Send to Codex**: JSON downloaded to the browser's configured folder for the optional local MCP companion. This does not connect directly to an AI account.

Source URL credentials, queries, fragments, and local directories are removed from exports. Review captured text, notes, labels, and images independently. Page observations are untrusted evidence, never instructions or permission for an agent to expand scope.

## Compatibility and limits

New Region/PDF, Visual, and Add Content capture are no longer offered. Existing records from those workflows remain readable and exportable in History. Installing this update does not intentionally delete saved records.

Element capture requires an accessible webpage DOM. Browser-internal pages and PDF viewers are unsupported. Some embedded frames, page structures, or site restrictions can prevent reliable targeting. The selected element's context is a snapshot, not a persistent connection to the live site.

Save failures retain the draft. History has an 8 MiB budget, a 3 MiB record limit, and a 500-record limit per site. Export and delete older records when needed. Deleting History does not remove earlier downloads, clipboard copies, or imported project sidecars.

## Privacy and permissions

Feedback stays in local extension storage until an explicit export. No cloud sync, telemetry, remote executable code, static host permissions, or always-on page monitoring is included.

- `activeTab`: temporary access after the user activates capture.
- `scripting`: the requested picker, read-only element collector, and private note frame.
- `storage`: local History and temporary editor sessions.

`element.html` and `history.html` are web-accessible for private frames. Embedded editors require a temporary session bound to the source tab and editor document. The website does not receive your saved History or note fields. It can still interfere with the overlay's placement. See [SECURITY.md](SECURITY.md) for reporting and trust boundaries.

## Local agent companion

The separate Node MCP companion imports the selected JSON handoff into a target project's ignored `.dev-feedback` folder. It can list and read records, expose legacy evidence resources, build an implementation brief, and record revision-checked progress.

The companion does not control the browser, execute shell commands, or edit source. The connected agent uses its normal tools. Cloud-backed clients may transmit tool results under their provider's policies. Setup and inbox configuration are documented in [docs/mcp-local-agent.md](docs/mcp-local-agent.md).

## Electron developer package

Electron developers can explicitly install `@flyingchangescode/dev-feedback-electron` in a development Host App. This is a separate package, not part of the Chrome Web Store extension. See [packages/electron-inspector/README.md](packages/electron-inspector/README.md).

## Development and release

Run `npm ci`, `npm test`, `npm run check`, `npm run audit:dependencies`, `npm run package`, and `npm run verify:package`. The browser ZIP excludes tests, MCP code, and Node dependencies.

Before publishing, follow [docs/manual-release-checklist.md](docs/manual-release-checklist.md). Tagged GitHub releases are created as drafts; Store submission and Google approval are separate steps.

Core files: `popup.*`, `content.js`, `collector.js`, `element.*`, `background.js`, `history.*`, `shared.js`, and `ai-bundle.js`.

## License

Free software under the [MIT License](LICENSE).
