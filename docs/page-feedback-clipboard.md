# Save copies this page's feedback

Status: fixed on `fix/page-feedback-clipboard`.

## Problem

Saving a note (Save or Enter) is meant to leave everything noted on the page on the clipboard, ready to paste into an issue or a coding agent. Two things got in the way.

1. **The clipboard held only the picking run.** The background kept a per-tab list of the item ids saved since Pick was pressed and copied only those. After Stop and Start, or in a second tab on the same page, the clipboard lost every earlier note, though the extension menu still listed them.
2. **A blocked clipboard write was swallowed.** The note frame awaited the save, then called `navigator.clipboard.writeText`. A rejection turned into `copied:false`, the frame closed, and a 3-second toast said "Saved. Copy it from the extension menu." The user had no way to retry from the note, and the toast was easy to miss.

### Why the write fails

The note frame (`element.html`) is an extension iframe inside the page. Chrome applies the page's Permissions Policy to it: a page that sends `Permissions-Policy: clipboard-write=()` blocks the Clipboard API in every frame, and the frame's `allow="clipboard-write"` cannot override that. Reproduced in Chromium 153 (Playwright 1.63, disposable profile) with a fixture page that sends the header: `writeText` rejects with `NotAllowedError ... blocked because of a permissions policy`, while the frame is focused and has user activation. In the same frame `document.execCommand('copy')` still copies, with no extra extension permission.

Not the cause: awaiting the save before the write. With an ordinary page and no granted permissions, the write after the await succeeds (activation lasts long enough).

Unverified: which real sites send the blocking header. Some sites' Cloudflare challenge pages do; whether their app pages do was not checked.

The browser acceptance gate granted `clipboard-read` and `clipboard-write` to the whole browser context, so it could never see a refused write.

## Intended behavior

- Save/Enter stores the element and note locally, then writes the complete feedback for this page to the clipboard, oldest first, the same text as **Copy all** in the extension menu.
- "This page" is the existing page match: the same storage key and the same shareable URL (no query, hash, or credentials). Other pages stay out, including other paths on the same site. Legacy Region records on the page are included, as in Copy all.
- The text comes from stored records, never from whatever was on the system clipboard before.
- It keeps working across Stop/Start and across tabs on the same page.
- A retry never stores the item twice.
- A failed write never reports success and never discards the note: the note stays open, says it was saved but not copied, and Save becomes **Copy again**. × closes it and the toast points to Copy all.

## Acceptance criteria

- [x] Each save returns the page's stored feedback, oldest first, with a count of page items (unit).
- [x] Stop/Start does not reset the aggregate; other pages and other paths on the site are excluded; legacy records are kept (unit).
- [x] A blank note saves just the element and still copies the page (unit, browser).
- [x] Retrying a save keeps one stored record (unit, browser).
- [x] Browser acceptance runs the copy with no clipboard permission granted to the extension or the page; readback uses a separate origin.
- [x] On a page that blocks the Clipboard API, Save still copies (fallback) (browser).
- [x] When every write path fails, the note stays open with Copy again; the retry copies; nothing is stored twice (browser).
- [x] Saves in a second tab on the same page copy the earlier tab's notes too (browser).
- [x] Picking resumes after a successful save; × after a failed copy closes and keeps the saved record.
