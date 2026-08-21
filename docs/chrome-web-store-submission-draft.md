# Chrome Web Store Submission Record

Status: v1.6 was submitted on July 19, 2026 and was public by July 20, 2026. v1.7 was submitted on July 26, 2026; the public listing still showed v1.6 on July 28. The current dashboard review state was not re-read during the v1.8 feature implementation.

The next source package is v1.8.0. The existing Store approval does not prove the deferred PDF/export, Visual Edit, local MCP, compact-panel, Feedback Session, or privacy gates in `docs/manual-release-checklist.md`; do not tag or upload v1.8 until those checks pass.

## Ready inputs

- Publisher: `FlyingChanges Code`
- Candidate extension package: `dist/dev-feedback-capture-v1.8.0.zip`
- Store icon: `icon128.png` (`128x128` PNG)
- Public product page: `https://monroes.tech/software/dev-feedback-capture/`
- Privacy policy: `https://monroes.tech/software/dev-feedback-capture/privacy/`
- Support email: `monroe@flyingchangesfarm.net`
- Single purpose: Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

For v1.8 review, expand the single-purpose copy to include user-started reproduction timelines without implying literal video:

> Capture structured, local visual change specifications and user-started browser-interaction timelines, then export them explicitly for implementation and issue reproduction.

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

> Stores feedback history, annotations, local evidence, user-started session timelines, and extension preferences on the user's device until the user deletes them or removes the extension.

Optional `webNavigation`

> Requested only when the user starts a Feedback Session. It records full-page loads, failed navigation, same-document route changes, and fragment navigation for that one active session so the exported timeline can reproduce the path to an issue.

### Remote code

Select that the extension does not use remote code, then use:

> Dev Feedback Capture does not use remote code. All executable JavaScript is packaged with the extension. It does not load scripts, WebAssembly, or executable logic from external servers.

### Data-use disclosures

Disclose the following Chrome Web Store categories even though the data stays local until the user explicitly exports it:

- Website content: selected elements, visible screenshots, page context, and PDF content used for a capture.
- Web history: the sanitized URL path and title of a page or PDF the user explicitly captures, plus navigation paths recorded only during a user-started Feedback Session. Query strings and fragments are removed from session events.
- User activity: user-triggered selections, region coordinates, annotations, and redacted click/change/submit/navigation-key/scroll metadata recorded only during an active Feedback Session. Form-field contents and printable keystrokes are not directly read. Page paths, titles, element labels, and sanitized error locations may contain sensitive text supplied by the site.

Use this privacy-policy URL:

`https://monroes.tech/software/dev-feedback-capture/privacy/`

The publisher reviewed and checked the three Developer Program Policies data-use certifications before submitting the item on July 19, 2026.

## Store screenshot plan

Capture the real v1.8 extension operating on its own public product page. Produce full-bleed `1280x800` PNG files with square corners and no padding.

1. `01-element-capture.png`
   - Page: Dev Feedback Capture product page.
   - Show Element mode targeting a feature card.
   - Keep the compact capture list collapsed so the page remains readable.
2. `02-feedback-session.png`
   - Show the visible REC/Pause/Stop control on safe public demo content and the matching local session timeline.
   - State `Structured timeline — no field reads or screen video`.
3. `03-visual-edit.png`
   - Show Visual mode with one obvious direct move or resize proposal.
   - Include the selected outline, large corner handle, and original/proposed intent.
4. `04-region-annotation.png`
   - Show Region crop with an arrow, rectangle, numbered pin, short text, and one redact mark.
   - Use only public demo content; do not redact real private information.
5. `05-history-and-exports.png`
   - Show History with Element, Visual, Region, and a safe hosted PDF entry plus AI Bundle, JSON for MCP, HTML, Markdown, and prompt actions.

Before capture:

- Close or hide unrelated tabs and notifications.
- Use a clean browser window with no personal account data visible.
- Clear old test captures, then create a short coherent demo history.
- Confirm saved and exported redact evidence cannot reveal original pixels.
- Confirm every screenshot reflects v1.8 behavior, including the Browser Code icon, edge-anchored compact list, and visible Feedback Session recording state.

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
2. `0:06-0:20` — Feedback Session
   - Start a session, navigate through safe demo pages, pause/resume, and show the resulting structured timeline.
3. `0:20-0:32` — Element mode
   - Start Element mode, select a feature card, add a concise request, save.
4. `0:32-0:46` — Visual Edit
   - Select one element, drag it to move, use the corner handle to resize, show undo/redo, and save the requested mutation.
5. `0:46-1:02` — Region spec
   - Crop, add an arrow/pin/text, apply a redact mark, add an acceptance check, save.
6. `1:02-1:15` — History and exports
   - Open History, show the three capture types, then highlight AI Bundle, HTML, and JSON for MCP.
7. `1:15-1:24` — Local agent handoff
   - Briefly show the explicit JSON import workflow and project-scoped MCP status without exposing private paths or prompts.
8. `1:24-1:30` — Close
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
- Current public package observed July 28: v1.6.0.
- v1.7 was submitted July 26; verify its live dashboard state before any follow-up mutation.
- Next source candidate package: `dist/dev-feedback-capture-v1.8.0.zip` (not uploaded).
- Category: Developer Tools; language: English (United States).
- The single purpose, permission justifications, no-remote-code declaration, data-use categories, privacy-policy URL, homepage, and support URL were saved before submission.
- One valid 1280x800 screenshot was submitted with v1.6. Replace it with the fresh v1.7 set above when the v1.7 release gates pass.
- Monitor the verified contact email and dashboard for approval or a focused reviewer request.
- Confirm the dashboard's publication timing choice before an approved item goes live; that setting was not independently recorded here.
- Complete every open gate in `docs/manual-release-checklist.md` before tagging or uploading v1.8.
- The feature video, 440x280 promotional tile, and backup publisher Admin remain optional follow-up work.
- Keep payments, authentication, network sync, static host permissions, and literal video capture out of v1.8.
