# Quick Start Guide

Get Dev Feedback Capture running in a few minutes.

The latest published ZIP is v1.2.0. The Visual Change Spec editor and AI Bundle described below are currently available from the unreleased v1.4 source checkout.

## 1. Load the extension

1. Download the latest `dev-feedback-capture-v<version>.zip` asset from GitHub Releases.
2. Unzip it.
3. Open `chrome://extensions/` or `edge://extensions/`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the unzipped extension folder.

Optional for local PDFs:

7. Open the extension details page.
8. Enable `Allow access to file URLs`.

## 2. Capture an element

1. Open any `http`, `https`, or `file` page you want to inspect.
2. Open the extension popup.
3. Leave the mode on `Element`.
4. Click `Start Element Mode` or press `Ctrl+Shift+F` (`Command+Shift+F` on macOS).
5. Click a page element, add your note, and save it.
6. The in-page capture list starts collapsed. Use **+** to expand it and **−** to collapse it again.

## 3. Compile a visual change spec

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. Use `Crop` to define the evidence area.
5. Add arrows, rectangles, ellipses, numbered pins, text, or blur/redact marks. Use Undo and Redo as needed.
6. Describe the requested change and optionally add one acceptance check per line.
7. Save the visual change spec.

## 4. Export saved feedback

Open the extension popup and select `Open History & Export`. This extension-owned page works for captures from normal pages, PDFs, and other surfaces where the in-page panel is unavailable. From History, you can:

- Download one `AI Bundle` ZIP with `prompt.md`, structured feedback and page context, before/annotated PNGs, and `report.html`
- Download `JSON` for full payloads including crop image data
- Download a self-contained `HTML Report` with embedded region images
- Copy `Markdown` for issue trackers or docs
- Copy `AI Prompt` for ready-to-paste implementation instructions based on saved text and source context

AI Prompt is text-only. Use AI Bundle when the implementation handoff needs its numbered evidence images.

## Need Help?

- Full docs: see `README.md`
- PDF capture issues on local files: check `Allow access to file URLs`
- Element mode unavailable: use `Region` mode on non-injectable browser surfaces
- Region capture saves viewport-only crops in v1, not full-page screenshots
