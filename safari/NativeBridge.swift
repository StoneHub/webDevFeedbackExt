import AppKit
import Foundation

// The only native requests the Safari extension can make. The background page sends them
// (safari/platform.js); Safari delivers nothing from content scripts or other extensions.
enum NativeRequest: Sendable, Equatable {
    case readHistory(key: String)
    case writeHistory(key: String, items: String)
    case historyUsage(key: String)
    case writeClipboard(text: String)

    static let keyPrefix = "dev-feedback-"
    static let maxKeyLength = 4096
    static let maxTextBytes = 10 * 1024 * 1024

    static func parse(_ message: Any?) -> NativeRequest? {
        guard let message = message as? [String: Any], let action = message["action"] as? String else { return nil }
        if action == "clipboard.write" {
            guard let text = message["text"] as? String, text.utf8.count <= maxTextBytes else { return nil }
            return .writeClipboard(text: text)
        }
        guard let key = message["key"] as? String, key.hasPrefix(keyPrefix), key.utf8.count <= maxKeyLength else { return nil }
        switch action {
        case "history.read": return .readHistory(key: key)
        case "history.usage": return .historyUsage(key: key)
        case "history.write":
            guard let items = message["items"] as? String, items.utf8.count <= maxTextBytes else { return nil }
            return .writeHistory(key: key, items: items)
        default: return nil
        }
    }
}

struct NativeReply: Sendable, Equatable {
    var ok = true
    var reason: String?
    var items: String?
    var total: Int?
    var key: Int?
    var copied: Bool?

    static func failure(_ reason: String) -> NativeReply { NativeReply(ok: false, reason: reason) }

    var message: [String: Any] {
        var result: [String: Any] = ["ok": ok]
        if let reason { result["reason"] = reason }
        if let items { result["items"] = items }
        if let total { result["total"] = total }
        if let key { result["key"] = key }
        if let copied { result["copied"] = copied }
        return result
    }
}

enum HistoryError: Error, Equatable {
    case notAnItemList
    case full
}

/// Saved History, one file per Safari profile, in the app extension's sandbox container where
/// web pages and content scripts cannot reach it. Each value is a page's JSON item list, keyed the
/// same way Chrome keys storage.local. One actor serializes every read and write.
actor HistoryStore {
    // Above the background's 8 MiB budget, so it only stops a runaway writer; shrinking is always allowed.
    static let maxTotalBytes = 10 * 1024 * 1024
    private let directory: URL

    init(directory: URL) {
        self.directory = directory
    }

    func read(_ key: String, profile: UUID?) throws -> String? {
        try load(profile)[key]
    }

    func write(_ key: String, items: String, profile: UUID?) throws {
        guard let parsed = try? JSONSerialization.jsonObject(with: Data(items.utf8)) as? [Any],
              parsed.allSatisfy({ $0 is [String: Any] }) else { throw HistoryError.notAnItemList }
        var entries = try load(profile)
        let before = Self.bytes(entries)
        if parsed.isEmpty { entries[key] = nil } else { entries[key] = items }
        let after = Self.bytes(entries)
        if after > Self.maxTotalBytes && after > before { throw HistoryError.full }
        try save(entries, profile: profile)
    }

    func usage(_ key: String, profile: UUID?) throws -> (total: Int, key: Int) {
        let entries = try load(profile)
        return (Self.bytes(entries), entries[key].map { key.utf8.count + $0.utf8.count } ?? 0)
    }

    private static func bytes(_ entries: [String: String]) -> Int {
        entries.reduce(0) { $0 + $1.key.utf8.count + $1.value.utf8.count }
    }

    private func file(_ profile: UUID?) -> URL {
        directory.appendingPathComponent(profile.map { "history-\($0.uuidString).json" } ?? "history.json")
    }

    private func load(_ profile: UUID?) throws -> [String: String] {
        guard let data = try? Data(contentsOf: file(profile)) else { return [:] }
        return try JSONDecoder().decode([String: String].self, from: data)
    }

    private func save(_ entries: [String: String], profile: UUID?) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
        try JSONEncoder().encode(entries).write(to: file(profile), options: .atomic)
    }
}

struct NativeBridge: Sendable {
    let history: HistoryStore
    /// Writes text to the clipboard and reports whether it was accepted. Nothing here reads it.
    let clipboard: @MainActor @Sendable (String) -> Bool

    static let shared = NativeBridge(
        history: HistoryStore(directory: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("app.stonehub.dev-feedback-capture/History")),
        clipboard: { text in
            NSPasteboard.general.clearContents()
            return NSPasteboard.general.setString(text, forType: .string)
        })

    func handle(_ request: NativeRequest?, profile: UUID?) async -> NativeReply {
        guard let request else { return .failure("Unsupported request.") }
        do {
            switch request {
            case .readHistory(let key):
                return NativeReply(items: try await history.read(key, profile: profile))
            case .writeHistory(let key, let items):
                try await history.write(key, items: items, profile: profile)
                return NativeReply()
            case .historyUsage(let key):
                let usage = try await history.usage(key, profile: profile)
                return NativeReply(total: usage.total, key: usage.key)
            case .writeClipboard(let text):
                return NativeReply(copied: await clipboard(text))
            }
        } catch HistoryError.full {
            return .failure("History is nearly full. Export and delete older items, or shorten this note. Your draft is still open.")
        } catch {
            return .failure("Saved notes could not be read or written.")
        }
    }
}
