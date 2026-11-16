# Package integration

The canonical source is `packages/swiftui-feedback` in [StoneHub/webDevFeedbackExt, branch codex/swiftui-feedback](https://github.com/StoneHub/webDevFeedbackExt/tree/codex/swiftui-feedback/packages/swiftui-feedback). This is a prototype branch, not a published Swift package release. Read its README and pin the reviewed commit when adopting it.

SwiftPM cannot select a nested package from a repository dependency URL. For this version, obtain a reviewed checkout, copy only `Package.swift`, `Sources`, and optionally `Tests`/README/LICENSE into the host's `Vendor/DevFeedback`, and record the upstream repository, exact commit, and package path alongside it. Add that local package to the app target using the host's existing SwiftPM/Xcode/XcodeGen configuration. Preserve the snapshot unchanged; make library repairs upstream and refresh the recorded revision. Do not copy `.build` or `.swiftpm` caches.

The library product and import are both `DevFeedback`. It requires macOS 14 or newer and Swift tools 5.9. Integration looks like:

```swift
import DevFeedback

StatusView()
    .feedbackOverlay(appID: "example.app", screen: currentScreen)

Button("Save", action: save)
    .feedbackTarget("profile.save", label: "Save profile")
```

Add `FeedbackCommands()` inside the scene’s `.commands` builder under `#if DEBUG`. It provides Developer menu activation and Cmd+Option+Shift+F. The idle overlay has no visible controls or reserved strip. The package modifiers are inlinable no-ops in Release with unevaluated metadata arguments. Guard host imports/commands and feedback-only key-generation state; hosts that omit the import in Release need lazy no-op tagging shims or conditional tag calls. Run `swift test -c release` and inspect the actual host distribution executable and bundle for feedback-only symbols, strings, and artifacts. Fail distribution on contamination. Use Debug in both host and package for feedback testing; adding a host-only flag to a Release build will not enable capture. Attach another overlay to presented sheet content if that sheet needs its own picking surface. System menus, native title bars, and untagged subviews are outside this prototype's picker.

The package stores app-scoped JSON at `Application Support/DevFeedback/<hex-encoded-app-ID>/history.json` within the host’s storage location. Developer → Captures for This Screen lists only the current screen’s captures. The app owns this storage; unsupported or corrupt files are preserved and reported, and updates do not intentionally delete legacy records. No network, microphone, Accessibility, or Screen Recording access is requested by the package. For sandboxed hosts, a user-selected read/write file entitlement is needed for NSSavePanel exports; verify the host's existing entitlements before changing them. No additional entitlement is needed for ordinary unsandboxed development hosts.

Tags capture static developer metadata, geometry, appearance, screen, and app/build version. The package never reads rendered text, transcript values, form values, or screenshots. User-authored notes can contain private information. Save immediately copies the current picking run to the clipboard; users should review it before pasting or sharing. Capture-list Copy all, Markdown, and JSON include the current screen only. Native JSON timestamps follow Foundation Codable Date encoding (seconds since 2001-01-01 UTC).

For scrolling content, attach `.feedbackViewport()` to the `ScrollView` itself, outside its content closure. Nested viewport boundaries intersect. Hosts omitting the import in Release also provide a no-op viewport shim. Verify a partially visible row can be picked only in its visible area and that scrolled-off rows do not cover header controls.

## Compact capture lifecycle

The current native workflow follows the extension’s optional-note capture model. Picking opens a compact panel beside the target. Save or Enter stores the capture, copies all captures saved in the current picking run, and resumes picking. Blank notes are allowed; Shift+Enter inserts a line. The × button and native window close discard the pending capture, including typed text, and restore picking in its owning window. Escape or Stop discards the pending capture and ends picking. A shortcut pressed while a typed draft remains open preserves the draft and gives instructions rather than silently losing it.

Developer → Captures for This Screen offers a per-screen list, Copy all, Markdown, JSON, and per-capture deletion. There is no acceptance editor, saved-note editing, or selected-export History panel. Existing schema-version-1 native records and legacy acceptance fields remain readable and included in exports. Keep the native `source: swiftui-dev-feedback` format; it is not the browser MCP importer’s schema.

## Native windows and accessibility

Keep one overlay per native window, including manually created AppKit windows. Debug-only weak registrations connect the overlay’s session and tagged views across independent NSHostingView roots. Native document targets use converted window coordinates and visible bounds, including NSClipView clipping; same-root SwiftUI targets retain feedbackViewport clipping. The active window and its capture panel route commands to the same session. Resuming picking restores its owning window, and window close must not leave a stale empty draft blocking the next pick. Stable registration identities survive body updates; duplicate diagnostics list the semantic IDs to fix.

During picking, the original SwiftUI content is hidden from accessibility and outlines expose Capture feedback actions using static developer labels and `dev-feedback.target.<semantic-ID>` identifiers. These actions capture a target rather than invoke its app action. Physical picking retains one hit surface and chooses the smallest visible target. Validate both input paths in the real host, particularly independently hosted content; a programmatic accessibility press on an underlying app button is not proof that the feedback picker captured it. No Accessibility permission is requested by this package.

Verify empty-note save, Enter/Shift+Enter, repeated native close/resume, owner-window focus, scroll clipping, run-only clipboard contents, current-screen exports, and save/clipboard failure recovery. Native title bars, system menus, untagged controls, screenshots, iOS, and browser-MCP import remain outside this prototype.
