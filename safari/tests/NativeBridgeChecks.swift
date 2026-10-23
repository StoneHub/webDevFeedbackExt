import Foundation

// Native checks with a temporary History folder and a fake clipboard; the real pasteboard is never touched.
@main
struct NativeBridgeChecks {
    @MainActor static var writes: [String] = []
    @MainActor static var accept = true

    static func main() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("dev-feedback-native-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let bridge = NativeBridge(history: HistoryStore(directory: directory), clipboard: { text in
            writes.append(text)
            return accept
        })
        let key = "dev-feedback-https://site.test"
        let item = #"[{"id":"a","type":"element","note":"Bigger"}]"#
        func send(_ message: [String: Any], profile: UUID? = nil) async -> NativeReply {
            await bridge.handle(NativeRequest.parse(message), profile: profile)
        }

        // Only the four fixed requests parse; History keys must carry the extension's prefix.
        for message: [String: Any] in [["action": "history.read", "key": "../../etc/passwd"], ["action": "history.read"],
                                        ["action": "clipboard.read"], ["action": "file.write", "key": key, "items": item],
                                        ["action": "history.write", "key": key, "items": 42], ["action": "clipboard.write"]] {
            check(NativeRequest.parse(message) == nil, "rejects \(message)")
            check(await send(message) == .failure("Unsupported request."), "unsupported request fails closed")
        }
        check(NativeRequest.parse(["action": "clipboard.write", "text": String(repeating: "x", count: NativeRequest.maxTextBytes + 1)]) == nil, "clipboard text is capped")

        // Read, write, usage, and persistence across a new store on the same folder.
        check(await send(["action": "history.read", "key": key]) == NativeReply(), "empty History reads as nothing")
        check(await send(["action": "history.write", "key": key, "items": item]).ok, "write")
        check(await send(["action": "history.read", "key": key]).items == item, "read back")
        let usage = await send(["action": "history.usage", "key": key])
        check(usage.total == key.utf8.count + item.utf8.count && usage.key == usage.total, "usage counts key and value bytes")
        let reopened = NativeBridge(history: HistoryStore(directory: directory), clipboard: { _ in false })
        check(await reopened.handle(.readHistory(key: key), profile: nil).items == item, "History survives a new process")
        let attributes = try FileManager.default.attributesOfItem(atPath: directory.path)
        check((attributes[.posixPermissions] as? Int) == 0o700, "History folder is private to the user")

        // Profiles keep separate History.
        let profile = UUID()
        check(await send(["action": "history.read", "key": key], profile: profile).items == nil, "another profile sees nothing")

        // Only item lists are stored; an empty list removes the key.
        check(await send(["action": "history.write", "key": key, "items": #"{"id":"a"}"#]) == .failure("Saved notes could not be read or written."), "rejects non-list")
        check(await send(["action": "history.write", "key": key, "items": "[1]"]).ok == false, "rejects non-object items")
        check(await send(["action": "history.read", "key": key]).items == item, "a rejected write keeps History")

        // The hard cap stops growth but never blocks shrinking.
        let big = "[{\"note\":\"" + String(repeating: "x", count: HistoryStore.maxTotalBytes / 2) + "\"}]"
        check(await send(["action": "history.write", "key": key + "/1", "items": big]).ok, "first half")
        let full = await send(["action": "history.write", "key": key + "/2", "items": big])
        check(full.ok == false && full.reason?.contains("nearly full") == true, "growth past the cap is refused")
        check(await send(["action": "history.write", "key": key + "/1", "items": "[]"]).ok, "shrinking is allowed")
        check(await send(["action": "history.read", "key": key + "/1"]).items == nil, "empty list removes the key")

        // An unreadable or corrupt store fails the write instead of being replaced by one page.
        let store = directory.appendingPathComponent("history.json")
        let otherPage = ["action": "history.write", "key": key + "/other", "items": item]
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: store.path)
        let unreadable = await send(otherPage)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: store.path)
        check(unreadable == .failure("Saved notes could not be read or written."), "an unreadable store refuses writes")
        check(await send(["action": "history.read", "key": key]).items == item, "page A survives the refused write")
        check(await send(["action": "history.read", "key": key + "/other"]).items == nil, "page B was not written")
        let original = try Data(contentsOf: store)
        let corrupt = Data("{\"dev-feedback-https://site.test\":".utf8)
        try corrupt.write(to: store)
        check(await send(otherPage).ok == false, "a corrupt store refuses writes")
        check(await send(["action": "history.read", "key": key]).ok == false, "a corrupt store refuses reads")
        check(try Data(contentsOf: store) == corrupt, "the corrupt file is left untouched")
        try original.write(to: store)

        // Concurrent writes to different pages all land; the actor serializes read-modify-write.
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<20 {
                group.addTask { _ = await send(["action": "history.write", "key": "\(key)/page\(index)", "items": item]) }
            }
        }
        for index in 0..<20 {
            check(await send(["action": "history.read", "key": "\(key)/page\(index)"]).items == item, "concurrent write \(index) kept")
        }

        // Clipboard: success and failure are reported as they happened, in order.
        check(await send(["action": "clipboard.write", "text": "Page feedback 1"]) == NativeReply(copied: true), "copy reports success")
        await MainActor.run { accept = false }
        check(await send(["action": "clipboard.write", "text": "Page feedback 2"]) == NativeReply(copied: false), "a refused write reports failure")
        await MainActor.run { accept = true }
        check(await send(["action": "clipboard.write", "text": "Page feedback 2"]).copied == true, "retry copies")
        check(await MainActor.run { writes } == ["Page feedback 1", "Page feedback 2", "Page feedback 2"], "writes happen in request order")
        check(NativeReply(items: item, copied: true).message.keys.sorted() == ["copied", "items", "ok"], "reply carries only set fields, and no debug flag outside Debug")
        print("PASS native bridge: request allowlist, History persistence/profiles/caps/concurrency, clipboard success/failure/retry")
    }

    static func check(_ condition: Bool, _ message: String) {
        if !condition {
            FileHandle.standardError.write(Data("FAIL \(message)\n".utf8))
            exit(1)
        }
    }
}
