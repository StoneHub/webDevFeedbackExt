# Store listing refresh — October 14, 2026

## Outcome and status

Improve the Chrome Web Store search card and detail page for Dev Feedback Capture. This is a listing and media refresh, not an extension package release.

Prepared locally: a full-bleed 440×280 promotional tile, editable SVG source, matching 1400×560 marquee, and focused overview copy. The illustration is promotional artwork, not a runtime screenshot.

Current delivery: v1.8.1 with the selected element-picker/pencil icon is published on GitHub and submitted to Google for review. Verified account: `monroe@flyingchangesfarm.net`; publisher: `FlyingChanges Code`; item: `hhdmfaaplpiokafjieefpgoppckijafc`. Dashboard readback: Pending review. Automatic publication after approval was explicitly authorized. Store users still receive public v1.8.0 until Google approves v1.8.1.

Validation: `npm test`, `npm run check`, and `git diff --check` passed. Both PNGs were visually inspected and their exact dimensions and three-channel RGB format verified. No extension runtime behavior was changed by this listing refresh. These checks do not establish Store delivery.

## Assets

- Small promotional tile: `store-assets/promo-small.png` (440×280, RGB PNG).
- Optional marquee: `store-assets/promo-marquee.png` (1400×560, RGB PNG).
- Editable sources: matching `.svg` files.
- Paste-ready description: `store-assets/listing-description.txt`.
- Retain the current browser-code extension icon. The purple speech-bubble icon in the supplied search result is obsolete; verify whether the dashboard media or the published package causes it before replacing it.
- Keep existing runtime screenshots until current-version replacements can be captured. Do not submit artwork as screenshots.

## Listing copy

Keep the existing package title and short description for this media-only refresh. They are package metadata, so changing them belongs to a separately verified extension upload.

### Overview

Turn “this needs changing” into feedback a developer can act on.

Pick an element on a webpage, describe the change, and keep the request with its selector, visible text, page URL, and captured context.

CAPTURE → REVIEW → HAND OFF

• Pick the exact element you want to discuss.
• Write a clear change request beside the element.
• Keep captured feedback on your device.
• Copy or export the context for a developer or coding agent.

LOCAL STORAGE, EXPLICIT SHARING

Saved feedback is stored locally in your browser. There is no cloud sync, telemetry, hosted AI connection, or always-on page monitoring. Access to the current tab starts when you activate capture.

Captured webpage content and your notes may contain private information. Review them before sharing. The extension provides context for a handoff; it does not sign in to an AI account or implement changes for you.

Element capture works on accessible webpages. Browser-internal pages and some embedded content cannot be captured reliably.

Dev Feedback Capture is an independent tool from FlyingChanges Code.

## Baseline verification — earlier October 15, 2026

The Codex built-in browser successfully accessed the dashboard. The earlier “extensions gallery cannot be scripted” error was a limitation of the Edge extension-based browser connection, not a general requirement for Monroe to perform all dashboard edits. Account switching through the displayed Google account link reached the correct publisher without a new agreement or developer registration.

Verified live:

- Google account: `monroe@flyingchangesfarm.net`.
- Selected publisher: `FlyingChanges Code`.
- Store item: `hhdmfaaplpiokafjieefpgoppckijafc`.
- Store status: Published — public; published and draft packages both v1.8.0 with `storage`, `activeTab`, and `scripting`.
- Public detail page: v1.8.0, updated September 7, 2026.
- Latest stable GitHub release: v1.8.0, published September 9, 2026 at 10:24 p.m. America/New_York; source `e2455a4d3bcb1f5e08bbc538ae4eaa6fe3d81b2d`.
- Release ZIP SHA-256: `248b249a6821dfcafe728726ecdb51c4f52e76e652fddb2a9f5e75a7d984f038`. The attached checksum and passing acceptance report agree. All 19 extracted file hashes match the report.
- Published Store CRX SHA-256: `79d1646d0f478873fbd291b90b40b7651c6008e0238a9d91625524567b620e4a`. All 18 non-manifest release files match byte-for-byte. The manifest matches after removing Google's added `update_url`; Google also supplies `_metadata/verified_contents.json`.
- The working checkout also declares 1.8.0 but differs from the released files in 14 places. Do not describe the checkout as the exact released build or upload it as this listing refresh.
- Native Edge UI confirms an enabled unpacked v1.8.0, ID `fnmbjammjfpnjephkchgpkeehoehiell`, loaded from `/Users/monroe/Developer/GitRepos/webDevFeedbackExt`. It therefore uses the development checkout, which differs from the exact release. The Store extension ID is distinct; installing it will not migrate the development copy's local notes.

