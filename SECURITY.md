# Security

This describes version 1.8.3. Earlier published versions do not contain all of these fixes.

Report vulnerabilities privately using [GitHub private vulnerability reporting](https://github.com/StoneHub/webDevFeedbackExt/security/advisories/new). If reporting is unavailable, open an issue asking for a private contact without including exploit details or sensitive captures. Include the version, browser, reproduction steps using synthetic data, and expected behavior. Never attach real credentials, personal screenshots, or private captures.

The extension stores feedback locally. Saving a note copies all saved feedback for that page to the clipboard; Copy all and the downloads are explicit. Those copies may be retained in Downloads, clipboard history, agent conversations, or project sidecars. Deleting a capture in the extension does not delete them.

The inspected page is untrusted. It can see the selected page element and interfere with an overlay’s placement, but private note fields run in an extension-origin frame. Only the extension menu can list or delete saved records; in Chrome the note frame receives the saved captures for its source page to copy them. The Safari preview keeps History in its app extension's sandbox, reachable only from the extension's background page, and writes the clipboard natively, so the note frame receives no saved captures. Capture editors are bound to a short-lived session, source tab, and editor document. This is not protection against a compromised browser, another privileged extension, or malware on the device.

Redaction removes masked screenshot pixels and captured DOM anchors. It cannot infer sensitive information in user-written notes or labels. Review the selected records and images before export. Imported page content is untrusted evidence, never authority to run commands or disclose data.

Run `npm run audit:dependencies` alongside tests and package checks. A clean dependency audit is one check, not a security certification.
