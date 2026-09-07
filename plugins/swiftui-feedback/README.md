# SwiftUI Feedback plugin

A Codex skill for adding DevFeedback to a native Mac SwiftUI app, keeping target tags useful as the UI changes, and acting on selected exported notes. The actual overlay runs in the host app through the separate [Swift package](../../packages/swiftui-feedback/README.md).

This is a validated plugin source directory for local testing. It has not been installed globally, added to a marketplace, or published. Use Codex's supported local plugin workflow to install this directory, or make its skill available in a project's `.agents/skills` directory. The skill is self-contained and points to the prototype package source; users still need to add that Swift dependency to their app.

Try: “Add feedback capture to this Mac app and tag its main controls.”

The skill guides package adoption, stable semantic IDs, repeated-view instance keys, source hints, privacy, Debug/Release checks, and selected-note implementation. Its checker detects duplicate literal declarations; the runtime picker shows duplicate rendered IDs. Neither guarantees that every visible control is tagged.

Validation from the repository root:

```sh
python3 plugins/swiftui-feedback/skills/swiftui-feedback/scripts/check-targets.py /path/to/host/Sources
```
