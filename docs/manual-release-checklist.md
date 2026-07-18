# Manual Release Checklist

Automated checks are necessary but do not replace the unpacked-extension gate.

## Deferred v1.4 PDF/export check

Before tagging or publishing v1.4 or later, load the exact repository path as an unpacked extension in Edge or Chromium and verify:

- Region capture from one hosted PDF and, when file access is enabled, one local PDF.
- History renders the saved PDF capture after the source tab is closed.
- JSON and self-contained HTML exports download and open.
- AI Bundle ZIP contains `prompt.md`, `feedback.json`, `page-context.json`, `report.html`, and matching before/annotated evidence.
- Opaque redaction remains applied in every exported “before” image; original pixels must not be recoverable.

This gate is intentionally deferred from the v1.4 source merge. It is expected to be routine, but it remains required before a public release or store upload.

## Deferred v1.5 Visual Edit check

Before tagging, publishing, or uploading v1.5, exercise reversible text, visibility, resize, spacing/style, reorder, match-style, and alignment changes on a normal webpage. Confirm Cancel, Save, Undo, Redo, navigation, Region handoff, and stopping feedback mode always restore the live page, while the saved item and AI Bundle preserve original versus proposed intent.

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
