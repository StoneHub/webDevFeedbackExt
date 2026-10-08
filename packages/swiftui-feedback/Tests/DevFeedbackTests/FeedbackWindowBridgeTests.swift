#if DEBUG
import AppKit
import SwiftUI
import XCTest
@testable import DevFeedback

final class FeedbackWindowBridgeTests: XCTestCase {
    @MainActor
    func testIndependentHostingRootTargetsRespectScrollClipAndWindowIsolation() throws {
        let window = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 300, height: 240), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        let root = NSView(frame: CGRect(x: 0, y: 0, width: 300, height: 240))
        window.contentView = root
        let overlay = FeedbackOverlayProbe(frame: root.bounds)
        root.addSubview(overlay)
        let scroll = NSScrollView(frame: CGRect(x: 20, y: 40, width: 200, height: 100))
        scroll.borderType = .noBorder
        root.addSubview(scroll)
        let document = NSHostingView(rootView: VStack(spacing: 0) {
            Color.clear.frame(height: 60).feedbackTarget("first")
            Color.clear.frame(height: 60).feedbackTarget("second")
            Color.clear.frame(height: 180).feedbackTarget("third")
        }.frame(width: 200))
        document.frame = CGRect(x: 0, y: 0, width: 200, height: 300)
        scroll.documentView = document
        document.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        scroll.contentView.scroll(to: CGPoint(x: 0, y: 80))
        scroll.reflectScrolledClipView(scroll.contentView)
        let targets = FeedbackWindowRegistry.shared.targets(in: overlay)
        XCTAssertFalse(targets.contains { $0.target.id == "first" })
        let second = try XCTUnwrap(targets.first { $0.target.id == "second" })
        XCTAssertEqual(second.sourceBounds.height, 60, accuracy: 1)
        XCTAssertEqual(second.visibleBounds.height, 40, accuracy: 1)
        let clip = scroll.contentView.convert(scroll.contentView.bounds, to: overlay)
        XCTAssertNil(VisibleFeedbackTarget.pick(at: CGPoint(x: clip.midX, y: clip.minY - 10), from: targets))
        XCTAssertTrue(targets.allSatisfy { clip.contains($0.visibleBounds) })
        let detachedOverlay = FeedbackOverlayProbe(frame: root.bounds)
        XCTAssertTrue(FeedbackWindowRegistry.shared.targets(in: detachedOverlay).isEmpty)
        scroll.contentView.scroll(to: CGPoint(x: 0, y: 180))
        XCTAssertFalse(FeedbackWindowRegistry.shared.targets(in: overlay).contains { $0.target.id == "second" })
    }

    @MainActor
    func testTargetRegistrationIdentitySurvivesBodyUpdates() throws {
        let model = RegistrationModel()
        var anchors: [UUID] = []
        let host = NSHostingView(rootView: RegistrationFixture(model: model) { anchors = $0 })
        let window = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 300, height: 240), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = host
        defer { window.close() }
        host.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        let initial = try XCTUnwrap(anchors.first)
        model.revision += 1
        host.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(anchors, [initial], "A retained target must keep one identity across preference/probe updates")
        let native = FeedbackWindowRegistry.shared.targets(in: host).filter { $0.target.id == "stable" }
        XCTAssertEqual(native.map(\.id), [initial])
    }

    @MainActor
    func testAppKitWindowSessionLookupAndRemoval() {
        let window = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 100, height: 100), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        let session = FeedbackSession(appID: "test.window.bridge", screen: "synthetic")
        let overlay = FeedbackOverlayProbe(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        overlay.session = session
        window.contentView = NSView(frame: overlay.frame)
        window.contentView?.addSubview(overlay)
        XCTAssertTrue(FeedbackWindowRegistry.shared.session(for: window) === session)
        XCTAssertNil(FeedbackWindowRegistry.shared.session(for: nil))
        overlay.removeFromSuperview()
        XCTAssertNil(FeedbackWindowRegistry.shared.session(for: window))
    }
}
@MainActor
private final class RegistrationModel: ObservableObject {
    @Published var revision = 0
}
private struct RegistrationFixture: View {
    @ObservedObject var model: RegistrationModel
    let observe: ([UUID]) -> Void
    var body: some View {
        Text("Synthetic \(model.revision)").feedbackTarget("stable")
            .overlayPreferenceValue(TargetPreference.self) { targets in
                let _ = observe(targets.map(\.id))
                Color.clear
            }
    }
}
#endif
