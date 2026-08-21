# Manual Release Checklist

Automated checks are necessary but do not replace the unpacked-extension gate.

Public Store status checked July 28, 2026: v1.6 is public in the Chrome Web Store. Store approval is not proof that the deferred checks below passed. Keep them open and do not tag, upload, or call v1.8 runtime-verified until the relevant evidence is recorded.

## v1.8 Feedback Session check

Before tagging, uploading, or calling v1.8 runtime-verified:

- Reload the unpacked extension from this exact repository checkout and confirm Chrome identifies it as v1.8.0.
- Start a Feedback Session on a normal `https` page and approve the optional navigation-recording permission. Confirm the popup closes, the page shows the red REC control, and the extension badge shows `REC`.
- Exercise a normal page load, Back/Forward, one SPA `pushState` route, one hash route, clicks, a field edit, a form submission, navigation keys, and a debounced scroll. Stop and verify the events are ordered in Feedback Sessions.
- In a fixture that does not echo input into its path, title, labels, or errors, type a unique value into a normal field and a password field. Confirm neither field value nor printable keystrokes appear. Separately verify the disclosure that site-supplied paths, titles, and labels remain visible.
- Use a URL with a unique query parameter and fragment. Confirm the export preserves the origin/path but removes both unique values and declares the redactions.
- Pause recording, perform a sensitive test action and navigation, then Resume. Confirm the sensitive interval has only Pause/Resume boundaries and no page/action detail.
- Navigate to a different origin. Confirm the navigation remains in the timeline, interaction capture reports a gap, and opening the extension popup on the new origin restores the visible recorder before more page actions are recorded.
- Trigger one failed navigation and one observable page/resource error. Confirm the timeline captures the sanitized error location/type without the raw application error message or form contents.
- Stop from both the page control and popup in separate sessions. Close the source tab during a third session and confirm it is saved as interrupted without leaving a stale REC badge.
- Add and save an issue summary, download one-session JSON, copy Markdown, delete one session, and clear all completed sessions.
- Reach each synthetic safety boundary (1,500 events, 5 MiB per session, and 8 MiB total local-storage soft limit) and confirm the session pauses, marks itself truncated, and does not corrupt existing feedback history.
- Remove the optional `webNavigation` permission during an active session and confirm the session is interrupted, the overlay disappears, and the REC badge clears.
- Run Element, Visual, and Region workflows while a Feedback Session is active, then repeat their normal smoke checks after stopping the session.
- Confirm only the latest 20 sessions are retained and existing Element/Region history remains readable and exportable.

Release/privacy gates:

- Update the Store listing and privacy policy to describe the user-started browsing-activity timeline, optional `webNavigation` permission, exact redactions, local retention, and explicit export.
- Reconfirm the Chrome Web Store Privacy tab declarations for Web history, User activity, and Website content.
- Do not describe Feedback Sessions as screen recording or video. v1.8 records a structured timeline; optional WebM capture is a separately permissioned future feature.
- Workplace deployment remains an administrator/user decision. Do not claim compatibility with managed-browser policy until tested in the actual work browser profile.

## v1.7 compact-panel and icon check

Before tagging or uploading v1.7:

- Reload the unpacked extension from this exact repository checkout.
- Start Element and Visual modes and confirm the change list opens expanded with the paper-and-indigo palette.
- In Element and Visual modes, drag the collapsed change list near every viewport edge and confirm it stays anchored to the nearest edge.
- Resize the browser window and confirm the collapsed list remains visible on its selected edge.
- Confirm **⌃** expands the list, **⌄** collapses it, and both controls have matching accessible labels.
- Confirm the Browser Code icon is legible in the browser toolbar and extension-management list at the packaged sizes.

## Deferred v1.4 PDF/export check

Before tagging or publishing v1.4 or later, load the exact repository path as an unpacked extension in Edge or Chromium and verify:

- Region capture from one hosted PDF and, when file access is enabled, one local PDF.
- History renders the saved PDF capture after the source tab is closed.
- JSON and self-contained HTML exports download and open.
- AI Bundle ZIP contains `prompt.md`, `feedback.json`, `page-context.json`, `report.html`, and matching before/annotated evidence.
- Opaque redaction remains applied in every exported “before” image; original pixels must not be recoverable.

This gate was intentionally deferred from the v1.4 source merge. It is expected to be routine, but it remains required before the submitted release is described as runtime-verified.

## v1.7 direct Visual Edit check

Before tagging, publishing, or uploading v1.7, select one normal-page element and drag its outline to move it with a mouse or pointer. Resize it with the corner handle and, when touch-capable hardware is available, repeat both gestures with a finger. Confirm Undo, Redo, and Reset work after direct gestures. Confirm Cancel, Save, navigation, Region handoff, and stopping feedback mode always restore the live page, while the saved item and AI Bundle preserve original versus proposed intent.

The source may merge to `main` for code review and local trying before this hands-on gate is complete. Do not call the release runtime-verified until this checklist passes.

## v1.6 local MCP handoff check

Before tagging, publishing, or uploading v1.6:

- Download a real History JSON export using `Download JSON for MCP`.
- Launch the MCP companion from an actual local MCP client with explicit project and inbox roots.
- Import that exact file, then exercise project status, list, get, implementation brief, and evidence resource reads.
- Confirm evidence bytes are available only through resource reads and base64 data URLs are absent from stored item JSON.
- Create one agent-authored project item, verify an identical `clientRequestId` is idempotent, and exercise a revision conflict.
- Implement one small project change with the agent's normal coding tools; record `in-progress`, `implemented`, and separately `verified` status with a passing check.
- Confirm the extension still requests only `storage`, `activeTab`, and `scripting`, and that the extension ZIP contains no MCP server or Node dependency files.

Do not claim a direct browser bridge in v1.6. The current handoff is an explicit local file import; a native-messaging bridge remains a separately permissioned future gate.
