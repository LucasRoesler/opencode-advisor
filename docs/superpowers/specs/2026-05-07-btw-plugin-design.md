# BTW Plugin — Design Spec

## Summary

An OpenCode plugin that provides a `/btw` (by-the-way) slash command. When invoked, it spawns a fully ephemeral sub-session that answers the user's question independently — the BTW message, its response, and all agent activity are completely isolated from the main conversation history.

## How it works

```
User: /btw what is XXX?
       ↓
command.execute.before hook fires
  { command: "btw", sessionID, arguments: "what is XXX?" }
       ↓
Plugin creates ephemeral Session2 via v2 SDK client
       ↓
Fetches all messages from main session (minus BTW message) → context preamble
       ↓
Sends context + query to ephemeral session as a single prompt
       ↓
Ephemeral session runs independently (reads files, investigates)
       ↓
Captures the single text response
       ↓
Deletes ephemeral session (no persistence)
       ↓
Deletes the BTW user message from main session via deleteMessage()
       ↓
Returns answer via output.parts
       ↓
User sees answer with zero trace in session history
```

## Architecture

### Plugin entry: `BtwPlugin` (default export from `src/btw.ts`)

- Implements the `Plugin` type from `@opencode-ai/plugin`
- Uses `"command.execute.before"` hook to intercept `/btw` commands
- Closes over `serverUrl`, `directory`, `worktree`, and `$` from `PluginInput`

### Ephemeral session lifecycle

1. `client.session.create()` (v2 SDK) — no parentID, no title
2. `client.session.prompt()` — sends context + query, waits for response
3. `client.session.delete()` — guaranteed cleanup in `finally` block

### Context gathering

- Reads all messages from main session via `client.session.messages()`
- Filters out the current `/btw` message itself
- Formats as conversation preamble in the ephemeral session prompt
- Gives the BTW agent full situational awareness of what the user is working on

### Message cleanup

- Captures the `messageID` from the hook input
- After returning the answer, calls `client.session.deleteMessage()` to remove the BTW message from the main session
- This is best-effort (no throw on failure after answer is delivered)

### Configuration

Optional `opencode.json` block:

```json
{
  "btw": {
    "model": "deepseek/deepseek-v4-pro"
  }
}
```

Or split form: `"btw": { "providerID": "deepseek", "modelID": "deepseek-v4-pro" }`.

Override via env vars: `OPENCODE_BTW_MODEL="provider/model-id"` or `OPENCODE_BTW_PROVIDER` + `OPENCODE_BTW_MODEL`.

Follows same resolution pattern as advisor plugin but with `btw` prefix.

### File: `commands/btw.md`

Minimal markdown template for tab-completion to list `/btw`. Installed via setup script or manually at `~/.config/opencode/commands/btw.md`.

(The file only enables autocomplete — the plugin's `command.execute.before` hook handles everything.)

### Setup script: `scripts/install.ts`

Hash-verified installer with interactive mode. Reads `package.json` version, compares source vs installed sha256 per plugin. Supports install/upgrade/remove per plugin or in bulk.

```bash
bun run setup              # interactive — status + prompts
bun run setup btw          # install/upgrade specific
bun run setup --all        # force install all
bun run setup --remove btw # remove
bun run setup --status     # status only
```

## Constraints

- **No persistence:** Ephemeral session is deleted after response. Main session has the BTW message removed.
- **One answer only:** The BTW session returns the first complete response and stops. No follow-up.
- **Read-only intent:** The BTW agent can read files and investigate but is not expected to write files (no enforcement — trust the prompt).
## Requirements

- OpenCode >= 1.4.x
- `@opencode-ai/plugin` peer dependency (same as advisor)
