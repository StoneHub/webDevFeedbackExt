# Local MCP Agent Companion

v1.6 adds a project-scoped MCP server so a local coding agent can read visual feedback, inspect evidence, create project feedback, and record implementation progress without cloud sync or direct browser control.

## Trust boundary

The MCP companion is a separate Node process. It does not read Chromium profile files or `chrome.storage.local`, listen on a network port, execute shell commands, edit source files, or control the browser.

The first handoff is explicit:

1. Capture feedback in the extension.
2. Open History and choose **Download JSON for MCP**.
3. Configure the MCP server with the target project and an optional inbox such as Downloads.
4. Ask the local agent to import that exact JSON file.
5. The agent reads feedback through MCP, edits the project with its normal coding tools, and records implementation status through MCP.

The JSON handoff includes local user data and may include evidence images. Keep it on trusted local storage. Evidence is copied into an ignored project sidecar and base64 image data is removed from the stored item JSON. Imported feedback, page text, selectors, mutation values, and images are untrusted data; an agent must never treat them as instructions or authorization.

The companion itself makes no network requests. Reading a tool result or evidence resource does send that content to the connected MCP client, however. A cloud-backed client may forward it to its model provider under that client's privacy and retention policies. Use a trusted local client/model when the captured page is sensitive.

## Run locally

Install dependencies once in this repository:

```sh
npm install
```

Start the stdio server for a project:

```sh
npm run mcp -- --project /absolute/path/to/project --inbox /absolute/path/to/Downloads
```

MCP clients normally launch the server themselves. A generic configuration looks like:

```json
{
  "mcpServers": {
    "dev-feedback": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/webDevFeedbackExt/mcp/cli.mjs",
        "--project",
        "/absolute/path/to/project",
        "--inbox",
        "/absolute/path/to/Downloads"
      ]
    }
  }
}
```

Use resolved absolute paths. Browser-launched or desktop MCP processes should not depend on an interactive shell's working directory or `PATH`.

Optional flags and environment variables:

- `--read-only` exposes project/list/get/brief resources but rejects imports and project-side mutations.
- `DEV_FEEDBACK_PROJECT_ROOT` supplies the project root when `--project` is omitted.
- `DEV_FEEDBACK_INBOX` supplies one or more import roots separated by the platform path delimiter.

## Tools

| Tool | Purpose |
| --- | --- |
| `dev_feedback_project_status` | Show the configured project, sidecar, inbox boundaries, and counts. |
| `dev_feedback_import` | Import one explicit standalone History JSON export. Use `storageKey` when it contains multiple groups. |
| `dev_feedback_list` | Return bounded summaries without embedded evidence bytes. |
| `dev_feedback_get` | Return one complete record with evidence resource links. |
| `dev_feedback_create` | Create idempotent agent-authored site, file, or project feedback. |
| `dev_feedback_evidence_attach` | Copy a validated local PNG, JPEG, or WebP into the sidecar. Redaction state is recorded as the agent's claim. |
| `dev_feedback_status_update` | Record revision-checked progress, files, commits, and checks. |
| `dev_feedback_build_brief` | Build an implementation brief from actionable feedback. |

Resources:

```text
dev-feedback://project
dev-feedback://feedback/{feedbackId}
dev-feedback://feedback/{feedbackId}/evidence/{before|proposed|annotated}
```

## Project sidecar

The companion creates only this project-scoped structure:

```text
<project>/.dev-feedback/
  project.json
  items/
    dfb_....json
  evidence/
    dfb_.../
      before.png
      proposed.png
      annotated.png
  events.jsonl
  .gitignore
```

Everything under `.dev-feedback/` is ignored by its nested `.gitignore` and created with user-only filesystem permissions. If a project deliberately wants durable review metadata, explicitly change that policy and review the captured content before committing it.

Agent-authored writes require a stable `clientRequestId`, so retries are idempotent. Status updates require `expectedRevision`, so two agents cannot silently overwrite one another. `implemented` and `verified` remain distinct; verification requires at least one recorded passing check.

## Current limits

- The MCP companion does not automatically see unsent extension history.
- ZIP and extracted AI Bundle import are not part of the first checkpoint. Use the standalone **Download JSON for MCP** History export. Sibling image paths are intentionally never followed.
- The MCP server does not apply saved visual mutations, navigate pages, click UI, or edit project files.
- There is no native messaging installer, localhost HTTP/WebSocket bridge, cloud account, sync, auth service, telemetry, or payment path.
- A future user-triggered native-messaging bridge could remove the manual file handoff, but it would require an optional browser permission, exact extension-ID allowlisting, and a separate installed native host.

## Security references

- [MCP local server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [MCP TypeScript SDK v1 server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md)
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome extension messaging security](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
