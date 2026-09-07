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

The panel stores app-scoped JSON under Application Support/DevFeedback; Show in Finder reveals the exact file. The app owns this storage. No network, microphone, Accessibility, or Screen Recording access is requested by the package. For sandboxed hosts, a user-selected read/write file entitlement is needed for NSSavePanel exports; verify the host's existing entitlements before changing them. No additional entitlement is needed for ordinary unsandboxed development hosts.

Tags capture static developer metadata, geometry, appearance, screen, and app/build version. The package never reads rendered text, transcript values, form values, or screenshots. User-authored notes can contain private information and are reviewed before explicit export. Native JSON timestamps follow Foundation Codable Date encoding (seconds since 2001-01-01 UTC).

For scrolling content, attach `.feedbackViewport()` to the `ScrollView` itself, outside its content closure. Nested viewport boundaries intersect. Hosts omitting the import in Release also provide a no-op viewport shim. Verify a partially visible row can be picked only in its visible area and that scrolled-off rows do not cover header controls.
