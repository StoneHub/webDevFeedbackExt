# Manual Release Checklist

Automated checks are necessary but do not replace the exact-package unpacked-extension gate. Headless QA may use an isolated synthetic-page profile while the owner uses their Mac; record any test-only permission differences. See `docs/store-release-1.8.0.md` for the current candidate’s evidence and remaining limits.

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

## Active Element release check

The product was narrowed after hands-on review. New Region/PDF capture is removed; do not use the earlier broad workflow as an acceptance checklist for this release.

- Verify the exact release ZIP and minimal manifest permissions.
- When replacing an unpacked build in an existing test profile, enable Developer mode and use Chrome’s extension Reload control. Restarting Chrome alone can leave the old service-worker behavior active; a new manifest or files on disk is insufficient proof.
- Open History through the real toolbar and verify a session-bound frame on the source page with no additional tab.
- Open the production popup at its native size and start Element picking through the toolbar.
- Pick by mouse and keyboard; verify Escape stops picking.
- Save a note with acceptance checks; cancel another draft; verify Save & pick next resumes targeting.
- Confirm a new capture cannot replace an open draft and save errors preserve entered text.
- Edit a saved note and checks without changing its target, source URL, original timestamp, or evidence.
- Close the source tab and verify History persists.
- Filter and select records; confirm all five export formats use only the reviewed selection.
- Verify exact selected/shown deletion preserves hidden records.
- Confirm previously saved Region/PDF and Visual/Add records remain readable and exportable, including redacted images.
- Confirm PDF/browser-internal pages cannot start new capture.
- Send a selected JSON handoff to the configured Downloads inbox and import it through the MCP client.
- Read the imported record and any legacy evidence; record implementation and separately verified status.
- Update the Store listing and screenshots for Element-only capture.
- Record the exact uploaded package digest and Store API review/publication readback.

## Historical broad workflow

Earlier test evidence is preserved in `hardening-validation.md`. It does not authorize bringing back removed creation modes or publishing outdated Store copy.
