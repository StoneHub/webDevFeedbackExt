# Store listing refresh — October 14, 2026

## Outcome and status

Improve the Chrome Web Store search card and detail page for Dev Feedback Capture. This is a listing and media refresh, not an extension package release.

Prepared locally: a full-bleed 440×280 promotional tile, editable SVG source, matching 1400×560 marquee, and focused overview copy. The illustration is promotional artwork, not a runtime screenshot.

Submitted for Google review on October 15, 2026, using verified account `monroe@flyingchangesfarm.net`, publisher `FlyingChanges Code`, item `hhdmfaaplpiokafjieefpgoppckijafc`. Dashboard readback: Pending review. Automatic publication after approval was explicitly authorized by Monroe. The public listing still needs Google approval before the new assets appear.

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

## Live verification — October 15, 2026

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
