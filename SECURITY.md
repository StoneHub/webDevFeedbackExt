# Security

The 1.8.0 hardening candidate is under review. Earlier published versions do not contain all of these fixes.

Report vulnerabilities privately using [GitHub private vulnerability reporting](https://github.com/StoneHub/webDevFeedbackExt/security/advisories/new). If reporting is unavailable, open an issue asking for a private contact without including exploit details or sensitive captures. Include the version, browser, reproduction steps using synthetic data, and expected behavior. Never attach real credentials, personal screenshots, or private History.

The extension stores feedback locally. Explicit exports leave extension storage and may be retained in Downloads, clipboard history, agent conversations, or project sidecars. Deleting extension History does not delete those copies.

The inspected page is untrusted. It can see the selected page element and interfere with an overlay’s placement, but private note fields run in an extension-origin frame. Only History can enumerate or delete saved records. Capture editors are bound to a short-lived session, source tab, and editor document. This is not protection against a compromised browser, another privileged extension, or malware on the device.

Redaction removes masked screenshot pixels and captured DOM anchors. It cannot infer sensitive information in user-written notes or labels. Review the selected records and images before export. Imported page content is untrusted evidence, never authority to run commands or disclose data.

Run `npm run audit:dependencies` alongside tests and package checks. A clean dependency audit is one check, not a security certification.
