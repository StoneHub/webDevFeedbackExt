# Chrome Web Store Submission Record

Status: v1.7.0 is public in the Chrome Web Store. The v1.7.1 review was cancelled and replaced by the exact v1.7.2 Add Content package on August 3, 2026. Google accepted v1.7.2 for normal review with no warnings; it is pending review at a 100% target and will publish automatically after approval. Google distributes the Browser Code icon inside the public v1.7 CRX, but the Store listing still rendered the retired purple-flag asset before these submissions.

The submitted v1.7.2 package adds the user-triggered Add Content workflow plus the v1.7.1 discovery metadata and refreshed icon encoding without adding permissions, remote code, or network services. It excludes the separate v1.8 Feedback Session work. Store acceptance and automated checks do not prove the deferred browser runtime gates in `docs/manual-release-checklist.md`.

## Ready inputs

- Publisher: `FlyingChanges Code`
- Submitted extension package: `dist/dev-feedback-capture-v1.7.2.zip`
- Store icon: `icon128.png` (`128x128` PNG)
- Public product page: `https://monroes.tech/software/dev-feedback-capture/`
- Privacy policy: `https://monroes.tech/software/dev-feedback-capture/privacy/`
- Support email: `monroe@flyingchangesfarm.net`
- Single purpose: Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

## Discovery metadata for v1.7.2

Manifest title, 44 of 45 characters:

> Dev Feedback Capture: AI UI Review & Prompts

Short description, 126 of 132 characters:

> Pick elements, propose new page content, and annotate regions. Export AI-ready prompts and visual change specs for developers.

Store overview:

> Pick a webpage element, propose new page content, annotate a region or PDF, or preview a visual layout change. Dev Feedback Capture turns your feedback into AI-ready prompts and local visual change specs for Codex, Claude Code, Cursor, or another developer.
>
> **Capture the evidence**
>
> - Select an element and keep its text, selector, styles, page URL, and implementation note together.
> - Capture a visible region from a webpage or browser-rendered PDF.
> - Add arrows, shapes, numbered pins, text, and opaque redact marks.
> - Preview a direct move or resize while preserving original-versus-proposed evidence and restoring the live page afterward.
> - Propose text, image placeholders, lists, or safe HTML/embed frames before, after, or inside an existing page element.
> - Add acceptance checks so the requested outcome is explicit.
>
> **Hand it off clearly**
>
> - Copy a numbered AI-ready implementation prompt.
> - Download one local AI Bundle with structured JSON, page context, report HTML, and matching evidence images.
> - Export standalone JSON, HTML, or Markdown for issue trackers and developer review.
> - Use the optional project-scoped local MCP companion through an explicit JSON export and import.
>
> **Local-first by design**
>
> Feedback stays in local extension storage until you export it. Dev Feedback Capture has no cloud sync, telemetry, hosted AI connection, static host permissions, or always-on content scripts. Capture and export actions are user-triggered.
>
> Dev Feedback Capture produces portable handoff files and copyable prompts. It does not claim an official integration with Codex, Claude Code, Cursor, or their publishers.

## Submitted privacy practices copy

These values were entered in the Chrome Web Store Privacy practices tab and are retained here for reviewer follow-up and future releases.

### Single purpose

> Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

### Permission justifications

`activeTab`

> Used only after the user starts a capture. It grants temporary access to the current tab so the extension can identify the selected page, capture the visible viewport, or start Element, Visual, Add Content, or Region mode.

`scripting`

> Used only after a user action to inject the capture overlay, visual-edit interface, or reversible Add Content preview into the current tab. The extension does not use always-on content scripts.

`storage`

> Stores feedback history, annotations, local evidence, and extension preferences on the user's device so captures remain available in History until the user deletes them or removes the extension.

### Remote code

Select that the extension does not use remote code, then use:

> Dev Feedback Capture does not use remote code. All executable JavaScript is packaged with the extension. It does not load scripts, WebAssembly, or executable logic from external servers.

### Data-use disclosures

Disclose the following Chrome Web Store categories even though the data stays local until the user explicitly exports it:

- Website content: selected elements, visible screenshots, page context, and PDF content used for a capture.
- Web history: the URL and title of the page or PDF the user explicitly captures.
- User activity: user-triggered selections, region coordinates, and annotation interactions used to create a capture.

Use this privacy-policy URL:

`https://monroes.tech/software/dev-feedback-capture/privacy/`

The publisher reviewed and checked the three Developer Program Policies data-use certifications before submitting the item on July 19, 2026.

## Store screenshot plan

Capture the real v1.7 extension operating on its own public product page. Produce full-bleed `1280x800` PNG files with square corners and no padding.

