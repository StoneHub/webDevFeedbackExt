# Quick Start Guide

Get Dev Feedback Capture running in a few minutes.

Chrome Web Store v1.6 is public. This source checkout prepares v1.7; the latest GitHub Release ZIP remains v1.2.0 until the deferred browser and agent-handoff gates are completed and recorded.

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
6. The in-page capture list starts expanded. Use **⌄** to collapse it; the compact list stays on the nearest viewport edge as you drag it, and **⌃** expands it again.

## 3. Preview a visual edit

1. Open an injectable webpage and choose `Visual` in the extension popup.
2. Click `Start Visual Edit`, then select one page element.
3. Drag the selected outline to move the element, or drag its corner handle to resize it.
4. Use Undo, Redo, or Reset as needed.
5. Add the implementation note and optional acceptance checks, then save the spec.
6. The live page is restored; the original/proposed evidence and requested mutations remain in local History.

## 4. Compile an annotated region spec

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. Use `Crop` to define the evidence area.
5. Add arrows, rectangles, ellipses, numbered pins, text, or blur/redact marks. Use Undo and Redo as needed.
6. Describe the requested change and optionally add one acceptance check per line.
7. Save the visual change spec.

## 5. Export saved feedback

Open the extension popup and select `Open History & Export`. This extension-owned page works for captures from normal pages, PDFs, and other surfaces where the in-page panel is unavailable. From History, you can:

- Download one `AI Bundle` ZIP with `prompt.md`, structured feedback and page context, before/annotated PNGs, and `report.html`
- Download `JSON for MCP` for full payloads including crop image data
- Download a self-contained `HTML Report` with embedded region images
- Copy `Markdown` for issue trackers or docs
- Copy `AI Prompt` for ready-to-paste implementation instructions based on saved text and source context

AI Prompt is text-only. Use AI Bundle when the implementation handoff needs its numbered evidence images.

## 6. Give a local agent project-scoped feedback

1. In History, choose `Download JSON for MCP`.
2. Configure the MCP companion with the absolute target project path and the folder containing that export.
3. Ask the agent to call `dev_feedback_import` with the exact JSON path. If the export contains multiple site/file groups, also provide the exact `storageKey` shown by the first rejected import.
4. The agent can call `dev_feedback_list`, `dev_feedback_get`, and `dev_feedback_build_brief`, implement changes with its normal project tools, then record progress with `dev_feedback_status_update`.

Setup and security boundaries are in `docs/mcp-local-agent.md`.

## Need Help?

- Full docs: see `README.md`
- PDF capture issues on local files: check `Allow access to file URLs`
- Element mode unavailable: use `Region` mode on non-injectable browser surfaces
- Region capture saves viewport-only crops in v1, not full-page screenshots
