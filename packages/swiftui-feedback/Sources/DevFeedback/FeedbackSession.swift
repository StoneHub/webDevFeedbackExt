#if DEBUG
import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class FeedbackSession: NSObject, ObservableObject, NSWindowDelegate {
    @Published var picking = false
    @Published var draft: FeedbackRecord?
    @Published var note = ""
    @Published var acceptance = "" // Retained for compatibility with existing records, never newly collected.
    @Published var records: [FeedbackRecord] = []
    @Published var error: String?
    @Published var message: String?
    @Published var showingCaptures = false
    private let appID: String
    private var screen: String
    private var history: FeedbackHistory?
    private var panel: NSPanel?
    private var runIDs: [UUID] = []
    weak var captureView: NSView?
    private let presentPanel: @MainActor (NSPanel) -> Void
    private let activateWindow: @MainActor (NSWindow) -> Void
    private let writeClipboard: (String) -> Bool

    init(appID: String, screen: String, historyURL: URL? = nil,
         presentPanel: @escaping @MainActor (NSPanel) -> Void = { $0.makeKeyAndOrderFront(nil) },
         activateWindow: @escaping @MainActor (NSWindow) -> Void = { $0.makeKeyAndOrderFront(nil) },
         writeClipboard: @escaping (String) -> Bool = { text in
             NSPasteboard.general.clearContents()
             return NSPasteboard.general.setString(text, forType: .string)
         }) {
        self.appID = appID; self.screen = screen
        self.presentPanel = presentPanel; self.activateWindow = activateWindow; self.writeClipboard = writeClipboard
        super.init()
        do {
            let url: URL
            if let historyURL { url = historyURL }
            else {
                let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let key = Data(appID.utf8).map { String(format: "%02x", $0) }.joined()
                url = root.appendingPathComponent("DevFeedback", isDirectory: true)
                    .appendingPathComponent(key, isDirectory: true).appendingPathComponent("history.json")
            }
            history = try FeedbackHistory(url: url)
            records = history?.records ?? []
        } catch { self.error = "Could not load captures: \(error.localizedDescription)" }
    }

    func updateScreen(_ screen: String) { self.screen = screen }
    var screenRecords: [FeedbackRecord] { records.filter { $0.screen == screen } }
    var runRecords: [FeedbackRecord] { runIDs.compactMap { id in records.first { $0.id == id } } }
    var hasUnsavedChanges: Bool { draft != nil && (!note.isEmpty || !acceptance.isEmpty) }
    var canSave: Bool { history != nil && draft != nil }
    func owns(_ window: NSWindow) -> Bool { panel === window || captureView?.window === window }

    func showPanel() {
        showingCaptures = false
        configurePanel(captures: false)
        if let panel { presentPanel(panel) }
    }
    func showCaptures() {
        if hasUnsavedChanges { message = "Save or close this capture before opening the capture list."; showPanel(); return }
        picking = false; discard()
        do { try history?.reload(); records = history?.records ?? [] }
        catch { self.error = "Could not load captures: \(error.localizedDescription)" }
        showingCaptures = true
        configurePanel(captures: true)
        if let panel { presentPanel(panel) }
    }
    private func configurePanel(captures: Bool) {
        if panel == nil {
            let window = NSPanel(contentRect: CGRect(x: 0, y: 0, width: 390, height: 220),
                                 styleMask: [.titled, .closable, .utilityWindow], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false; window.hidesOnDeactivate = false; window.delegate = self
            window.contentView = NSHostingView(rootView: FeedbackPanel(session: self))
            panel = window
        }
        guard let panel else { return }
        panel.title = captures ? "Captures · \(screen)" : "Capture feedback"
        panel.setContentSize(NSSize(width: captures ? 480 : 390, height: captures ? 470 : 240))
        if !captures, let draft, let view = captureView, let owner = view.window {
            let bounds = CGRect(x: draft.bounds.x, y: draft.bounds.y, width: draft.bounds.width, height: draft.bounds.height)
            let target = owner.convertToScreen(view.convert(bounds, to: nil))
            let available = owner.screen?.visibleFrame ?? target
            let x = min(max(target.minX, available.minX), max(available.minX, available.maxX - panel.frame.width))
            let y = min(max(target.minY - panel.frame.height - 8, available.minY), max(available.minY, available.maxY - panel.frame.height))
            panel.setFrameOrigin(CGPoint(x: x, y: y))
        }
    }
    func startPicking(newRun: Bool = true) {
        guard !hasUnsavedChanges else { message = "Save or close this capture to pick another target."; showPanel(); return }
        discard()
        if newRun { runIDs = []; message = nil }
        showingCaptures = false; picking = true; panel?.orderOut(nil)
        if let owner = captureView?.window { activateWindow(owner) }
    }
    func discardAndContinue() { discard(); startPicking(newRun: false) }
    func stopPicking() { picking = false; discard(); panel?.orderOut(nil) }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if !showingCaptures { discardAndContinue() }
        return true
    }
    func capture(_ target: FeedbackTarget, bounds: CGRect, appearance: String) {
        guard !hasUnsavedChanges else { return }
        draft = FeedbackRecord(id: UUID(), createdAt: Date(), appID: appID, screen: screen,
                               target: target, bounds: FeedbackBounds(x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height),
                               appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "development",
                               build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "development",
                               appearance: appearance, note: "", acceptance: "")
        note = ""; acceptance = ""; picking = false; message = nil
        showPanel()
    }
    func discard() { draft = nil; note = ""; acceptance = "" }
    func saveAndContinue() {
        guard var record = draft, let history else { return }
        record.note = note; record.acceptance = acceptance
        do {
            try history.save(record)
            records = history.records
            if !runIDs.contains(record.id) { runIDs.append(record.id) }
            discard(); error = nil
            let copied = writeClipboard(FeedbackHistory.markdown(runRecords))
            if copied { message = "Copied \(runRecords.count) captures. Keep picking · Esc to stop." }
            else { error = "Saved locally, but clipboard copy failed. Use Developer → Captures → Copy all." }
            startPicking(newRun: false)
        } catch { self.error = error.localizedDescription }
    }
    func delete(_ record: FeedbackRecord) {
        do { try history?.delete(ids: [record.id]); records = history?.records ?? []; runIDs.removeAll { $0 == record.id }; error = nil }
        catch { self.error = error.localizedDescription }
    }
    func copyAll() {
        if writeClipboard(FeedbackHistory.markdown(screenRecords)) { message = "Copied \(screenRecords.count) captures." }
        else { error = "Could not write to the clipboard." }
    }
    func export(markdown: Bool) {
        do {
            let data = markdown ? Data(FeedbackHistory.markdown(screenRecords).utf8) : try FeedbackHistory.json(screenRecords)
            let save = NSSavePanel()
            save.allowedContentTypes = markdown ? [UTType(filenameExtension: "md") ?? .plainText] : [.json]
            save.nameFieldStringValue = markdown ? "swiftui-feedback.md" : "swiftui-feedback.json"
            guard let panel else { return }
            save.beginSheetModal(for: panel) { [weak self] response in
                guard response == .OK, let url = save.url else { return }
                do { try data.write(to: url, options: .atomic); self?.message = "Exported this screen’s captures." }
                catch { self?.error = error.localizedDescription }
            }
        } catch { self.error = error.localizedDescription }
    }
}

