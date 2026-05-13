# Dev Feedback Capture Catalog And Release Plan

## Goal

Make Dev Feedback Capture a small, credible software offering in the `monroes.tech/software` catalog.

The product story should be: a browser extension for collecting structured UI feedback from pages and PDFs, with local-first storage and exports that help developers or agents act on the feedback.

## Catalog Metadata

Create a root `product.json` for `monroes.tech/software` to consume:

```json
{
  "slug": "dev-feedback-capture",
  "name": "Dev Feedback Capture",
  "kind": "browser-extension",
  "summary": "Chromium extension for capturing structured feedback on pages, PDFs, and browser-visible UI.",
  "status": "preview",
  "repo": "https://github.com/StoneHub/webDevFeedbackExt",
  "liveUrl": "",
  "releaseUrl": "https://github.com/StoneHub/webDevFeedbackExt/releases",
  "downloadUrl": "",
  "supportUrl": "",
  "license": "",
  "platforms": ["Chrome", "Edge", "Chromium"],
  "requirements": ["Developer Mode for unpacked install until packaged releases exist"],
  "highlights": [
    "Element capture with selectors and notes",
    "Region capture for screenshots and PDFs",
    "Local history with JSON, Markdown, and AI prompt exports"
  ],
  "screenshots": []
}
```

## Release Work

Current blocker: there is no packaged zip or store listing. Installation is manual from the repo.

Work items:

1. Add a license file or explicitly decide the extension is source-visible but not licensed for reuse.
2. Add a packaging script that creates a versioned zip from the extension files.
3. Add `CHANGELOG.md` with a current `1.2.0` entry.
4. Publish the first GitHub Release with the zip asset.
5. Update `product.json` `downloadUrl` after the release asset exists.
6. Later, write Chrome Web Store listing/privacy copy if store distribution becomes the chosen path.

## Public Copy Rules

- Emphasize user-triggered capture and local extension storage.
- Keep permission language clear.
- Do not imply cloud sync or hosted AI integration until it exists.
- Use "Support this project" rather than hard-selling.

## Verification

```bash
npm test
npm run check
git diff --check
```

Manual check before release:

1. Load unpacked extension in Chrome or Edge.
2. Test Element mode on an HTTP page.
3. Test Region mode on a rendered PDF or normal page.
4. Confirm JSON, Markdown, and AI prompt export still work.
