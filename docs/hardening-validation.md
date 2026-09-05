# Historical broad candidate validation

The Region/PDF creation workflow described below was removed after hands-on product review. See `store-release-1.8.0.md` for the narrower candidate. This file preserves the earlier test evidence.

Validated September 5, 2026 against the 1.8.0 browser-capture candidate based on `b933ce0b8d412972faf60ebcb8218ef006d45bec` (PR #12). This is source and test evidence for an unreleased candidate, not Store publication evidence.

The capture UI stays over the source page. Element notes and Region edits run inside extension-origin frames, while the host page receives only generic picker controls. A surface that rejects injection uses a separate capture popup window. History remains a dedicated extension page.

## Changes covered

- Redacted Region records drop all captured DOM anchors, page titles, and detailed source URLs. The saved crop has opaque masks; notes and annotation labels remain for explicit review.
- Every History export uses a selected, sanitized snapshot with a confirmation preview containing the actual notes and evidence images. Filter changes clear selection. Deletion targets exact IDs, including when the group is filtered.
- Local History is restricted to trusted extension contexts. The broker rejects page content scripts asking for global History, forged extension URLs, other editors, and unapproved actions. Capture drafts use session-bound IDs and idempotent saves.
- Save failures preserve drafts. New captures respect per-item, per-site, and overall storage budgets; oversized legacy histories remain deletable.
- Region capture checks the active source tab, URL, zoom, and viewport around screenshot capture. Starting another capture cannot replace an open draft.
- The first crop no longer tries to inset a nonexistent selection. Confirmation and annotation text dialogs remain in the private frame.
- Agent prompts mark page observations as untrusted. Five vulnerable transitive dependencies were updated. CI checks production advisories; release automation creates a draft.
- The separate Electron Inspector menu callback receives Electron's actual callback arguments. Its candidate package version is 0.2.1.

## Automated checks

Passed: `npm test`, `npm run check`, `npm run audit:dependencies`, `npm run package`, `npm run verify:package`, and `git diff --check`.

The test suites contain 48 Node tests (17 browser/privacy, 10 Electron, 21 MCP), plus the existing release assertions. The production dependency audit returned zero known vulnerabilities at validation time.

The verified browser ZIP contains 20 extension files and no Node dependencies, test fixtures, or MCP server. Its manifest retains only `storage`, `activeTab`, and `scripting`, with no static host permissions. Only `element.html` and `capture.html` are web-accessible for the overlay frames.

## Headless browser evidence

The owner was actively using their Mac. Browser tests ran in isolated, headless Chrome for Testing 151 profiles, using only synthetic fixtures in `test/fixtures`. No normal browser profile was automated after the owner's correction.

A temporary copy added test-only `<all_urls>` host access because Chromium's screenshot API otherwise requires a real toolbar/shortcut activation, which would interrupt the owner. This permission is absent from source and the release ZIP. These tests exercise editor behavior and real screenshot APIs; they do not replace a final exact-manifest activeTab activation check.

Observed in Chromium:

- Element pick, private note entry, local save, and overlay closure, with one source tab throughout. The website DOM contained neither the private note nor its input fields.
- An open Element draft rejected a second capture and retained its text. This was repeated in a fresh profile to eliminate a cached worker from an earlier test copy.
- Cancel → Keep editing retained a note; Cancel → Discard closed the overlay.
- Region drag crop, text label, opaque redaction, and save. The saved redacted record retained the user label and dropped both annotation anchors. The source tab remained open.
- A rendered hosted synthetic PDF captured and saved as a PDF Region while the source PDF remained open.
- An Element overlay initialized on a fixture with `frame-src 'none'`.
- Filtered History exported one selected Region. Its JSON and ZIP excluded the hidden Element note. The exported “before” PNG was visually inspected and retained the opaque mask.
- Deleting the filtered Region left the hidden Element record intact.
- The export dialog displayed the selected notes and evidence images.

Local screenshots and downloaded test artifacts are kept under ignored `output/playwright/`; they contain synthetic data only. They are development evidence, not Store screenshots.

To repeat without interrupting a user's desktop, use a separate headless Chromium profile, a temporary extension copy, and the local fixture server. Keep the test-only host grant in that copy, start with a fresh profile after background-worker changes, and compare all shipped scripts against the source or verified ZIP. Do not substitute a headed browser or the user's existing profile.

## Remaining release checks

The exact shipping manifest still needs its final real activeTab activation pass on the chosen release browser, plus local-file PDF permission behavior, current Store screenshots, and the end-to-end handoff from the installed extension through an actual MCP client. The protected-surface popup fallback has a broker regression test; its native window appearance was not exercised on the owner's desktop.

No Store upload, npm publication, website deployment, tag, or release publication is established by these checks. Keep the GitHub release draft until the remaining evidence is recorded. A clean test suite and dependency audit are not a security certification.
