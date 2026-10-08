#if DEBUG
import AppKit
import SwiftUI

/// Weak registrations do not retain windows, hosted roots, or removed targets.
@MainActor
final class FeedbackWindowRegistry: ObservableObject {
    static let shared = FeedbackWindowRegistry()
    private let probes = NSHashTable<FeedbackTargetProbe>.weakObjects()
    private let overlays = NSHashTable<FeedbackOverlayProbe>.weakObjects()
    private var observers: [NSObjectProtocol] = []

    init() {
        for name in [NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.objectWillChange.send() }
            })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
    func register(_ probe: FeedbackTargetProbe) { probes.add(probe) }
    func register(_ overlay: FeedbackOverlayProbe) {
        overlays.add(overlay)
        Task { @MainActor [weak self] in self?.objectWillChange.send() }
    }
    func session(for window: NSWindow?) -> FeedbackSession? {
        guard let window else { return nil }
        return overlays.allObjects.first { $0.window === window || $0.session?.owns(window) == true }?.session
    }
    func targets(in overlay: NSView) -> [VisibleFeedbackTarget] {
        guard let window = overlay.window else { return [] }
        return probes.allObjects.compactMap { probe in
            guard probe.window === window, !probe.isHiddenOrHasHiddenAncestor else { return nil }
            let source = probe.convert(probe.bounds, to: overlay)
            // visibleRect includes AppKit ancestor clipping, notably NSClipView scrolling.
            var clips = [probe.convert(probe.visibleRect, to: overlay), overlay.bounds]
            var ancestor = probe.superview
            while let view = ancestor {
                if view is NSClipView { clips.append(view.convert(view.bounds, to: overlay)) }
                ancestor = view.superview
            }
            return VisibleFeedbackTarget(id: probe.registrationID, target: probe.target, bounds: source, viewports: clips)
        }
    }
}

@MainActor
final class FeedbackTargetProbe: NSView {
    var registrationID: UUID
    var target: FeedbackTarget
    init(id: UUID = UUID(), target: FeedbackTarget) { self.registrationID = id; self.target = target; super.init(frame: .zero) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil { FeedbackWindowRegistry.shared.register(self) }
    }
}

struct FeedbackTargetRegistration: NSViewRepresentable {
    let id: UUID
    let target: FeedbackTarget
    func makeNSView(context: Context) -> FeedbackTargetProbe { FeedbackTargetProbe(id: id, target: target) }
    func updateNSView(_ view: FeedbackTargetProbe, context: Context) { view.registrationID = id; view.target = target }
}

@MainActor
final class FeedbackOverlayBridge: ObservableObject {
    weak var view: FeedbackOverlayProbe?
    var targets: [VisibleFeedbackTarget] {
        guard let view else { return [] }
        return FeedbackWindowRegistry.shared.targets(in: view)
    }
}

@MainActor
final class FeedbackOverlayProbe: NSView {
    weak var session: FeedbackSession?
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        session?.captureView = self
        FeedbackWindowRegistry.shared.register(self)
    }
}

struct FeedbackOverlayRegistration: NSViewRepresentable {
    let session: FeedbackSession
    let bridge: FeedbackOverlayBridge
    func makeNSView(context: Context) -> FeedbackOverlayProbe {
        let view = FeedbackOverlayProbe()
        view.session = session
        bridge.view = view
        return view
    }
    func updateNSView(_ view: FeedbackOverlayProbe, context: Context) {
        view.session = session
        bridge.view = view
    }
}
#endif
