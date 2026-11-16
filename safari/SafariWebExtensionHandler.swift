import SafariServices

// Replaces the converter's echo template. Requests come only from this extension's background page.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let request = NativeRequest.parse(item?.userInfo?[SFExtensionMessageKey])
        var profile: UUID?
        if #available(macOS 14.0, *) {
            profile = item?.userInfo?[SFExtensionProfileKey] as? UUID
        }
        let reply = Reply(context: context)
        Task { [profile] in
            reply.send(await NativeBridge.shared.handle(request, profile: profile))
        }
    }
}

// NSExtensionContext is not Sendable; it is touched once, after the bridge answers.
private final class Reply: @unchecked Sendable {
    private let context: NSExtensionContext

    init(context: NSExtensionContext) {
        self.context = context
    }

    func send(_ reply: NativeReply) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply.message]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
