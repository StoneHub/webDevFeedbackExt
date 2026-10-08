# DevFeedback for SwiftUI

Pick a tagged view in a native Mac development build, optionally add a note, and copy captures with stable target IDs and source locations. Porch Speech is the first integration. This prototype is separate from the browser extension and is not a published Swift package release.

## Add to an app

Requires macOS 14+, Swift tools 5.9, and a Debug build. Add this directory as a local Swift package dependency and link the **DevFeedback** product to the app target. For a reproducible host checkout, vendor this directory without `.build`/`.swiftpm`, preserve the license, and record the exact upstream repository commit. SwiftPM cannot fetch a nested package by repository URL; a dedicated package repository can follow after the integration proves useful.

```swift
import SwiftUI
#if DEBUG
import DevFeedback
#endif

// Inside the App's scene builder:
Window("My App", id: "main") {
    #if DEBUG
    StatusView().feedbackOverlay(appID: "example.app", screen: "status")
    #else
    StatusView()
    #endif
}
.commands {
    #if DEBUG
    FeedbackCommands()
    #endif
}

// At the meaningful control or section boundary:
Button("Save", action: save)
    .feedbackTarget("profile.save", label: "Save profile")
```

The tag example assumes the package is imported. Hosts that guard the import in Release can provide a Release-only no-op tagging shim with lazy (`@autoclosure`) arguments, or conditionally compile tag calls. Verify the resulting distributable, including dynamic tag-key creation, rather than relying on the shim alone.

The idle overlay inserts no button, badge, or reserved spacing. Activate **Developer → Pick UI for Feedback** or **⌘⌥⇧F** while the app window is active. **Developer → Captures for This Screen…** opens this screen’s saved captures. Highlight outlines and Stop appear only during an active pick. Targets report their actual layout bounds using anchor preferences; nested picking chooses the smallest registered bounds under the pointer. Add `.feedbackViewport()` to each `ScrollView` itself (outside its content) or other clipped container. Outlines and click hit-testing then use only the intersection with every enclosing viewport; offscreen targets are omitted from the visible count. Capture context retains the original bounds. Container tags preserve descendant tags. Register a row/card and its independently discussable mode label, timestamp, text body, and actions; a lone container tag cannot provide granular feedback. Repeated components need distinct non-sensitive instance IDs. Labels should be static developer text, never values from a transcript, document, or form. The default `#fileID` and `#line` identify the tagging call, not a guaranteed permanent source location.

The screen parameter may change with navigation: new captures use the current screen while saved records and open drafts preserve their original screen. History is shared within the app ID. Install an overlay separately on any sheet needing capture. Release builds compile the public modifiers as inlinable no-ops with lazy metadata arguments, omit the Developer menu items, and exclude the panel, store, and record implementation. The Release test confirms metadata-producing expressions are not evaluated. Host and dependency must both use Debug; a host-only flag does not enable the Release package.

## Capture and hand off

