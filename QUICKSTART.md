# Quick Start Guide

Get Dev Feedback Capture running in a few minutes.

## 1. Load the extension

1. Open `chrome://extensions/` or `edge://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `webDevFeedbackExt` folder.

Optional for local PDFs:

5. Open the extension details page.
6. Enable `Allow access to file URLs`.

## 2. Capture an element

1. Open any `http`, `https`, or `file` page you want to inspect.
2. Open the extension popup.
3. Leave the mode on `Element`.
4. Click `Start Element Mode` or press `Ctrl+Shift+F`.
5. Click a page element, add your note, and save it.

## 3. Capture a PDF or screenshot region

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. In the editor tab, draw a box over the screenshot.
5. Add your note and save it.

## 4. Export saved feedback

From the in-page history panel on injectable pages, you can copy:

- `JSON` for full payloads including crop image data
- `Markdown` for issue trackers or docs
- `AI Prompt` for a ready-to-paste numbered summary

## Need Help?

- Full docs: see `README.md`
- PDF capture issues on local files: check `Allow access to file URLs`
- Element mode unavailable: use `Region` mode on non-injectable browser surfaces
- Region capture saves viewport-only crops in v1, not full-page screenshots
