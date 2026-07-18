# Chrome Web Store Submission Draft

Status: Draft only. Do not submit or publish until the runtime and asset gates pass.

## Ready inputs

- Publisher: `FlyingChanges Code`
- Extension package: `dist/dev-feedback-capture-v1.6.0.zip`
- Store icon: `icon128.png` (`128x128` PNG)
- Public product page: `https://monroes.tech/software/dev-feedback-capture/`
- Privacy policy: `https://monroes.tech/software/dev-feedback-capture/privacy/`
- Support email: `monroe@flyingchangesfarm.net`
- Single purpose: Capture structured, local visual change specifications from the current browser-visible page or PDF and export them for implementation.

## Store screenshot plan

Capture the real v1.6 extension operating on its own public product page. Produce full-bleed `1280x800` PNG files with square corners and no padding.

1. `01-element-capture.png`
   - Page: Dev Feedback Capture product page.
   - Show Element mode targeting a feature card.
   - Keep the compact capture list collapsed so the page remains readable.
2. `02-visual-edit.png`
   - Show Visual mode with one obvious but reversible layout or style proposal.
   - Include the focused edit inspector and original/proposed intent.
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
- Confirm every screenshot reflects v1.6 behavior, not an older release.

## Small promotional tile

Create after the final screenshots establish the visual direction.

- Exact output: `440x280` PNG.
- Use the speech-bubble/cursor icon from `icon128.png` on the purple brand field.
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
   - Select one element, preview a reversible style or spacing change, show undo/redo, save the requested mutation.
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

## Remaining dashboard decisions

- Confirm trader/non-trader declaration.
- Choose the final category and distribution regions.
- Complete website-content, browsing-activity, and user-generated-content disclosures as applicable.
- Add permission justifications for `storage`, `activeTab`, and `scripting`.
- Submit for review with deferred publishing; keep the item staged until the approved package and listing are rechecked.