This native workflow follows the browser extension’s current capture flow (upstream `3b8a614`, #33), while retaining native target IDs and source hints rather than collecting webpage text.

1. With the app window active, press **⌘⌥⇧F** or choose **Developer → Pick UI for Feedback**. Click an outlined target. Its app action must not execute.
2. A compact panel opens beside the target. The note is optional. **Enter** or **Save** saves locally, copies all captures from this picking run, and resumes picking. **Shift+Enter** adds a line.
3. **×** or the panel’s window close button discards the current capture and immediately restores picking in its owning window. **Escape** or **Stop picking** discards the pending capture and stops. Merely invoking the shortcut while a typed draft is open preserves that draft and explains how to proceed.
4. **Developer → Captures for This Screen…** lists captures for the current screen, with **Copy all**, **Markdown…**, **JSON…**, and per-capture deletion. Saved-note editing and acceptance-field entry are no longer part of the UI. Existing acceptance text remains visible in legacy captures and survives exports.
5. Test repeated pick → close → pick, including an empty note. Save failures must retain the draft. Clipboard failure must leave a locally saved capture and a visible recovery message.

While picking, the underlying SwiftUI content is hidden from accessibility and each outline exposes a labeled **Capture feedback** action. These actions capture feedback rather than invoke the target’s app behavior. Verify this in each host, including separately hosted content. Physical picking still resolves the smallest visible target under the click.

## Storage and export

History lives under the host's Application Support directory in `DevFeedback/<hex-encoded-app-ID>/history.json`. Saves are atomic, limited to 500 records with 16,000 characters per request/acceptance field. Unsupported or corrupt history is preserved and reported rather than reset. Opening the capture list refreshes disk state; same-process main-thread window saves merge the current file. Simultaneous writes from separate app processes are not supported.

The package stores only static registered metadata, window-local bounds, screen, appearance, app/build version, optional notes, and legacy acceptance checks. It does not inspect rendered text, record audio, or capture screenshots. It adds no network, Accessibility, microphone, or Screen Recording access. Sandboxed hosts need user-selected read/write file access for the save dialog; unsandboxed development apps need no additional entitlements.

JSON has `schemaVersion: 1`, `source: "swiftui-dev-feedback"`, and `records`. Each record has `id`, `createdAt`, `appID`, `screen`, `target` (`id`, `label`, `file`, `line`), `bounds`, `appVersion`, `build`, `appearance`, `note`, and `acceptance`. Dates use Foundation Codable's seconds since 2001-01-01 UTC. The current-screen snapshot is captured before the save dialog opens. Save copies only the current picking run; Copy all and file exports include only the current screen.

Agents can read this JSON or the Markdown with ordinary file tools. Browser MCP import compatibility, screenshots, native menu/title-bar picking, untagged-view discovery, and iOS are outside this first slice. Bounds and source hints describe capture time; agents must resolve them against current source. Rendered UI coverage still requires manual verification.

## Agent companion

The repository includes a [Codex plugin](../../plugins/swiftui-feedback/README.md) with integration/tag-maintenance instructions and a duplicate literal-ID checker. It is packaged source for local testing, not a published marketplace listing. Installing the agent plugin and linking the app library are separate steps.

## Checks

```sh
swift test --package-path packages/swiftui-feedback
swift test -c release --package-path packages/swiftui-feedback
```

Tests include repeated close/resume, optional notes, current-run clipboard, screen scoping, failure preservation, owning-window activation, and an actual SwiftUI hosting/rendering regression for nested parent/child registrations, plus persistence, selected-only export, edits preserving context, failed writes, corrupt/future history, field limits, same-process windows, and Finder deletion. The host integration must also exercise the real picker, panel, and export dialog.

## Distribution gate

Development installation and a distributable are distinct products. Use Xcode **Release** for Archive/export; never distribute the Debug app used for feedback. Check effective host and package compilation conditions: `DEBUG` must be absent. Verify the built app has no Developer feedback commands, picker, capture panel/storage code, bundled DevFeedback framework/resources, source hints, or feedback-only tag markers. Inspect the actual linked executable and bundle, and fail packaging if markers remain. Importing a dependency in the project is not by itself proof that its runtime ships, nor is hiding a control proof of exclusion. Signing and notarization are separate host release requirements.

### AppKit-hosted windows and scrolling documents

Debug overlays also register their session with their native window. Developer commands resolve the active key window before falling back to SwiftUI scene focus, so custom `NSWindow` / `NSHostingView` windows work without an additional command API. Keep one overlay per window. Tags inside independently hosted document roots are discovered through weak native view probes in that same window. Their bounds are converted into the overlay coordinate space and clipped to native visible bounds and enclosing `NSClipView` viewports. Ordinary same-root SwiftUI tags retain their explicit `feedbackViewport()` clipping. No app text or screenshots are read. Geometry refreshes while picking; idle tags do not intercept clicks. The overlay remains the single picking hit surface.

This bridge does not make untagged AppKit controls, native title bars, or system menus selectable. Keep target IDs unique across the whole window, including independently hosted roots.
