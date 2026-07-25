# Chrome Web Store Submission Record

Status: v1.6 was submitted on July 19, 2026 and was public by July 20, 2026. The v1.7 package is a local release candidate and has not been uploaded.

The next package is v1.7.0. The existing Store approval does not prove the deferred PDF/export, Visual Edit, local MCP, or v1.7 compact-panel runtime gates in `docs/manual-release-checklist.md`; do not tag or upload v1.7 until those checks pass.

## Ready inputs

- Publisher: `FlyingChanges Code`
- Candidate extension package: `dist/dev-feedback-capture-v1.7.0.zip`
- Store icon: `icon128.png` (`128x128` PNG)
- Public product page: `https://monroes.tech/software/dev-feedback-capture/`
- Privacy policy: `https://monroes.tech/software/dev-feedback-capture/privacy/`
- Support email: `monroe@flyingchangesfarm.net`
- Single purpose: Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

## Submitted privacy practices copy

These values were entered in the Chrome Web Store Privacy practices tab and are retained here for reviewer follow-up and future releases.

### Single purpose

> Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

### Permission justifications

`activeTab`

> Used only after the user starts a capture. It grants temporary access to the current tab so the extension can identify the selected page, capture the visible viewport, or start Element, Visual, or Region mode.

`scripting`

> Used only after a user action to inject the capture overlay or visual-edit interface into the current tab. The extension does not use always-on content scripts.

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
- Current public package: v1.6.0.
- Next candidate package: `dist/dev-feedback-capture-v1.7.0.zip` (not uploaded).
- Category: Developer Tools; language: English (United States).
- The single purpose, permission justifications, no-remote-code declaration, data-use categories, privacy-policy URL, homepage, and support URL were saved before submission.
- One valid 1280x800 screenshot was submitted with v1.6. Replace it with the fresh v1.7 set above when the v1.7 release gates pass.
- Monitor the verified contact email and dashboard for approval or a focused reviewer request.
- Confirm the dashboard's publication timing choice before an approved item goes live; that setting was not independently recorded here.
- Complete every open gate in `docs/manual-release-checklist.md` before tagging or uploading v1.7.
- The feature video, 440x280 promotional tile, and backup publisher Admin remain optional follow-up work.
- Keep payments, authentication, network sync, and additional permissions out of v1.7.
