# Store listing refresh — October 14, 2026

## Outcome and status

Improve the Chrome Web Store search card and detail page for Dev Feedback Capture. This is a listing and media refresh, not an extension package release.

Prepared locally: a full-bleed 440×280 promotional tile, editable SVG source, matching 1400×560 marquee, and focused overview copy. The illustration is promotional artwork, not a runtime screenshot.

Live publisher identity and published package version still require dashboard readback. The existing submission record identifies `monroe@flyingchangesfarm.net`, publisher `FlyingChanges Code`, item `hhdmfaaplpiokafjieefpgoppckijafc`. Do not use the farm Gmail account as evidence of publisher ownership.

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

## Remaining delivery

1. Monroe reported “im in.” The resumed Edge inventory shows the Chrome Web Store Developer Dashboard, but binding that tab returns `The extensions gallery cannot be scripted.` Edge is connected; this protected-page restriction supersedes the earlier disconnected-browser blocker. Do not attempt another UI capture/control route around the denial. The account, publisher, version, and draft/review state remain unverified by the agent.
2. Monroe checks the selected Google account, publisher, item, current public version, and existing draft/review state, and reports them in this chat. The agent has requested those details. Do not submit a pre-existing package change as part of this media-only request.

   The local checkout was fast-forwarded to current remote `main` (`dd672d4`) before backup. Its workflow has changed since the older release record: it copies the picking run after saving and uses a per-page extension-menu list. Avoid promising the retired acceptance-check editor, History panel, or AI Bundle without checking the published version.
3. Monroe opens this item's Store listing section, uploads `promo-small.png` as the small promotional tile and `promo-marquee.png` as the optional marquee, and pastes `listing-description.txt` into the overview/description after the account/version check. Keep actual runtime screenshots in the screenshot slots. Save the changes and report the resulting review/submission controls to the agent before submitting if an existing package draft is included.
4. Monroe performs the final Store submission because the dashboard cannot be scripted. The agent records the reported review/publication status and verifies the public listing through an available permitted read surface when Google applies the update. Submission is distinct from a live listing.

No browser credentials, extension package, account identity, domain, or DNS changes are included in this refresh. Monroe owns the protected dashboard interactions; the agent owns the prepared assets, copy, guidance, record, and public verification through a permitted surface. The original listing-refresh outcome remains pending.

Cleanup: retain the source and upload assets in this repository for the pending listing update. No development server, browser test process, or temporary checkout was started. The temporary public-domain lookup file was removed.

Git delivery: GitHub rejected the direct `main` push with `GH006` because the required `validate` status check is expected. Preserve this work on `codex/store-listing-refresh`; do not bypass protection. The agent owns integration through the repository's required review/check flow. The local main commit includes only this refresh; remote main still ends at `dd672d4` until integration. Retain the remote branch until its changes are integrated or explicitly abandoned.

## Image requirements

Google specifies 440×280 promotional tiles, optional 1400×560 marquees, and actual full-bleed 1280×800 or 640×400 screenshots: https://developer.chrome.com/docs/webstore/images
