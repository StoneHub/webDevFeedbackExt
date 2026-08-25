# Dev Feedback Capture Context

## Glossary

- **Page Capture.** Feedback captured from a browser-visible web page or PDF.
- **Element Capture.** A Page Capture focused on one identifiable page element and its surrounding evidence.
- **Region Capture.** A Page Capture focused on a selected visible region, annotations, and supporting context.
- **Capture Record.** One saved, portable feedback item with its request, evidence, and source context.
- **History.** The user-facing collection of saved Capture Records.
- **Agent Handoff.** An explicit local transfer of Capture Records to a coding agent for implementation and separate verification.
- **Host App.** An Electron application whose developer explicitly installs and activates the Electron Inspector.
- **Electron Inspector.** The developer-only adapter that captures Host App interface feedback as Capture Records. It does not load or simulate the browser extension.