Saved on the dashboard, with “Item saved.” readback:

- New 1,073-character description from `store-assets/listing-description.txt`.
- Small promotional tile and optional marquee.
- Browser-code Store icon taken from the verified release ZIP, replacing the purple speech-bubble icon. Monroe explicitly approved the irreversible old-image removal.

No extension package, permissions, account settings, domain/DNS, or existing runtime screenshot was changed.

## Remaining delivery and owner

The first final-submission attempt was rejected by automatic approval review because automatic publication needed explicit authorization. Monroe then answered yes to the exact submission/publication request. The subsequent submission succeeded: Google displayed “Your extension was submitted for review,” then the item status changed to Pending review. No submission blocker remains.

Google owns review; approval triggers the authorized automatic publication. The agent owns public listing verification when review resolves. Receipt and pending-status screenshots are retained locally. No periodic monitoring has been requested or scheduled.

Monroe selected the published Store release. The agent opened the official Store item in native Edge and confirmed Add Extension; Edge displayed “Dev Feedback Capture: AI UI Review & Prompts is now installed.” Monroe then reported that he had installed the Store version and had taken over. The unpacked copy was not removed or disabled by the agent, and its final enabled/disabled state was not verified after the handover. Its notes remain associated with its separate ID. No development-copy data was deleted. Store installation is confirmed; a new capture/save interaction was not exercised in this task.

Git delivery: the direct main push was rejected with `GH006` because the required `validate` check was expected. The assets and earlier task record are backed up on `codex/store-listing-refresh`. The agent owns integration through the repository's required review/check flow; do not bypass protection. Retain that branch until integrated or explicitly abandoned.

Cleanup and retained evidence: after Store installation, the disposable downloaded ZIP/CRX and extracted release directory were removed. The compact release acceptance report, checksum, submission-dialog screenshot, successful-submission receipt, and pending-status screenshot are retained under ignored `output/store-listing-refresh-2026-10-15/` for the pending Google review. The agent owns removing those local evidence copies after public listing verification or explicit closure. The task-created CRX was moved out of Downloads before cleanup. No test browser, dev server, or temporary checkout was started; the Codex dashboard, public listing, and latest-release browser tabs are intentionally retained for Monroe. Redundant Codex tabs were closed; Monroe took over native Edge and closed its task tabs.

## Image requirements

Google specifies 440×280 promotional tiles, optional 1400×560 marquees, and actual full-bleed 1280×800 or 640×400 screenshots: https://developer.chrome.com/docs/webstore/images

## Icon refinement — design review

Monroe requested further icon work after the listing submission. Two vector concepts are saved under `docs/icon-refresh/`: `pick-and-note.svg` (A, feedback bubble and cursor) and `element-picker.svg` (B, selected-element corners and cursor). Each has a toolbar-specific SVG crop and rendered 128/48/16 px PNGs. `comparison.png` shows the existing icon and both candidates at actual sizes.

The 128 px candidates have 16 px transparent padding; toolbar assets use a tighter optical crop. All candidate PNG dimensions and vector rendering were checked visually. No shipping icon, package, installed extension, or pending Store submission was changed. No new runtime test is needed for these unselected design assets. The agent recommends B for its more specific element-picking silhouette; Monroe owns choosing a direction or requesting another iteration before package/listing delivery. Retain these source and preview assets for that decision.

Monroe selected B as the base and requested one additional cue for changing or removing the selected element. `element-change.svg` adds a pencil badge; `element-remove.svg` adds a minus badge, each replacing the lower-right selection corner. Matching toolbar SVGs and 128/48/16 px PNGs are included. `change-intent-comparison.png` compares both refinements with B. The agent recommends the pencil for the broader change-request workflow; the minus emphasizes removal. These refinements await design selection and do not change the already submitted Store icon or installed package.


## Selected pencil icon release — submitted

