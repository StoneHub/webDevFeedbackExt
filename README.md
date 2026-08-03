# Dev Feedback Capture

Pick and annotate browser elements or regions, propose new content blocks, then copy AI-ready prompts or export local visual change specs for Codex, Claude Code, Cursor, or another developer. Dev Feedback Capture supports four evidence-rich workflows:

> [Chrome Web Store v1.7 is public](https://chromewebstore.google.com/detail/dev-feedback-capture/hhdmfaaplpiokafjieefpgoppckijafc). This source checkout prepares the v1.7.2 Add Content update; the latest GitHub Release ZIP remains v1.2.0 as a manual fallback.

- `Element` mode injects a lightweight in-page UI so you can click DOM elements and save selectors, styles, and notes.
- `Visual` mode lets you directly drag and resize one live DOM element, records original versus proposed intent, and restores the page after Save or Cancel.
- `Add` mode anchors a proposed text, image, list, or HTML/embed frame to an existing element and saves a structured insert request without persisting the preview into the page.
- `Region` mode captures the visible viewport and compiles a crop, vector annotations, best-effort DOM anchors, requested change, and acceptance checks into one visual change spec.

All feedback stays local in extension storage. Open History to review captures, use the legacy standalone exports, or download one AI Bundle with instructions, structured data, page context, and before/annotated images.

## Features

- Element capture with selector, text, styles, and note metadata
- Pointer-first Visual Edit previews with drag-to-move, corner-handle resize, undo, redo, and reset
- Original/proposed evidence plus explicit requested-mutation data; the live page is always restored
- Reversible Add Content previews for text, image placeholders, lists, and safe HTML/embed frame placeholders
- Visual Change Spec editor with crop, arrow, rectangle, ellipse, pin, text, blur/redact, color, undo, and redo
- DOM-linked vector annotations with selector fallbacks, roles, surrounding text, geometry, and parent-layout context when the source DOM is available
- Optional acceptance checks plus browser, viewport, scroll, zoom, DPR, and source metadata
- Works on arbitrary sites through explicit user-triggered activation
- PDF-friendly screenshot workflow for local and hosted PDFs
- Extension-owned History page that works even when the source page cannot accept injected UI
- One downloadable AI Bundle ZIP plus standalone JSON and self-contained HTML reports
- Project-scoped local MCP companion over stdio; no cloud or localhost service
- Copyable Markdown and implementation-prompt exports
- Expanded-by-default in-page capture list that stays anchored to the viewport edge when collapsed and dragged

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

### Visual Edit Mode

1. Open an injectable webpage and choose `Visual` in the popup.
2. Start Visual Edit and select one element.
3. Drag the selected outline to move the element, or drag its corner handle to resize it. Use Undo, Redo, or Reset as needed.
4. Add the requested implementation change and optional acceptance criteria.
5. Save the spec, or Cancel to discard it. Either path restores the original live page.

Visual Edit does not change source files, persist mutations into the page, or replay saved edits automatically. It records intent so a developer or coding agent can implement the change in the correct source layer.

### Add Content Mode

1. Open an injectable webpage and choose `Add` in the popup.
2. Click the existing element that should anchor the new content.
3. Choose Text, Image placeholder, List, or HTML/embed frame, then choose before, after, inside-start, or inside-end placement when the anchor supports children.
4. Add basic filler, an optional heading, and what the content should communicate or support.
5. Save the insert spec, or Cancel to remove the preview. Either path restores the original live page.

The HTML/embed frame is intentionally a non-executable placeholder. Add Content never runs supplied markup, scripts, or remote embeds; it records the requested content and placement for implementation in source.

## Data Model

Stored feedback items use a discriminated shape:

- `type: "element"` items include selector, element info, and position.
- v1.5 element items may also include a sanitized `changeRequest`, original/proposed element state, and local evidence images. Older element items normalize as visual suggestions without invented mutations.
- Add Content items remain compatible `type: "element"` records and use a sanitized `insert` mutation containing an anchor, placement, content type, filler, support intent, and optional acceptance checks.
- `type: "region"` items include one evidence crop, vector annotations, DOM anchors when available, acceptance criteria, and page context. Annotated PNGs are rendered locally when the AI Bundle is built.

Older element-only captures are still loaded and normalized automatically.

## Export Formats

- `Download AI Bundle` creates `prompt.md`, `feedback.json`, `page-context.json`, before/proposed/annotated PNG evidence when available, and `report.html` in one ZIP. The bundle is assembled locally.

- `Download JSON for MCP` includes the full saved payload, including region image data URLs, for explicit local import.
- `Download HTML Report` creates a self-contained review with embedded region images.
- `Copy Markdown` creates a readable text review for issues or docs.
- `Copy AI Prompt` creates numbered implementation instructions from the saved requirements, anchors, and acceptance checks. Download the AI Bundle when images are needed.

## Local MCP Agent Companion

v1.6 includes a separate Node MCP server under `mcp/`. A local coding agent can import an explicit History JSON export into the target project's ignored `.dev-feedback` sidecar, then list/get feedback, read evidence resources, create agent-authored feedback, build an implementation brief, and record revision-checked status.

The companion does not read Chromium's internal storage, open a network port, control the browser, execute shell commands, or edit source code. The connected agent uses its normal browser and coding tools. Tool results and evidence are still delivered to that MCP client, so cloud-backed clients may transmit captured data under their provider policies. See [docs/mcp-local-agent.md](docs/mcp-local-agent.md) for setup and the trust boundary.

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
- `background.js`: runtime injection and region-capture session orchestration
- `content.js`: in-page panel and element capture
- `visual-edit.js`: dependency-free reversible mutation engine used by Visual Edit Mode
- `content-proposal.js`: dependency-free safe placeholder builder used by Add Content Mode
- `mcp/`: project-scoped stdio MCP companion and filesystem sidecar store
- `capture.html` / `capture.js`: screenshot region selection editor
- `popup.html` / `popup.js`: mode switch, current-tab actions, and History entry point
- `history.html` / `history.js`: extension-owned history review and export controls
- `ai-bundle.js`: local, dependency-free AI Bundle assembly and ZIP creation
- `shared.js`: shared helpers, normalization, and export formatting
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
- Visual Edit is intentionally limited to direct move and resize of one normal-page DOM target. Text, visibility, order, style, matching, alignment, cross-origin frames, arbitrary CSS, responsive breakpoints, animation, and reparenting are outside this release.
- Add Content previews basic content structure and placement only. It does not generate production markup, upload image assets, load remote embeds, or execute user-supplied HTML.
- Region mode stores one crop plus vector metadata in local storage; very large capture histories will still increase storage usage.
- Blur/redact masks are applied to the saved crop before the transient viewport screenshot is discarded, so AI Bundle “before” evidence does not restore redacted pixels.
- DOM annotation anchors are best-effort and are unavailable for protected browser pages, PDFs without an accessible DOM, cross-origin frames, and pages that move after capture.
- Region mode captures the current viewport only, not full-page stitched screenshots.
- Cross-origin iframe DOM capture remains limited by browser security rules.

## Roadmap

- Add verification against saved acceptance criteria
- Add full-page or multi-step PDF region capture
- Add user-triggered import back into extension History
- Add optional provider-specific AI handoff after the provider/auth shape is defined

## License

This repository is source-visible for portfolio, review, and evaluation purposes only. All rights are reserved unless Monroe Stone grants written permission otherwise. See [LICENSE](LICENSE).
