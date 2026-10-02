# Quick start

1. Install Dev Feedback Capture from the Chrome Web Store, or load the unpacked extension folder in Chrome/Edge Developer Mode.
2. Open a webpage, click the extension icon, and choose **Pick an element**.
3. Click the element. Write what should change, or leave the note blank to save just the element.
4. Press Enter. Everything saved since you started picking is now on your clipboard; keep clicking to add more.
5. Press Escape to stop. Open the extension menu to copy, download, or delete this page's captures.

While picking, Tab to a target and press Alt+Enter. Shift+Enter adds a line to a note; **×** closes it without saving.

For a local HTML file (`file://`), enable **Allow access to file URLs** in the extension's **Details** in Chrome/Edge extensions, then return to the file and reopen the menu. The menu's **Open extension settings** button takes you there when access is off; only you change that setting.

**JSON** downloads the records for the separately configured local MCP companion. See `docs/mcp-local-agent.md` for inbox and project setup.

New Region/PDF capture is no longer offered. Previously saved records still appear in the extension menu on their page. Capture requires an accessible webpage; browser-internal pages and PDF viewers are unsupported.
