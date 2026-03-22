# Dev Feedback Capture

Dev Feedback Capture is a Chromium extension for collecting structured UI feedback from live pages, PDFs, and other browser-visible surfaces. It supports two capture modes:

- `Element` mode injects a lightweight in-page UI so you can click DOM elements and save selectors, styles, and notes.
- `Region` mode captures the visible viewport, opens a screenshot editor, and lets you draw a crop around any area, including browser-rendered PDFs.

All feedback stays local in extension storage and can be re-exported later as JSON, Markdown, or an AI-oriented prompt.

## Features

- Element capture with selector, text, styles, and note metadata
- Region capture with cropped screenshot, viewport rectangle, and note metadata
- Works on arbitrary sites through explicit user-triggered activation
- PDF-friendly screenshot workflow for local and hosted PDFs
- Local history with re-export support
- JSON, Markdown, and AI prompt clipboard exports
- Draggable in-page history panel for injected pages

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable Developer Mode.
4. Click `Load unpacked` and select the `webDevFeedbackExt` folder.
5. Optional for local PDFs: enable `Allow access to file URLs` on the extension details page.

## Usage

### Element Mode

1. Open the extension popup on any `http`, `https`, or `file` page you want to inspect.
2. Leave the mode switch on `Element`.
3. Click `Start Element Mode` or use `Ctrl+Shift+F`.
4. Hover and click a page element.
5. Add your note in the modal and save it.

### Region Mode

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. In the editor tab, drag a box over the screenshot.
5. Add your note and save it.

The cropped image, viewport rectangle, and source context are saved into the same page history as element captures.

## Data Model

Stored feedback items use a discriminated shape:

- `type: "element"` items include selector, element info, and position.
- `type: "region"` items include viewport rectangle, screenshot crop, source kind, and tab context.

Older element-only captures are still loaded and normalized automatically.

## Export Formats

- `Copy JSON` includes the full saved payload, including region image data URLs.
- `Copy Markdown` creates a readable review document for issues or docs.
- `Copy AI Prompt` creates numbered instructions that refer to the saved crops in extension history.

## Permissions

The extension requests:

- `storage` for local history
- `activeTab` for user-invoked access to the current tab
- `scripting` to inject the in-page element capture UI only when requested

The extension no longer relies on static host permissions or always-on content scripts.

## PDF Notes

- Hosted PDFs should work through Region mode because the capture flow is screenshot-based.
- Local `file://` PDFs may require enabling `Allow access to file URLs`.
- Region mode captures only the visible viewport in v1, not off-screen PDF pages.

## Development

### Project Files

- `manifest.json`: Manifest V3 configuration
- `background.js`: runtime injection and region-capture session orchestration
- `content.js`: in-page panel, element capture, exports, and history rendering
- `capture.html` / `capture.js`: screenshot region selection editor
- `popup.html` / `popup.js`: mode switch and current-tab actions
- `shared.js`: shared helpers, normalization, and export formatting
- `styles.css`: injected in-page UI styles

### Local Checks

- `npm test`
- `npm run check`

Build commands beyond these release/helper checks are not defined in the repo.

## Limitations

- Element mode depends on DOM/script injection and is not intended for browser-internal surfaces.
- Region mode stores text exports and crop data in local storage; very large capture histories will increase storage usage.
- Region mode captures the current viewport only, not full-page stitched screenshots.
- Cross-origin iframe DOM capture remains limited by browser security rules.

## Roadmap

- Export region crops as files instead of only embedding them in JSON
- Add full-page or multi-step PDF region capture
- Add import/export for saved histories
- Add optional provider-specific AI handoff after the provider/auth shape is defined
