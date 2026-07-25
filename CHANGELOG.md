# Changelog

## 1.7.0 (Release candidate)

- Replaced the generic speech-bubble icon with the Browser Code mark across packaged 16, 48, and 128 pixel assets.
- Anchored the collapsed in-page change list to the nearest viewport edge while preserving drag movement around the viewport perimeter.
- Replaced ambiguous plus/minus controls with explicit up/down chevrons and clearer accessible labels.
- Added the v1.7 product, Store-listing, and monetization plan plus reusable icon-choice source assets.

## 1.6.0 (Published July 20, 2026)

- Added a project-scoped local MCP companion over stdio with list, get, create, import, evidence, implementation-brief, and revision-checked status tools.
- Added an ignored `.dev-feedback` sidecar with atomic JSON records, an append-only event trail, validated local evidence, and explicit project/inbox path boundaries.
- Reused the existing History JSON export as the first explicit extension-to-agent handoff without reading Chromium internals, opening a localhost port, or adding extension permissions.
- Kept source editing and browser control outside the MCP server; the connected coding agent uses its existing project tools and records bounded implementation status separately.

## 1.5.0 (Source checkpoint)

- Added Visual Edit Mode for reversible move, resize, leaf-text rewrite, hide, sibling reorder, curated style, match-style, and alignment previews.
- Added bounded undo/redo and guaranteed page restoration on Save, Cancel, mode exit, and navigation.
- Stored requested mutations separately from visual suggestions while preserving existing element and region capture compatibility.
- Added original/proposed element evidence to local History, standalone reports, and the AI Bundle without adding permissions or network services.
- Kept the compact capture list and added a focused in-page edit inspector rather than a detached window.

## 1.4.0 (Source checkpoint)

- Reframed Region capture as a Visual Change Spec editor with crop, arrow, rectangle, ellipse, numbered pin, text, blur/redact, color, undo, and redo tools.
- Persisted annotations as structured viewport vectors with best-effort DOM selectors, roles, surrounding text, geometry, and parent-layout context.
- Added optional acceptance checks and richer browser, viewport, scroll, zoom, DPR, source, and page metadata.
- Added one local AI Bundle ZIP containing `prompt.md`, `feedback.json`, `page-context.json`, before/annotated PNG evidence, and `report.html`; annotated PNGs are generated on export instead of duplicated in history storage.
- Applied blur/redact masks to the saved evidence crop so exported “before” images cannot recover masked pixels.
- Made the in-page capture list collapsed by default with explicit expand/collapse controls.
- Preserved existing local-history item shapes and standalone JSON, HTML, Markdown, and prompt exports.

## 1.3.0

- Added an extension-owned History page with filtering, item deletion, site clearing, and access to feedback from PDFs and non-injectable surfaces.
- Added downloadable JSON and self-contained HTML reports with embedded region images alongside copyable Markdown and AI Prompt exports.
- Updated public install and release metadata to reflect the published `v1.2.0` release.

## 1.2.0

- Added region capture for pages and browser-rendered PDFs.
- Added local history exports for JSON, Markdown, and AI-oriented prompts.
- Added release catalog metadata for software listing consumption.
- Added versioned extension zip packaging for GitHub Releases.
- Refreshed the popup, in-page panel, and region editor with a unified product-tool visual system.
- Added a tag-based GitHub Release workflow for publishing versioned zip assets.
- Hardened region capture saving so storage failures stay visible instead of closing the editor.