private struct FeedbackPanel: View {
    @ObservedObject var session: FeedbackSession
    @FocusState private var noteFocused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if session.showingCaptures {
                HStack {
                    Text("Captures (\(session.screenRecords.count))").font(.headline)
                    Spacer()
                    Button("Pick target") { session.startPicking() }
                }
                Text("This screen’s saved captures. Review before sharing.").font(.caption).foregroundStyle(.secondary)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        if session.screenRecords.isEmpty { Text("No captures on this screen yet.").foregroundStyle(.secondary) }
                        ForEach(session.screenRecords) { record in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(record.target.label).font(.subheadline.bold())
                                    Text(record.target.id).font(.caption.monospaced())
                                    if !record.note.isEmpty { Text(record.note).textSelection(.enabled) }
                                    if !record.acceptance.isEmpty { Text("Legacy acceptance: " + record.acceptance).font(.caption).textSelection(.enabled) }
                                }
                                Spacer()
                                Button("Delete") { session.delete(record) }.font(.caption)
                            }
                            Divider()
                        }
                    }
                }
                HStack {
                    Button("Copy all") { session.copyAll() }
                    Button("Markdown…") { session.export(markdown: true) }
                    Button("JSON…") { session.export(markdown: false) }
                }.disabled(session.screenRecords.isEmpty)
            } else if let draft = session.draft {
                HStack {
                    Text(draft.target.label).font(.headline).lineLimit(1)
                    Spacer()
                    Button { session.discardAndContinue() } label: { Image(systemName: "xmark") }
                        .buttonStyle(.plain).help("Discard this capture and keep picking")
                        .accessibilityLabel("Discard capture and keep picking")
                }
                Text(draft.target.id).font(.caption.monospaced()).textSelection(.enabled)
                TextField("Note (optional)", text: $session.note, axis: .vertical)
                    .lineLimit(3...5).textFieldStyle(.roundedBorder).focused($noteFocused)
                    .accessibilityIdentifier("dev-feedback.note")
                    .onKeyPress(.return, phases: .down) { press in
                        if press.modifiers.contains(.shift) { return .ignored }
                        session.saveAndContinue(); return .handled
                    }
                HStack {
                    Button("Stop picking") { session.stopPicking() }.keyboardShortcut(.cancelAction)
                    Spacer()
                    Button("Save") { session.saveAndContinue() }.disabled(!session.canSave)
                        .keyboardShortcut(.return, modifiers: [.command])
                        .accessibilityIdentifier("dev-feedback.save")
                }
                Text("Save copies this picking run and continues. Shift+Enter adds a line.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error = session.error { Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled) }
            if let message = session.message { Text(message).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(16)
        .onAppear { noteFocused = true }
        .onChange(of: session.draft?.id) { _, _ in noteFocused = true }
    }
}
#endif
