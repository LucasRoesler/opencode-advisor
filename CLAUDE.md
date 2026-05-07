# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An OpenCode plugin package providing two plugins:
- **Advisor** — `advisor()` tool that lets the executor consult DeepSeek V4 Pro for strategic guidance mid-task
- **BTW** — `/btw` slash command that spawns an ephemeral sub-session to answer independently without persisting in conversation history

Published to npm as `@u007/opencode-advisor`.

## Architecture

### Advisor Plugin (`src/advisor.ts`)

- **Plugin entry:** `AdvisorPlugin` (default export from `src/advisor.ts`) — implements the `Plugin` type from `@opencode-ai/plugin`
- **Tool registration:** `tool({ description, args: {}, execute })` — no arguments; the tool reads context from `context.sessionID` and `context.messageID`
- **Transcript fetch:** `client.session.messages({ path: { id: sessionID } })` — filters out the current message, formats as `Role: text` pairs
- **Advisor call:** ephemeral session created via `client.session.create`, prompted with `ADVISOR_MODEL` (deepseek-v4-pro), deleted in `finally`
- **Recursion guard:** `inAdvisorCall` module-level flag prevents nested advisor calls
- **Debugging:** `console.log` outputs transcript sent to DeepSeek and the returned advice

### BTW Plugin (`src/btw.ts`)

- **Plugin entry:** `BtwPlugin` (default export from `src/btw.ts`) — implements the `Plugin` type from `@opencode-ai/plugin`
- **Hook:** `"command.execute.before"` — intercepts `/btw` commands
- **Ephemeral session:** v2 SDK client (`createOpencodeClient` from `@opencode-ai/sdk/v2`) creates temp session, sends prompt with transcript context, deletes after response
- **Non-blocking:** acknowledged immediately in hook, ephemeral session runs in background
- **Result card:** answer appended to main session via `session.prompt({ noReply: true })` — adds message, no AI reply, current agent uninterrupted
- **Model resolution:** Config via env vars `OPENCODE_BTW_MODEL`, `OPENCODE_BTW_PROVIDER`, or opencode.json `btw` block — follows same pattern as advisor
- **Recursion guard:** `inBtwCall` module-level flag

## Publishing

```bash
npm publish --access public
```

Bump `version` in `package.json` before publishing.

## Install (for testing locally)

Use the setup script:

```bash
bun run setup         # interactive — shows status, prompts actions
bun run setup --all   # install/upgrade everything
bun run setup btw     # install/upgrade a specific plugin
bun run setup --status # check installed state
bun run setup --remove btw  # remove a plugin
```

Or manually: copy `.ts` files to `~/.config/opencode/plugins/` and command `.md` files to `~/.config/opencode/commands/`.

Or via npm + `opencode.json`:

```json
{ "plugin": ["@u007/opencode-advisor"] }
```

## Requirements

- OpenCode >= 1.4.x (`@opencode-ai/plugin` peer dependency)
- DeepSeek API key configured in OpenCode via `/connect`
