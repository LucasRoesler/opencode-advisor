# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An OpenCode plugin that adds an `advisor()` tool to the executor's tool list. When called, the plugin fetches the active session transcript via the OpenCode SDK, creates an ephemeral session, sends it to DeepSeek V4 Pro with a strategic guidance prompt, and returns <300-word advice as a tool result.

Single source file: `src/advisor.ts`. Published to npm as `@u007/opencode-advisor`.

## Architecture

- **Plugin entry:** `AdvisorPlugin` (default export from `src/advisor.ts`) — implements the `Plugin` type from `@opencode-ai/plugin`
- **Tool registration:** `tool({ description, args: {}, execute })` — no arguments; the tool reads context from `context.sessionID` and `context.messageID`
- **Transcript fetch:** `client.session.messages({ path: { id: sessionID } })` — filters out the current message, formats as `Role: text` pairs
- **Advisor call:** ephemeral session created via `client.session.create`, prompted with `ADVISOR_MODEL` (deepseek-v4-pro), deleted in `finally`
- **Recursion guard:** `inAdvisorCall` module-level flag prevents nested advisor calls
- **Debugging:** `console.log` outputs transcript sent to DeepSeek and the returned advice

## Publishing

```bash
npm publish --access public
```

Bump `version` in `package.json` before publishing.

## Install (for testing locally)

Copy `src/advisor.ts` to `~/.config/opencode/plugins/advisor.ts` — OpenCode auto-loads `.ts` files from that directory with no config needed.

Or via npm + `opencode.json`:

```json
{ "plugin": ["@u007/opencode-advisor"] }
```

## Requirements

- OpenCode >= 1.4.x (`@opencode-ai/plugin` peer dependency)
- DeepSeek API key configured in OpenCode via `/connect`
