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
npm install -g @nanobot/opencode-advisor
```

Then add to `opencode.json`:

```json
{
  "plugin": ["@nanobot/opencode-advisor"]
}
```

Or install globally and it's auto-discovered.

## How the executor knows when to call it

The tool description tells the model:

- Call **before substantive work** — after reading/discovery, before writing code
- Call **when stuck** — errors recurring, approach not converging
- Call **before declaring done** — after deliverable is durable
- On long tasks: at least once before approach + once before done
- Give advice serious weight; surface conflicts rather than silently switching

## Requirements

- OpenCode >= 1.4.x
- DeepSeek API key configured via `/connect` in OpenCode

## License

MIT
