# Chrome Web Store 1.8.0 release

Status: scope narrowed after hands-on review. Do not upload the earlier broad candidate ZIP.

The release now centers on Element capture, editable local History, and explicit selected exports. New Region/PDF capture is removed; old saved records remain supported.

## Store listing

Title: Dev Feedback Capture: AI UI Review & Prompts

Short description: Pick webpage elements, write clear change requests, and export selected feedback for developers and coding agents.

Overview:

Pick a webpage element, describe the change, and give another developer enough context to act on it.

Write your request in a compact private editor. Add optional acceptance checks, inspect the captured selector and page context, and choose Save & pick next to review several elements without leaving the page.

History opens in a private panel on the working page, with an extension-menu fallback on restricted pages. It never opens a new tab. Your notes stay in local History after the source tab closes. Edit a request or its acceptance checks, filter the list, select the notes to share, and review the export preview before confirming.

Copy a Markdown note or AI prompt, download a self-contained HTML report or AI Bundle, or use Send to Codex to download a JSON handoff for the separately configured local MCP companion. The extension does not connect directly to an AI account.

There is no cloud sync, telemetry, remote executable code, or always-on page monitoring. The extension asks for access to the current tab only when you activate capture. Captured page content and your own notes can still contain private information; review them before exporting.

New Region/PDF, Visual, and Add Content capture are no longer offered. Existing saved records remain readable and exportable. Element capture requires an accessible webpage; PDF viewers, browser-internal pages, and some embedded content are unsupported.

Dev Feedback Capture is an independent tool, not an official integration from any coding-agent provider.

## Privacy practices

Single purpose: Collect structured feedback about selected webpage elements and export user-selected records for implementation.

- activeTab: Temporary access after user activation to identify and collect the selected webpage element.
- scripting: Inject the requested picker, read-only element collector, and private note editor. No always-on content scripts.
- storage: Keep notes, captured context, acceptance checks, legacy records, and preferences locally.
- Remote code: None. Executable code is packaged with the extension.
- Data categories: Website content, captured page URL/title, and explicit capture interactions. Existing data-use declarations remain applicable.

## Validation and package

Validated locally on September 5, 2026:

- `npm test`: 49 tests across extension/privacy, Electron, and MCP, plus release assertions; passed.
- `npm run check`, `npm run package`, `npm run verify:package`, and `git diff --check`: passed.
- Package: 19 files, 49,540 bytes, SHA-256 `975462d63b958a342430ac95f9d5d9159986e2c7b0861a67828fa209fb5ed4e9`.
- Owner accepted Element picking and feedback capture, then accepted the narrower on-page History panel after the installed extension was explicitly reloaded.
- Actual native toolbar activation in headed Chrome for Testing with the unmodified release manifest opened History as a session-bound frame on the original page. One browser tab remained; saved notes were preserved.
- Existing-profile caveat: restarting Chrome after replacing files retained the previous worker behavior. The real toolbar reproduced the unwanted new History tab. Enabling Developer mode in this isolated profile and using Chrome’s extension Reload control resolved it. Recheck the real toolbar after every unpacked update.
- Independent headless browser checks used a separate profile with a test-only localhost host permission. Verified Save & pick next, History note editing, selection/filter clearing, export preview, all three downloads, both clipboard actions, close/Escape, 440px panel width without horizontal overflow, and no note text in the source-page DOM.
- PDF requests returned the popup fallback. History rendered at 360px inside the popup document without creating another tab. Native popup fallback acceptance remains separate from that automated document check.
- Imported a real browser-exported JSON through an MCP SDK stdio client, listed the selected record, and built its implementation brief. The downloaded file was copied into the approved Downloads test inbox for this check; automatic inbox delivery and implementation/verification status are still separate acceptance steps.

Remaining before submission: finish the outstanding acceptance checks in the manual checklist, capture current Store screenshots, land the reviewed source and CI, update the Store listing, and record upload/review readback. The previous main artifact is superseded and must not be submitted.
