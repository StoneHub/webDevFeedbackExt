# Quick Start Guide

Get Dev Feedback Capture running in a few minutes.

This guide describes the unreleased 1.8.0 candidate: Element, Region/PDF, History, and one explicit Agent Handoff. Store and GitHub release notes in this repository preserve earlier submission evidence.

## 1. Install the extension

Preferred: install the public release from the [Chrome Web Store](https://chromewebstore.google.com/detail/dev-feedback-capture/hhdmfaaplpiokafjieefpgoppckijafc).

For source or fallback installation:

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
6. Save or cancel in the private overlay. Your source tab stays in place; use History to review saved captures.

## 3. Compile an annotated region spec

1. Open the target page or PDF in the browser.
2. Open the extension popup and switch to `Region`.
3. Click `Capture Region`.
4. Use `Crop` in the overlay to define the evidence area. Protected browser surfaces use a separate capture window.
5. Add arrows, rectangles, ellipses, numbered pins, text, or blur/redact marks. Use Undo and Redo as needed.
6. Describe the requested change and optionally add one acceptance check per line.
7. Save the visual change spec.

## 4. Export saved feedback

Open the extension popup and select `Open History & Export`. This extension-owned page works for captures from normal pages, PDFs, and other surfaces where the in-page panel is unavailable. Select the captures to share, choose an export, and review the preview before confirming. Filters clear selection and hidden captures stay out of exports. From History, you can:

- Download one `AI Bundle` ZIP with `prompt.md`, structured feedback and page context, before/annotated PNGs, and `report.html`
- Choose `Send to Codex` to place the selected handoff payload in the configured local Downloads inbox for MCP import
- Download a self-contained `HTML Report` with embedded region images
- Copy `Markdown` for issue trackers or docs
- Copy `AI Prompt` for ready-to-paste implementation instructions based on saved text and source context

AI Prompt is text-only. Use AI Bundle when the implementation handoff needs its numbered evidence images.

## 5. Give a local agent project-scoped feedback

1. In History, choose `Send to Codex` to review and download the selected captures.
2. Configure the MCP companion with the absolute target project path and the browser Downloads folder.
3. Ask the agent to call `dev_feedback_import_latest`. If the handoff contains multiple site/file groups, provide the exact `storageKey` shown by the first rejected import.
4. The agent can call `dev_feedback_list`, `dev_feedback_get`, and `dev_feedback_build_brief`, implement changes with its normal project tools, then record progress with `dev_feedback_status_update`.

Codex setup is one command per target project:

```sh
codex mcp add dev-feedback -- node /absolute/path/to/webDevFeedbackExt/mcp/cli.mjs \
  --project /absolute/path/to/project \
  --inbox /absolute/path/to/Downloads
```

The extension places the file in the inbox; users do not need to move it manually. Implementation and verification remain separate steps.

Setup and security boundaries are in `docs/mcp-local-agent.md`.

## Need Help?

- Full docs: see `README.md`
- PDF capture issues on local files: check `Allow access to file URLs`
- Element capture unavailable: use `Region` mode on non-injectable browser surfaces
- Region capture saves viewport-only crops in v1, not full-page screenshots