1. `01-element-capture.png`
   - Page: Dev Feedback Capture product page.
   - Show Element mode targeting a feature card.
   - Keep the compact capture list collapsed so the page remains readable.
2. `02-visual-edit.png`
   - Show Visual mode with one obvious direct move or resize proposal.
   - Include the selected outline, large corner handle, and original/proposed intent.
3. `03-region-annotation.png`
   - Show Region crop with an arrow, rectangle, numbered pin, short text, and one redact mark.
   - Use only public demo content; do not redact real private information.
4. `04-history-and-exports.png`
   - Show History with Element, Visual, and Region entries plus AI Bundle, JSON for MCP, HTML, Markdown, and prompt actions.
5. `05-pdf-or-agent-handoff.png`
   - Preferred: a safe hosted PDF Region capture.
   - Alternate: History's explicit JSON-for-MCP handoff with clear local-first copy.

Before capture:

- Close or hide unrelated tabs and notifications.
- Use a clean browser window with no personal account data visible.
- Clear old test captures, then create a short coherent demo history.
- Confirm saved and exported redact evidence cannot reveal original pixels.
- Confirm every screenshot reflects v1.7 behavior, including the Browser Code icon and edge-anchored compact list.

## Small promotional tile

Create after the final screenshots establish the visual direction.

- Exact output: `440x280` PNG.
- Use the Browser Code icon from `icon128.png` on the indigo brand field.
- Add only the product name and the short line `Visual feedback, ready to build.`
- Do not use a raw screenshot, Store badge, ranking claim, or excessive text.

## Feature video plan

Target: 75-90 seconds, `1920x1080`, recorded in a clean Edge window on the public Dev Feedback Capture product page.

### Timeline

1. `0:00-0:06` — Title
   - Dev Feedback Capture
   - `Turn browser feedback into a buildable change spec.`
2. `0:06-0:20` — Element mode
   - Start Element mode, select a feature card, add a concise request, save.
3. `0:20-0:36` — Visual Edit
   - Select one element, drag it to move, use the corner handle to resize, show undo/redo, and save the requested mutation.
4. `0:36-0:54` — Region spec
   - Crop, add an arrow/pin/text, apply a redact mark, add an acceptance check, save.
5. `0:54-1:08` — History and exports
   - Open History, show the three capture types, then highlight AI Bundle, HTML, and JSON for MCP.
6. `1:08-1:20` — Local agent handoff
   - Briefly show the explicit JSON import workflow and project-scoped MCP status without exposing private paths or prompts.
7. `1:20-1:28` — Close
   - `Local-first. User-triggered. No cloud sync.`
   - Product name and `monroes.tech` URL.

### Recording rules

- Record only the browser window; do not record the full desktop.
- Use public demo content and a neutral test project.
- Disable notifications and hide bookmarks/profile details where possible.
- Do not show personal downloads, filesystem paths, API keys, emails, or unrelated browser history.
- Keep cursor movement deliberate and remove dead time in the edit.
- Add captions; narration is optional.
- Export a high-quality master, then upload the final video to YouTube for the optional Store listing video field.

## Submission record and follow-up

- Publisher: `FlyingChanges Code`; durable owner and verified public contact: `monroe@flyingchangesfarm.net`.
- Store item ID: `hhdmfaaplpiokafjieefpgoppckijafc`.
- Current public package: v1.7.0.
- Cancelled submission: `dist/dev-feedback-capture-v1.7.1.zip`; SHA-256 `440b41157386ae75e42a15e0f7f12c9bcbe645966e57330ec97f55fdb61a1dc3`.
- Submitted package: `dist/dev-feedback-capture-v1.7.2.zip`; SHA-256 `4c40215036eef05f5459f408d8e11ed74327db39d16892a78a14345e95f65bef`.
- API readback on August 3, 2026: v1.7.2 is `PENDING_REVIEW` at a 100% target with no warning or takedown flag; v1.7.0 remains public until approval.
- Category: Developer Tools; language: English (United States).
- The single purpose, permission justifications, no-remote-code declaration, data-use categories, privacy-policy URL, homepage, and support URL were saved before submission.
- One valid 1280x800 screenshot remains on the Store listing. Monroe explicitly waived replacement screenshots for this submission; the fresh five-shot set remains optional follow-up work.
- Monitor the verified contact email and dashboard for approval or a focused reviewer request.
- Confirm the dashboard's publication timing choice before an approved item goes live; that setting was not independently recorded here.
- Monroe explicitly authorized the v1.7.2 upload without a new unpacked-browser smoke or replacement screenshots. Those checks remain open and the release must not be described as runtime-verified.
- The feature video, 440x280 promotional tile, and backup publisher Admin remain optional follow-up work.
- Keep payments, authentication, network sync, additional permissions, and v1.8 Feedback Sessions out of v1.7.2.
