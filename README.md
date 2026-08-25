# Dev Feedback Capture

Turn browser-visible feedback into a local, buildable handoff. Dev Feedback Capture focuses on four connected surfaces: Element capture, Region/PDF capture, History, and one explicit Agent Handoff.

> The Chrome Web Store and GitHub release records in this repository describe earlier submissions. The active product direction is the browser capture core documented here.

- `Element` capture records a selected DOM element with selectors, visible text, styles, and a requested change.
- `Region` capture records a visible page or PDF region with a crop, annotations, source context, and acceptance checks.
- `History` keeps saved Capture Records together on the device and provides review and export actions.
- `Send to Codex` is the named Agent Handoff: export the current History through the browser, let the local MCP companion import the newest valid handoff from its configured Downloads inbox, and keep implementation and verification as separate agent steps.

Feedback stays local until you explicitly export it. There is no cloud sync, hosted AI connection, automatic browser control, or Electron injection in the browser extension.

## Features

- Element capture with selector, text, style, position, and note metadata
- Region capture for normal pages, hosted PDFs, and local PDFs when file access is enabled
- Crop, arrow, rectangle, ellipse, numbered pin, text, blur/redact, color, undo, and redo tools for Region captures
- DOM-linked vector annotations with selector fallbacks, roles, surrounding text, geometry, and parent-layout context when the source DOM is available
- Optional acceptance checks plus browser, viewport, scroll, zoom, DPR, and source metadata
- Works on arbitrary sites through explicit user-triggered activation
- Extension-owned History page that works even when the source page cannot accept injected UI
- One downloadable AI Bundle ZIP plus standalone JSON and self-contained HTML reports
- Project-scoped local MCP companion over stdio; no cloud or localhost service
- Copyable Markdown and implementation-prompt exports
- Minimal permissions and user-triggered activation

## Installation

### Chrome Web Store

