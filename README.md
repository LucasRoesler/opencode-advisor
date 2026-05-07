# OpenCode Advisor Plugin

First-class `advisor()` tool for OpenCode. The executor model (any provider) can consult DeepSeek V4 Pro for strategic guidance mid-task — before writing code, when stuck, or before declaring done.

## How it works

The `advisor` tool appears in the executor's tool list alongside `bash`, `read`, `edit`, etc. The executor decides **autonomously** when to call it based on the tool description's timing guidance — exactly like Claude Code's native advisor tool.

```
Executor: "I need to plan this implementation → calls advisor()"
         ↓
Plugin intercepts, fetches session transcript via SDK
         ↓
Creates ephemeral session, prompts deepseek-v4-pro with transcript
         ↓
Returns <300 word guidance → injected as tool result
         ↓
Executor continues with advice integrated
```

## Install

```bash
```bash
npm install -g @u007/opencode-advisor
```

Then add to `opencode.json`:

```json
{
  "plugin": ["@u007/opencode-advisor"]
}
```

Or use the setup script for interactive toggle:

```bash
bun run setup         # interactive — shows status, prompts actions
bun run setup btw     # install/upgrade a specific plugin
bun run setup --all   # install/upgrade everything
```

Or drop plugin `.ts` files into `~/.config/opencode/plugins/` for zero-config setup.

## Configuring the advisor model

Defaults to `deepseek/deepseek-v4-pro`. Override via either:

**1. `opencode.json`** — add an `advisor` block:

```json
{
  "plugin": ["@u007/opencode-advisor"],
  "advisor": {
    "model": "anthropic/claude-opus-4-7"
  }
}
```

Or split form: `"advisor": { "providerID": "anthropic", "modelID": "claude-opus-4-7" }`.

**2. Environment variables** (override config):

```bash
export OPENCODE_ADVISOR_MODEL="anthropic/claude-opus-4-7"
# or split:
export OPENCODE_ADVISOR_PROVIDER="anthropic"
export OPENCODE_ADVISOR_MODEL="claude-opus-4-7"
```

The chosen provider must be authenticated in OpenCode (`/connect`).

## How the executor knows when to call it

The tool description tells the model:

- Call **before substantive work** — after reading/discovery, before writing code
- Call **when stuck** — errors recurring, approach not converging
- Call **before declaring done** — after deliverable is durable
- On long tasks: at least once before approach + once before done
- Give advice serious weight; surface conflicts rather than silently switching

## BTW Command

A `/btw` (by-the-way) slash command that spawns a fully ephemeral sub-session to answer your question independently. The BTW answer appears as a card in the main session without interrupting the currently running agent.

```
User: /btw what is the capital of France?
   ↓
Acknowledged immediately — agent continues working
   ↓
Ephemeral session investigates in background, reads files, answers
   ↓
Answer card appears in session — main conversation uninterrupted
```

### How it works

1. User types `/btw <question>`
2. Plugin intercepts via `command.execute.before` hook, acknowledges immediately
3. Background process creates an ephemeral session via SDK (no parentID — fully independent)
4. Feeds it the main session transcript + the question
5. Ephemeral session runs, reads files, investigates
6. Captures the single response
7. Deletes the ephemeral session
8. Appends answer as a card to main session via `session.prompt({ noReply: true })` — no AI response triggered
9. `/btw` message stays visible; current agent unaffected

### Install

```bash
bun run setup btw      # install/upgrade via setup script
bun run setup         # interactive mode, select BTW
```

Or drop `src/btw.ts` into `~/.config/opencode/plugins/` and `commands/btw.md` into `~/.config/opencode/commands/`.

Or via npm (add as separate plugin):

```json
{
  "plugin": ["@u007/opencode-advisor", "@u007/opencode-advisor/btw"]
}
```

### Config

Same pattern as advisor — `opencode.json`:

```json
{
  "btw": {
    "model": "deepseek/deepseek-v4-pro"
  }
}
```

Or env vars: `OPENCODE_BTW_MODEL`, `OPENCODE_BTW_PROVIDER`.

## Requirements

- OpenCode >= 1.4.x
- DeepSeek API key configured via `/connect` in OpenCode

## License

MIT
