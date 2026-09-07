# Package integration

The canonical source is `packages/swiftui-feedback` in [StoneHub/webDevFeedbackExt, branch codex/swiftui-feedback](https://github.com/StoneHub/webDevFeedbackExt/tree/codex/swiftui-feedback/packages/swiftui-feedback). This is a prototype branch, not a published Swift package release. Read its README and pin the reviewed commit when adopting it.

SwiftPM cannot select a nested package from a repository dependency URL. For this version, obtain a reviewed checkout, copy only `Package.swift`, `Sources`, and optionally `Tests`/README/LICENSE into the host's `Vendor/DevFeedback`, and record the upstream repository, exact commit, and package path alongside it. Add that local package to the app target using the host's existing SwiftPM/Xcode/XcodeGen configuration. Preserve the snapshot unchanged; make library repairs upstream and refresh the recorded revision. Do not copy `.build` or `.swiftpm` caches.

The library product and import are both `DevFeedback`. It requires macOS 14 or newer and Swift tools 5.9. Integration looks like:

```swift
import DevFeedback

StatusView()
    .padding(.top, 38) // room for the development Feedback chip
    .feedbackOverlay(appID: "example.app", screen: currentScreen)

Button("Save", action: save)
    .feedbackTarget("profile.save", label: "Save profile")
```

Make the reserved strip conditional on `#if DEBUG` in real apps. The package modifiers are no-ops in Release. Use Debug in both host and package for feedback testing; adding a host-only flag to a Release build will not enable capture. Attach another overlay to presented sheet content if that sheet needs its own picking surface. System menus, native title bars, and untagged subviews are outside this prototype's picker.

The panel stores app-scoped JSON under Application Support/DevFeedback; Show in Finder reveals the exact file. The app owns this storage. No network, microphone, Accessibility, or Screen Recording access is requested by the package. For sandboxed hosts, a user-selected read/write file entitlement is needed for NSSavePanel exports; verify the host's existing entitlements before changing them. No additional entitlement is needed for ordinary unsandboxed development hosts.

Tags capture static developer metadata, geometry, appearance, screen, and app/build version. The package never reads rendered text, transcript values, form values, or screenshots. User-authored notes can contain private information and are reviewed before explicit export. Native JSON timestamps follow Foundation Codable Date encoding (seconds since 2001-01-01 UTC).