Install the current public release from the [Chrome Web Store](https://chromewebstore.google.com/detail/dev-feedback-capture/hhdmfaaplpiokafjieefpgoppckijafc), then pin Dev Feedback Capture for quick access.

### GitHub Release ZIP fallback

1. Download the latest `dev-feedback-capture-v<version>.zip` asset from [GitHub Releases](https://github.com/StoneHub/webDevFeedbackExt/releases).
2. Unzip the file.
3. Open `chrome://extensions/` or `edge://extensions/`.
4. Enable Developer Mode.
5. Click `Load unpacked` and select the unzipped extension folder.
6. Optional for local PDFs: enable `Allow access to file URLs` on the extension details page.

### Source Checkout

Use this path when developing the extension or reviewing source changes:

1. Clone or download this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable Developer Mode.
4. Click `Load unpacked` and select the `webDevFeedbackExt` folder.

## Usage

### Element Mode

1. Open the extension popup on any `http`, `https`, or `file` page you want to inspect.
2. Leave the mode switch on `Element`.
3. Click `Start Element Mode` or use `Ctrl+Shift+F` (`Command+Shift+F` on macOS).
4. Hover and click a page element.
5. Add your note in the modal and save it.
6. Drag the compact capture chip along the viewport edge, then use **⌃** to expand the saved-item list and **⌄** to collapse it again.

### Region Mode

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. Use Crop to define the evidence area.
5. Add arrows, shapes, numbered pins, text, or blur/redact marks. Undo and redo operate on the visual spec.
6. Describe the requested change and optionally add one acceptance criterion per line.
7. Save the spec to local history.

The cropped image, viewport rectangle, and source context are saved into the same local history as element captures. Open `History` from the popup to review captures from any supported source, including PDFs and pages where Element mode is unavailable.

### History and Agent Handoff

Open `History` from the popup to review captures from any supported source. Choose `Send to Codex` to download the current History as an explicit handoff. When the browser download location matches the MCP companion's configured Downloads inbox, the companion discovers the newest valid handoff and imports it into the target project's ignored `.dev-feedback` sidecar without manual file movement.

The handoff contract is deliberately explicit:

1. The extension captures and saves a Capture Record.
2. The user sends the current History to Downloads.
3. MCP imports the newest valid handoff and exposes its records, evidence, and implementation brief.
4. The coding agent implements the requested change with its normal project tools.
5. The agent records implementation and verification separately.

No step gives the extension browser control, source-editing authority, or an automatic cloud bridge.

## Data Model

Stored feedback items use a discriminated shape:

- `type: "element"` items include selector, element information, position, request text, and source context.
- `type: "region"` items include one evidence crop, vector annotations, DOM anchors when available, acceptance criteria, and page context.
- Older Capture Records remain loadable and are normalized without inventing missing evidence or mutations. Historical Visual and Add records remain compatible as records even though those creation surfaces are not part of the active product.

Annotated PNGs are rendered locally when the AI Bundle is built. Large image data stays in local extension storage until you export or clear History.

## Export Formats

- `Send to Codex` writes the current History as a local handoff payload for MCP import.
- `Download AI Bundle` creates `prompt.md`, `feedback.json`, `page-context.json`, available evidence PNGs, and `report.html` in one local ZIP.

- The `Send to Codex` JSON includes the full saved payload, including region image data URLs, for explicit local import.
- `Download HTML Report` creates a self-contained review with embedded region images.
- `Copy Markdown` creates a readable text review for issues or docs.
- `Copy AI Prompt` creates numbered implementation instructions from the saved requirements, anchors, and acceptance checks. Download the AI Bundle when images are needed.

## Local MCP Agent Companion

The Node MCP companion under `mcp/` imports an explicit History export from a configured local inbox into the target project's ignored `.dev-feedback` sidecar. It can list and get feedback, read evidence resources, create agent-authored feedback, build an implementation brief, and record revision-checked status.

The companion does not read Chromium's internal storage, open a network port, control the browser, execute shell commands, or edit source code. The connected agent uses its normal browser and coding tools. Tool results and evidence are still delivered to that MCP client, so cloud-backed clients may transmit captured data under their provider policies. See [docs/mcp-local-agent.md](docs/mcp-local-agent.md) for setup and the trust boundary.

## Electron Inspector developer package

Electron apps cannot use Chrome's extension toolbar or attach this browser extension from Chrome. Developers can instead install the experimental `@dev-feedback/electron` package under `packages/electron-inspector/` in their own development build.

The first slice provides a Host App-owned `Inspect this app` menu action, Element capture in a package-owned overlay, local History under Electron `userData`, and the same explicit Downloads handoff used by the MCP companion. The Host App adds one main-process installer and one preload hook. The package does not require React and does not expose Electron IPC to the Host App renderer.

This package is ready for local Forge3D dogfood but is not published to a package registry. See [packages/electron-inspector/README.md](packages/electron-inspector/README.md) for the install and trust contract.

## Permissions

The extension requests:

- `storage` for local history
- `activeTab` for temporary, user-invoked access to the current tab
- `scripting` to inject the in-page capture UI and history panel only when requested

The extension does not use static host permissions, always-on content scripts, telemetry, or network sync. Region captures can include visible page content in screenshot data URLs; those crops stay in local extension storage until the user clears history or removes the extension.

## PDF Notes

- Hosted PDFs should work through Region mode because the capture flow is screenshot-based.
- Local `file://` PDFs may require enabling `Allow access to file URLs`.
- Region mode captures only the visible viewport in v1, not off-screen PDF pages.

## Development

### Project Files

- `manifest.json`: Manifest V3 configuration
- `background.js`: runtime injection and Region-capture orchestration
- `content.js`: in-page panel and element capture
- `mcp/`: project-scoped stdio MCP companion and filesystem sidecar store
- `capture.html` / `capture.js`: screenshot region selection editor
- `popup.html` / `popup.js`: mode switch, current-tab actions, History entry point, and handoff action
- `history.html` / `history.js`: extension-owned history review and export controls
- `ai-bundle.js`: local, dependency-free AI Bundle assembly and ZIP creation
- `shared.js`: shared helpers, legacy normalization, and export formatting
- `styles.css`: injected in-page UI styles
- `docs/store-monetization-readiness.html`: local store identity, listing, privacy, and future paid-product decision artifact

### Local Checks

- `npm test`
- `npm run check`
- `npm run package`

### Release Process

1. Confirm `package.json` and `manifest.json` versions match.
2. Run `npm test`, `npm run check`, and `npm run package`. `npm test` covers both extension and MCP contracts.
3. Complete the package, listing, and manual unpacked-extension gates in `docs/manual-release-checklist.md`, then create and push the matching version tag when publishing a GitHub Release.
4. The release workflow builds `dist/dev-feedback-capture-v<version>.zip` and publishes it as a GitHub Release asset.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Limitations

- Element mode depends on DOM/script injection and is not intended for browser-internal surfaces.
- Historical Visual and Add Capture Records may still be read and normalized, but those creation surfaces are not active product workflows.
- Region mode stores one crop plus vector metadata in local storage; very large capture histories will still increase storage usage.
- Blur/redact masks are applied to the saved crop before the transient viewport screenshot is discarded, so AI Bundle “before” evidence does not restore redacted pixels.
- DOM annotation anchors are best-effort and are unavailable for protected browser pages, PDFs without an accessible DOM, cross-origin frames, and pages that move after capture.
- Region mode captures the current viewport only, not full-page stitched screenshots.
- Cross-origin iframe DOM capture remains limited by browser security rules.
- Chrome's extension menu cannot attach this browser extension to an arbitrary already-running Electron app. Electron developers must explicitly install the separate Electron Inspector package in their Host App.

## Roadmap

- Add verification against saved acceptance criteria
- Add full-page or multi-step PDF region capture
- Add user-triggered import back into extension History
- Dogfood the Element-only Electron Inspector in Forge3D, then add Region capture through Electron's `webContents.capturePage`
- Evaluate a native-messaging handoff only after the Downloads-inbox workflow proves useful and its permission/install boundary is defined

## License

This repository is source-visible for portfolio, review, and evaluation purposes only. All rights are reserved unless Monroe Stone grants written permission otherwise. See [LICENSE](LICENSE).
