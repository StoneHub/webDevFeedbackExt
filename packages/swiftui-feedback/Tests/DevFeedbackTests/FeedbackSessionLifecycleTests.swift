#if DEBUG
import AppKit
import XCTest
import Combine
@testable import DevFeedback

final class FeedbackSessionLifecycleTests: XCTestCase {
    private func location() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("history.json") }
    private let target = FeedbackTarget(id: "synthetic.target", label: "Synthetic", file: "Fixture.swift", line: 1)

    @MainActor
    func testCloseEmptyOrTypedCaptureDiscardsAndRestoresPickingRepeatedly() throws {
        var panel: NSPanel?
        var activations = 0
        let session = FeedbackSession(appID: "test.close", screen: "fixture", historyURL: location(),
                                      presentPanel: { panel = $0 }, activateWindow: { _ in activations += 1 })
        let owner = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 300, height: 200), styleMask: [.borderless], backing: .buffered, defer: false)
        owner.isReleasedWhenClosed = false
        let probe = FeedbackOverlayProbe(frame: owner.contentView!.bounds)
        probe.session = session
        owner.contentView?.addSubview(probe)
        let targetProbe = FeedbackTargetProbe(target: target)
        targetProbe.frame = CGRect(x: 10, y: 10, width: 100, height: 20)
        owner.contentView?.addSubview(targetProbe)
        defer { owner.close() }
        for text in ["", "Discard this note", ""] {
            session.startPicking()
            session.capture(target, bounds: CGRect(x: 0, y: 0, width: 100, height: 20), appearance: "light")
            session.note = text
            let capturePanel = try XCTUnwrap(panel)
            XCTAssertTrue(FeedbackWindowRegistry.shared.session(for: capturePanel) === session)
            capturePanel.performClose(nil)
            XCTAssertTrue(session.picking, "Close discards the capture and resumes picking")
            XCTAssertNil(session.draft)
            XCTAssertEqual(session.note, "")
            XCTAssertTrue(session.records.isEmpty)
            XCTAssertEqual(FeedbackWindowRegistry.shared.targets(in: probe).map(\.target.id), [target.id],
                           "Closing the editor must preserve the owning window’s registered targets")
        }
        XCTAssertEqual(activations, 6, "Both initial and resumed picking must activate the owning window")
        session.stopPicking()
        XCTAssertFalse(session.picking)
    }

    @MainActor
    func testSaveOptionalNoteCopiesOnlyCurrentRunAndScreenCapturesStayScoped() throws {
        let url = location()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        var copies: [String] = []
        let session = FeedbackSession(appID: "test.run", screen: "outputs", historyURL: url,
                                      presentPanel: { _ in }, activateWindow: { _ in }, writeClipboard: { copies.append($0); return true })
        session.startPicking()
        session.capture(target, bounds: .zero, appearance: "light")
        XCTAssertTrue(session.canSave)
        session.saveAndContinue()
        XCTAssertTrue(session.picking)
        XCTAssertEqual(session.records.count, 1)
        XCTAssertEqual(session.records.first?.note, "")
        session.capture(FeedbackTarget(id: "second", label: "Second", file: "Fixture.swift", line: 2), bounds: .zero, appearance: "light")
        session.note = "Second note"
        session.saveAndContinue()
        XCTAssertEqual(session.runRecords.count, 2)
        XCTAssertTrue(copies.last!.contains("synthetic.target"))
        XCTAssertTrue(copies.last!.contains("Second note"))
        session.stopPicking()
        session.updateScreen("frames")
        session.startPicking()
        session.capture(FeedbackTarget(id: "third", label: "Third", file: "Fixture.swift", line: 3), bounds: .zero, appearance: "light")
        session.saveAndContinue()
        XCTAssertEqual(session.runRecords.count, 1)
        XCTAssertFalse(copies.last!.contains("synthetic.target"))
        XCTAssertEqual(session.screenRecords.map(\.target.id), ["third"])
        session.copyAll()
        XCTAssertFalse(copies.last!.contains("Second note"))
        XCTAssertEqual(try FeedbackHistory(url: url).records.count, 3)
    }

    @MainActor
    func testShortcutDoesNotDiscardTypedDraftButExplicitCloseAndStopDo() {
        let session = FeedbackSession(appID: "test.draft", screen: "fixture", historyURL: location(), presentPanel: { _ in }, activateWindow: { _ in })
        session.capture(target, bounds: .zero, appearance: "light")
        session.note = "Keep while shortcut is pressed"
        let id = session.draft?.id
        session.startPicking()
        XCTAssertFalse(session.picking)
        XCTAssertEqual(session.draft?.id, id)
        XCTAssertEqual(session.note, "Keep while shortcut is pressed")
        XCTAssertNotNil(session.message)
        session.discardAndContinue()
        XCTAssertTrue(session.picking)
        XCTAssertNil(session.draft)
        session.capture(target, bounds: .zero, appearance: "light")
        session.stopPicking()
        XCTAssertFalse(session.picking)
        XCTAssertNil(session.draft)
        session.startPicking()
        XCTAssertTrue(session.picking)
    }

    @MainActor
    func testOpenCaptureListPublishesNavigationAndKeepsTitleRowsAndCopyTogether() throws {
        let url = location()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        var panel: NSPanel?
        var copied = ""
        let session = FeedbackSession(appID: "test.navigation", screen: "outputs", historyURL: url,
                                      presentPanel: { panel = $0 }, writeClipboard: { copied = $0; return true })
        session.capture(target, bounds: .zero, appearance: "light")
        session.saveAndContinue()
        session.updateScreen("frames")
        session.capture(FeedbackTarget(id: "frames.target", label: "Frames", file: "Fixture.swift", line: 2), bounds: .zero, appearance: "light")
        session.saveAndContinue()
        session.updateScreen("outputs")
        session.showCaptures()
        XCTAssertEqual(panel?.title, "Captures · outputs")
        XCTAssertEqual(session.screenRecords.map(\.target.id), [target.id])
        var changes = 0
        let observation = session.objectWillChange.sink { changes += 1 }
        session.updateScreen("frames")
        XCTAssertGreaterThan(changes, 0, "Screen changes must invalidate the open capture list")
        XCTAssertEqual(panel?.title, "Captures · frames")
        XCTAssertEqual(session.screenRecords.map(\.target.id), ["frames.target"])
        session.copyAll()
        XCTAssertTrue(copied.contains("frames.target"))
        XCTAssertFalse(copied.contains("synthetic.target"))
        withExtendedLifetime(observation) {}
        panel?.close()
    }

    @MainActor
    func testOwnerCloseBreaksPanelRetentionWithoutResumingPicking() {
        let owner = NSWindow(contentRect: CGRect(x: 0, y: 0, width: 300, height: 200), styleMask: [.borderless], backing: .buffered, defer: false)
        owner.isReleasedWhenClosed = false
        var activations = 0
        weak var capturedPanel: NSPanel?
        weak var weakSession: FeedbackSession?
        autoreleasepool {
            let session = FeedbackSession(appID: "test.teardown", screen: "fixture", historyURL: location(),
                                          presentPanel: { capturedPanel = $0 }, activateWindow: { _ in activations += 1 })
            weakSession = session
            let probe = FeedbackOverlayProbe(frame: owner.contentView!.bounds)
            probe.session = session
            owner.contentView?.addSubview(probe)
            session.capture(target, bounds: .zero, appearance: "light")
        }
        XCTAssertNotNil(weakSession, "The open panel currently owns its observed session")
        autoreleasepool {
            owner.close()
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
        XCTAssertEqual(activations, 0, "Owner cleanup must not resume or focus a closing window")
        XCTAssertNil(capturedPanel?.contentView)
        XCTAssertNil(weakSession, "Owner close must break session → panel → hosting view → session")
    }

    @MainActor
    func testOwnerProbeReattachmentMovesCloseObservation() {
        let owners = (0..<2).map { _ in NSWindow(contentRect: CGRect(x: 0, y: 0, width: 300, height: 200), styleMask: [.borderless], backing: .buffered, defer: false) }
        owners.forEach { $0.isReleasedWhenClosed = false }
        var panel: NSPanel?
        let session = FeedbackSession(appID: "test.reattach", screen: "fixture", historyURL: location(), presentPanel: { panel = $0 }, activateWindow: { _ in })
        let probe = FeedbackOverlayProbe(frame: owners[0].contentView!.bounds)
        probe.session = session
        owners[0].contentView?.addSubview(probe)
        session.capture(target, bounds: .zero, appearance: "light")
        let draftID = session.draft?.id
        probe.removeFromSuperview()
        owners[1].contentView?.addSubview(probe)
        owners[0].close()
        XCTAssertEqual(session.draft?.id, draftID)
        XCTAssertNotNil(panel?.contentView)
        XCTAssertTrue(session.captureView?.window === owners[1])
        owners[1].close()
        XCTAssertNil(panel?.contentView)
        XCTAssertNil(session.draft)
        XCTAssertFalse(session.picking)
    }

    @MainActor
    func testSaveFailureRetainsDraftAndClipboardFailureKeepsSavedCapture() throws {
        let root = location().deletingLastPathComponent()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let blocked = root.appendingPathComponent("not-a-directory")
        try Data().write(to: blocked)
        let failing = FeedbackSession(appID: "test.fail", screen: "fixture", historyURL: blocked.appendingPathComponent("history.json"), presentPanel: { _ in })
        failing.capture(target, bounds: .zero, appearance: "light")
        failing.note = "Retain on save failure"
        failing.saveAndContinue()
        XCTAssertEqual(failing.note, "Retain on save failure")
        XCTAssertNotNil(failing.draft)
        XCTAssertNotNil(failing.error)
        XCTAssertFalse(failing.picking)
        let clipboard = FeedbackSession(appID: "test.clipboard", screen: "fixture", historyURL: root.appendingPathComponent("good.json"), presentPanel: { _ in }, writeClipboard: { _ in false })
        clipboard.capture(target, bounds: .zero, appearance: "light")
        clipboard.saveAndContinue()
        XCTAssertEqual(clipboard.records.count, 1)
        XCTAssertNotNil(clipboard.error)
        XCTAssertTrue(clipboard.picking)
    }
}
#endif
