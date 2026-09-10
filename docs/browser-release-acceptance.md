# Automated browser release acceptance

As of September 9, 2026, the owner authorizes repeatable automated acceptance to replace the human-only browser release gate. GitHub publication requires a passing gate against the exact ZIP being published. Chrome Web Store submission, listing screenshots, and Google approval remain separate.

Run from a clean checkout with Node 22 or later and the standard `unzip` utility:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm run check
npm run audit:dependencies
npm run package
npm run test:browser
npm run verify:package
git diff --check
```

`npm run test:browser -- /absolute/path/to/package.zip` accepts an explicit ZIP. It extracts into a fresh temporary directory, loads those files with the original manifest, and verifies the ZIP digest and every extracted file before and after execution. No host permissions, content scripts, or test hooks are added to the extension. The locked Playwright dependency selects the acceptance browser. CI and release workflows run the same script after packaging; the release workflow attaches the resulting digest-bound `acceptance.json` to the draft release alongside the tested ZIP and checksum.

The harness uses Chrome for Testing's extension debugging API to invoke the actual toolbar action on the source tab. This grants real `activeTab` access and opens the native popup. Trusted browser mouse events operate popup controls; trusted keyboard and pointer events select page elements. Native popup targets require a CDP session because they are not ordinary Playwright tabs.

Coverage includes:

- Toolbar activation, keyboard selection, Escape, pointer selection, private editor context, and Save & pick next.
- Refusal to replace an open draft, keep-editing/discard dialogs, a real 500-record capacity rejection, and a successful single-record retry.
- On-page History without new tabs, note/check editing with preserved capture identity, and persistence after closing the source tab.
- Synthetic legacy Region/PDF and Visual/Add records, decoded original/proposed/redacted images, selected deletion, and preservation of hidden records.
- All five selected exports: preview contents, downloaded JSON/HTML/ZIP bytes, rendered HTML, and actual clipboard readback.
- Native restricted-page popup History with capture disabled.

Evidence is written to `output/browser-acceptance/`: a JSON report tied to the ZIP SHA-256, browser trace, synthetic screenshots, and export artifacts. Temporary profiles, server, and browsers are closed at completion. CI retains evidence even when the test fails. Do not treat partial output or an old passing report as acceptance of a different digest.

## Narrow limits

This gate exercises isolated Chrome for Testing, not every installed Chrome/Edge version. CDP toolbar activation uses the browser's real action path but does not exercise the operating system's global shortcut dispatcher; manifest/command registration and trusted in-page keyboard selection provide separate evidence. A user-customized or OS-conflicting shortcut may still need adjustment.

Legacy/capacity data is seeded through Chrome's storage debugging API. Clipboard read permission is granted only to the temporary browser context so tests can read back exports; the shipping manifest remains `storage`, `activeTab`, and `scripting`. Clipboard text is restored after readback. Screenshot and DOM assertions supplement exported-byte and persisted-record assertions; they do not certify every screen size or assistive technology.

The browser ZIP does not include the separate Electron package, local MCP companion, or unmerged SwiftUI prototype. MCP tests validate the separate companion contract; end-to-end implementation in a consumer's project and that consumer's Downloads configuration are not prerequisites for the browser ZIP's GitHub publication.
