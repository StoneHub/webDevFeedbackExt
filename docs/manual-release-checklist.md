# Manual Release Checklist

Automated checks are necessary but do not replace the unpacked-extension gate.

Store status on August 3, 2026: v1.7.0 is public in the Chrome Web Store, v1.7.1 was cancelled, and v1.7.2 is pending review for automatic publication. The distributed CRX contains the Browser Code icon, while the Store listing still renders the retired purple-flag artwork. Store approval is not proof that the deferred checks below passed. Keep them open and do not call these releases runtime-verified until the relevant evidence is recorded.

Submission record: Monroe explicitly waived the new unpacked-browser smoke and replacement screenshot gates. The exact v1.7.1 ZIP with SHA-256 `440b41157386ae75e42a15e0f7f12c9bcbe645966e57330ec97f55fdb61a1dc3` was uploaded successfully and submitted for normal review on August 3, 2026. The API readback showed `PENDING_REVIEW` at a 100% target with no warning or takedown flag. The unchecked runtime and screenshot items below remain open proof gaps, not blockers to that authorized submission.

v1.7.2 submission record: The v1.7.1 review was cancelled, and the exact clean-main v1.7.2 ZIP with SHA-256 `4c40215036eef05f5459f408d8e11ed74327db39d16892a78a14345e95f65bef` was uploaded and submitted for normal review on August 3, 2026. API readback showed v1.7.2 `PENDING_REVIEW` at a 100% target with no warning or takedown flag. v1.7.0 remains public until Google approves and automatically publishes v1.7.2.

## Historical v1.7.2 Store submission

The v1.7.2 submission records above are preserved evidence for an earlier package. Its Add Content workflow is not part of the active product scope. Do not use that package, its screenshots, or its Store copy as proof of the browser capture core described below.

## Historical v1.7.1 discovery package and listing check

These checks describe an earlier Store package and remain here only as release evidence. They are not current-product acceptance criteria.

For that historical package:

- Confirm the package contains only v1.7 behavior plus the manifest title, short description, version, and refreshed Browser Code icon assets. Do not include v1.8 Feedback Session files or permissions.
- Current Chrome documentation takes the required 128x128 extension icon from the uploaded ZIP; the Store listing tab separately owns the long description, screenshots, promotional tile, and video. Do not invent a separate icon-upload step unless the live dashboard exposes one for this item.
- Confirm the manifest title is `Dev Feedback Capture: AI UI Review & Prompts` and remains at or below 45 characters.
- Confirm the manifest short description is the approved 120-character Store copy and remains at or below 132 characters.
- Run `npm test`, `npm run check`, `npm run package`, `npm run verify:package`, and `git diff --check` from the isolated v1.7.1 worktree.
- Load the exact v1.7.1 package unpacked and confirm Chrome identifies version 1.7.1, shows the full title without breaking popup behavior, and uses the Browser Code icon at 16, 48, and 128 pixels.
- Capture the five real 1280x800 Store screenshots specified in `docs/chrome-web-store-submission-draft.md`; do not substitute old v1.2 screenshots for current-product proof.
- In the durable owner account, update the Store overview, screenshots, and optional video, then upload the exact verified v1.7.1 ZIP. Re-read the upload status before submitting for review.
- After publication, confirm the Store listing and a clean Google result both show the Browser Code icon, revised title, short description, public version, and current screenshots. If the retired purple-flag asset remains despite the verified ZIP icon, record the listing asset URL and escalate through Chrome Web Store support rather than claiming the refresh worked.

## Active browser capture core check

Before tagging or publishing the active browser capture core:

- Reload the unpacked extension from this exact repository checkout.
- Start Element and Region modes and confirm the capture UI opens with the current product controls.
- In Element mode, select one element and save a Capture Record.
- In Region mode, capture one normal-page region and one rendered PDF region, then save both to History.
- Resize the browser window and confirm the collapsed list remains visible on its selected edge.
- Confirm History renders both records after the source tab is closed.
- Confirm **Send to Codex** places one explicit handoff file in the configured local inbox without requiring manual file movement.
- Confirm the Browser Code icon is legible in the browser toolbar and extension-management list at the packaged sizes.

## Active PDF/export check

Before tagging or publishing the active browser capture core, load the exact repository path as an unpacked extension in Edge or Chromium and verify:

- Region capture from one hosted PDF and, when file access is enabled, one local PDF.
- History renders the saved PDF capture after the source tab is closed.
- JSON and self-contained HTML exports download and open.
- AI Bundle ZIP contains `prompt.md`, `feedback.json`, `page-context.json`, `report.html`, and matching before/annotated evidence.
- Opaque redaction remains applied in every exported “before” image; original pixels must not be recoverable.

This gate remains required before the active release is described as runtime-verified.

## Active Agent Handoff check

Before tagging or publishing the active browser capture core:

- Send a real Element and Region/PDF Capture Record through `Send to Codex`.
- Launch the MCP companion from an actual local MCP client with explicit project and inbox roots.
- List the inbox and import the newest valid handoff, then exercise project status, list, get, implementation brief, and evidence resource reads.
- Confirm evidence bytes are available only through resource reads and base64 data URLs are absent from stored item JSON.
- Create one agent-authored project item, verify an identical `clientRequestId` is idempotent, and exercise a revision conflict.
- Implement one small project change with the agent's normal coding tools; record `in-progress`, `implemented`, and separately `verified` status with a passing check.
- Confirm the extension still requests only `storage`, `activeTab`, and `scripting`, and that the extension ZIP contains no MCP server or Node dependency files.

Do not claim a direct browser bridge. The current Agent Handoff is an explicit local inbox import; a native-messaging bridge remains a separately permissioned future gate.
