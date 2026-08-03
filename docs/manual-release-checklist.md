# Manual Release Checklist

Automated checks are necessary but do not replace the unpacked-extension gate.

Store status on August 3, 2026: v1.7.0 is public in the Chrome Web Store, v1.7.1 is pending review, and v1.7.2 is the prepared Add Content replacement. The distributed CRX contains the Browser Code icon, while the Store listing still renders the retired purple-flag artwork. Store approval is not proof that the deferred checks below passed. Keep them open and do not call these releases runtime-verified until the relevant evidence is recorded.

Submission record: Monroe explicitly waived the new unpacked-browser smoke and replacement screenshot gates. The exact v1.7.1 ZIP with SHA-256 `440b41157386ae75e42a15e0f7f12c9bcbe645966e57330ec97f55fdb61a1dc3` was uploaded successfully and submitted for normal review on August 3, 2026. The API readback showed `PENDING_REVIEW` at a 100% target with no warning or takedown flag. The unchecked runtime and screenshot items below remain open proof gaps, not blockers to that authorized submission.

## v1.7.2 Add Content package and submission

Before submitting v1.7.2:

- Confirm the package adds only the reviewed Add Content feature plus the v1.7.1 discovery refresh; do not include v1.8 Feedback Session files or new permissions.
- Confirm Text, Image placeholder, List, and HTML/embed frame definitions are rendered with DOM text nodes and that the frame remains a non-executable placeholder.
- Confirm saved content requests normalize to a structured `insert` mutation and remain compatible with existing History and AI Bundle exports.
- Run `npm test`, `npm run check`, `npm run package`, `npm run verify:package`, JavaScript syntax checks, and `git diff --check` from the isolated release worktree.
- Because Monroe waived the new unpacked-browser smoke and replacement screenshots, record those as open proof gaps rather than claiming runtime verification.
- Read the live Store API state, cancel the active v1.7.1 submission, upload the exact verified v1.7.2 ZIP, submit with review enabled and warnings blocking, then read the status back.

## v1.7.1 discovery package and listing check

Before tagging or uploading v1.7.1:

- Confirm the package contains only v1.7 behavior plus the manifest title, short description, version, and refreshed Browser Code icon assets. Do not include v1.8 Feedback Session files or permissions.
- Current Chrome documentation takes the required 128x128 extension icon from the uploaded ZIP; the Store listing tab separately owns the long description, screenshots, promotional tile, and video. Do not invent a separate icon-upload step unless the live dashboard exposes one for this item.
- Confirm the manifest title is `Dev Feedback Capture: AI UI Review & Prompts` and remains at or below 45 characters.
- Confirm the manifest short description is the approved 120-character Store copy and remains at or below 132 characters.
- Run `npm test`, `npm run check`, `npm run package`, `npm run verify:package`, and `git diff --check` from the isolated v1.7.1 worktree.
- Load the exact v1.7.1 package unpacked and confirm Chrome identifies version 1.7.1, shows the full title without breaking popup behavior, and uses the Browser Code icon at 16, 48, and 128 pixels.
- Capture the five real 1280x800 Store screenshots specified in `docs/chrome-web-store-submission-draft.md`; do not substitute old v1.2 screenshots for current-product proof.
- In the durable owner account, update the Store overview, screenshots, and optional video, then upload the exact verified v1.7.1 ZIP. Re-read the upload status before submitting for review.
- After publication, confirm the Store listing and a clean Google result both show the Browser Code icon, revised title, short description, public version, and current screenshots. If the retired purple-flag asset remains despite the verified ZIP icon, record the listing asset URL and escalate through Chrome Web Store support rather than claiming the refresh worked.

## v1.7 compact-panel and icon check

Before tagging or uploading v1.7:

- Reload the unpacked extension from this exact repository checkout.
- Start Element and Visual modes and confirm the change list opens expanded with the paper-and-indigo palette.
- In Element and Visual modes, drag the collapsed change list near every viewport edge and confirm it stays anchored to the nearest edge.
- Resize the browser window and confirm the collapsed list remains visible on its selected edge.
- Confirm **⌃** expands the list, **⌄** collapses it, and both controls have matching accessible labels.
- Confirm the Browser Code icon is legible in the browser toolbar and extension-management list at the packaged sizes.

## Deferred v1.4 PDF/export check

Before tagging or publishing v1.4 or later, load the exact repository path as an unpacked extension in Edge or Chromium and verify:

- Region capture from one hosted PDF and, when file access is enabled, one local PDF.
- History renders the saved PDF capture after the source tab is closed.
- JSON and self-contained HTML exports download and open.
- AI Bundle ZIP contains `prompt.md`, `feedback.json`, `page-context.json`, `report.html`, and matching before/annotated evidence.
- Opaque redaction remains applied in every exported “before” image; original pixels must not be recoverable.

This gate was intentionally deferred from the v1.4 source merge. It is expected to be routine, but it remains required before the submitted release is described as runtime-verified.

## v1.7 direct Visual Edit check

Before tagging, publishing, or uploading v1.7, select one normal-page element and drag its outline to move it with a mouse or pointer. Resize it with the corner handle and, when touch-capable hardware is available, repeat both gestures with a finger. Confirm Undo, Redo, and Reset work after direct gestures. Confirm Cancel, Save, navigation, Region handoff, and stopping feedback mode always restore the live page, while the saved item and AI Bundle preserve original versus proposed intent.

The source may merge to `main` for code review and local trying before this hands-on gate is complete. Do not call the release runtime-verified until this checklist passes.

## v1.6 local MCP handoff check

Before tagging, publishing, or uploading v1.6:

- Download a real History JSON export using `Download JSON for MCP`.
- Launch the MCP companion from an actual local MCP client with explicit project and inbox roots.
- Import that exact file, then exercise project status, list, get, implementation brief, and evidence resource reads.
- Confirm evidence bytes are available only through resource reads and base64 data URLs are absent from stored item JSON.
- Create one agent-authored project item, verify an identical `clientRequestId` is idempotent, and exercise a revision conflict.
- Implement one small project change with the agent's normal coding tools; record `in-progress`, `implemented`, and separately `verified` status with a passing check.
- Confirm the extension still requests only `storage`, `activeTab`, and `scripting`, and that the extension ZIP contains no MCP server or Node dependency files.

Do not claim a direct browser bridge in v1.6. The current handoff is an explicit local file import; a native-messaging bridge remains a separately permissioned future gate.
