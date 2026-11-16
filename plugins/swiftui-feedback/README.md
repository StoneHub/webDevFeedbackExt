# SwiftUI Feedback plugin

A Codex skill for adding DevFeedback to a native Mac SwiftUI app, keeping target tags useful as the UI changes, and acting on user-provided capture exports. The actual overlay runs in the host app through the separate [Swift package](../../packages/swiftui-feedback/README.md).

This directory contains the agent plugin source. Vendoring the Swift package does not install this plugin globally or add it to a marketplace. Use Codex's supported local plugin workflow to install this directory, or make its skill available in a project's `.agents/skills` directory. The skill is self-contained and points to the prototype package source; users still need to add that Swift dependency to their app.

Try: “Add feedback capture to this Mac app and tag its main controls.”

The native capture panel accepts one optional note. **Save/Enter** saves locally, copies the current picking run, and keeps picking; **Shift+Enter** adds a line. **×/window close** discards the pending capture and resumes picking. **Escape/Stop** discards the pending capture and stops. **Developer → Captures for This Screen** lists current-screen captures with **Copy all**, **Markdown**, **JSON**, and per-item deletion. There is no saved-note editing or acceptance editor; existing records and legacy acceptance data remain available in exports.

During picking, the host’s underlying SwiftUI content is hidden from accessibility and the outlined targets expose dedicated **Capture feedback** actions. Host validation must confirm these actions capture feedback rather than invoke app controls, including content in separate hosting roots. The package collects static tags, source hints, geometry, and optional notes—not rendered text or screenshots—and requests no Accessibility or screen-recording permission. Native title bars, system menus, untagged controls, and browser-MCP import are unsupported. Save copies to the clipboard immediately; review captures before sharing them.

The skill guides package adoption, stable semantic IDs, repeated-view instance keys, source hints, privacy, Debug/Release checks, and implementation from user-provided captures. Its checker detects duplicate literal declarations; the runtime picker shows duplicate rendered IDs. Neither guarantees that every visible control is tagged.

Validation from the repository root:

```sh
python3 plugins/swiftui-feedback/skills/swiftui-feedback/scripts/check-targets.py /path/to/host/Sources
```
