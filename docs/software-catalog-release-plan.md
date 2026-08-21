# Dev Feedback Capture Catalog And Release Plan

## Goal

Make Dev Feedback Capture a small, credible software offering in the `monroes.tech/software` catalog.

The product story is: a Chromium extension for collecting structured feedback from pages and PDFs, with local-first History and one explicit Agent Handoff that helps a developer or coding agent act on the feedback.

## Current State

- `product.json` exists for catalog ingestion.
- `CHANGELOG.md` preserves historical release entries and submission notes.
- `LICENSE` marks the project as source-visible with all rights reserved.
- `npm run package` creates the versioned release zip from the current source checkout.
- `.github/workflows/release.yml` publishes a zip asset when a matching `v*` tag is pushed.
- GitHub Release `v1.2.0` is published with `dev-feedback-capture-v1.2.0.zip`.

`product.json.downloadUrl` remains a fallback to a known published asset. Do not update it until the active browser capture core passes the manual browser gate and the matching asset is actually published. The latest-release API remains the preferred source for consumers that can resolve the newest matching asset automatically.

## Catalog Metadata

`product.json` is the source file for site ingestion. The site should treat `downloadUrl` as optional and use these fields for automatic latest-release resolution:

- `repo`: `https://github.com/StoneHub/webDevFeedbackExt`
- `releaseUrl`: `https://github.com/StoneHub/webDevFeedbackExt/releases`
- `distribution.latestReleaseApi`: `https://api.github.com/repos/StoneHub/webDevFeedbackExt/releases/latest`
- `distribution.assetNamePattern`: `dev-feedback-capture-v{version}.zip`

Best path for `monroes.tech`: fetch the GitHub latest release API, find the first asset whose name matches `dev-feedback-capture-v*.zip`, cache the resolved `browser_download_url`, and fall back to `releaseUrl` if GitHub is unavailable or no asset exists.

Counterpoint: a checked-in static `downloadUrl` is simpler, but it will drift every time the extension version changes unless the release pipeline also updates site metadata.

## Release Steps

1. Confirm `package.json` and `manifest.json` versions match.
2. Run local release checks:

   ```bash
   npm test
   npm run check
   npm run package
   git diff --check
   ```

3. Manually load the unpacked extension in Chrome or Edge.
4. Test Element capture on an HTTP page.
5. Test Region capture on a normal page and a rendered PDF.
6. Open History and confirm saved Element and Region/PDF records, local exports, and `Send to Codex` MCP import.
7. Create and push a matching tag only after the active release gates are approved:

   ```bash
   git tag v<version>
   git push origin v<version>
   ```

8. Verify GitHub Releases contains `dev-feedback-capture-v<version>.zip`.
9. Update `product.json.downloadUrl` only if the site requires a static URL. Prefer automatic latest-release resolution.

## Public Copy Rules

- Emphasize user-triggered capture and local extension storage.
- Keep permission language clear.
- Do not imply cloud sync or hosted AI integration until it exists.
- Call out that screenshot crops may contain sensitive visible page content and stay local until cleared.
- Use "Support this project" rather than hard-selling.
