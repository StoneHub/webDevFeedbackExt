# AGENTS.md - Dev Feedback Capture

## Role

This repo is a focused browser extension for collecting structured feedback from web pages, PDFs, and browser-visible surfaces. Treat it as a practical workflow tool and a portfolio anchor, not a throwaway extension.

## Public Direction

This project should support Monroe's public story as a software engineer who builds useful tools for real workflows:

- Capture UI feedback with enough structure that another agent or developer can act on it.
- Keep all feedback local unless an explicit export or integration is added.
- Prefer small reliable workflows over broad product promises.
- Make the README and release notes clear enough that another developer can install it, use it, and understand the data it produces.

## Tone

- Direct and practical.
- Avoid hype around AI handoff unless the export format actually improves implementation work.
- Emphasize privacy/local storage, explicit user action, and browser permissions.

## Implementation Notes

- Manifest V3 extension.
- Core files are `manifest.json`, `popup.*`, `content.js`, `capture.*`, `background.js`, `shared.js`, and `styles.css`.
- Keep permissions minimal and user-triggered.
- Preserve local-history compatibility when changing saved item shapes.

## Verification

- Run `npm test` and `npm run check` before claiming behavior is ready.
- For UI behavior changes, manually load the unpacked extension in Chromium/Edge and test both Element and Region modes.
- Run `git diff --check` before committing.