Monroe selected the middle B + Change concept and authorized updating both extension and Store listing. Build v1.8.1 from published v1.8.0, with no browser behavior or permission changes. The isolated release source is `codex/icon-release-1.8.1` at `dd07467`; its worktree is `/private/tmp/dfc-icon-release-181`. The agent owns this worktree and all its output, browser download, and npm cache directories; remove it after the tested artifacts are copied back and the source is backed up.

The existing Node dependency-audit fix was reused, then two tooling dependencies refreshed; `npm audit --omit=dev` is clean. The Node/MCP dependencies and raster generator are excluded from the browser ZIP. All 49 existing tests, release assertions, source checks, and package checks pass. The ZIP has exactly 19 files and differs from the published v1.8.0 browser files only in the three icon PNGs and manifest version. The exact-ZIP browser acceptance gate passed all ten groups in a temporary Chrome for Testing profile, which was closed and removed by the harness. The filesystem sandbox blocked the first launch; the authorized isolated test succeeded outside that sandbox.

Updated promotional artwork now uses the selected pencil mark. The current Store submission remains pending review; replacement has not started while the new package is being accepted. The agent owns release publication, pending-review replacement, refreshed icon/promo uploads, review readback, default-branch integration, and task output cleanup. Preserve the Store installation and all local feedback data; Google publication and the installed browser's subsequent update remain separate evidence.


Release package accepted: `dist/release-v1.8.1/dev-feedback-capture-v1.8.1.zip`, SHA-256 `72a1a50825a75f759a4cfc02526361e03327e819234ed345327e11b417fcc613`. Its checksum and digest-bound `acceptance.json` are retained alongside it. The worktree's browser and npm cache directories are disposable and owned by this task. Canonical source tests (54 tests), checks, and production audit also pass after adopting the new icon generator and assets.

The agent attempted to select Cancel review so the new package and artwork could replace the pending submission. Automatic approval review rejected that action because cancellation was not explicitly authorized. No cancellation occurred. A bundled question now requests approval to cancel/restart review, replace the three image assets, upload v1.8.1, resubmit with automatic publication, and publish the exact tested GitHub release. The agent must await this answer before those dependent external changes. This is the current Store delivery blocker; the package and media are complete.


## Final v1.8.1 delivery

Monroe explicitly approved canceling the earlier review, replacing its package/icon/promotional images, resubmitting with automatic publication, and publishing GitHub v1.8.1. Those actions succeeded. Google accepted the exact tested ZIP; the package page showed draft 1.8.1 with the original three permissions and published 1.8.0. The refreshed Store icon and both promotional images were uploaded and saved. Final Google receipt: “Your extension was submitted for review”; subsequent item status: Pending review. The earlier automatic-review rejection is resolved by the explicit approval and successful resubmission.

Public release: https://github.com/StoneHub/webDevFeedbackExt/releases/tag/v1.8.1 — non-draft, stable, exact source `dd07467aaf8955530fb011e4dfb0247ec4934ceb`. GitHub's uploaded ZIP digest matches `72a1a50825a75f759a4cfc02526361e03327e819234ed345327e11b417fcc613`; checksum and passing acceptance report are attached.

Canonical source and artwork integrated through https://github.com/StoneHub/webDevFeedbackExt/pull/39 with a passing required validate check; default main merge `91e21ff`. The usual checkout was aligned to that merged revision after verifying identical file contents. Main retains its existing unreleased workflow; the v1.8.1 release tag preserves the icon-only hotfix baseline.

Cleanup: removed `/private/tmp/dfc-icon-release-181` after verifying its clean source was backed by the public release tag and branch, and copying its tested ZIP/checksum/report to ignored `dist/release-v1.8.1/`. This also removed task-owned browser downloads, dependency tree, npm cache, and temporary test outputs. The acceptance harness closed its isolated browser/server/profile. Retain the compact release artifacts and `output/store-icon-release-1.8.1/` receipts until Google review is resolved; the agent owns removing duplicate local artifacts after public listing verification. The selected SVGs and media sources remain in Git. No user feedback was removed, and the installed Store extension was not replaced with an unpacked build.

Next external owner: Google review. Approval triggers automatic Store publication, then Store-installed Edge copies receive v1.8.1 through the normal browser update cycle. Public Store publication and installed 1.8.1 runtime remain unverified. No recurring monitor was requested or created.
