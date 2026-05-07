# BTW Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/btw` slash command plugin to the OpenCode advisor package — spawns ephemeral session that answers independently with zero history contamination.

**Architecture:** Single-file plugin (`src/btw.ts`) using `"command.execute.before"` hook + v2 SDK for ephemeral session lifecycle. Model resolution from config/env matches advisor pattern. Message cleanup via `deleteMessage()`.

**Tech Stack:** TypeScript, `@opencode-ai/plugin`, `@opencode-ai/sdk/v2`

---

### Task 1: Create `src/btw.ts` — BTW Plugin

**Files:**
- Create: `src/btw.ts`
- Reference: `src/advisor.ts` (model resolution pattern)

- [ ] **Step 1: Write imports, model resolution, and constants**

```typescript
import { type Plugin } from "@opencode-ai/plugin"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"

const DEFAULT_PROVIDER = "deepseek"
const DEFAULT_MODEL = "deepseek-v4-pro"

let btwModel = {
  providerID: DEFAULT_PROVIDER,
  modelID: DEFAULT_MODEL,
}

function resolveEnv() {
  const env = (typeof process !== "undefined" && process.env) || {}
  const combined = env.OPENCODE_BTW_MODEL
  if (combined && combined.includes("/")) {
    const [providerID, ...rest] = combined.split("/")
    return { providerID, modelID: rest.join("/") }
  }
  const providerID = env.OPENCODE_BTW_PROVIDER
  const modelID = env.OPENCODE_BTW_MODEL
  if (providerID && modelID) return { providerID, modelID }
  return null
}

const SYSTEM_PROMPT = `You are a helpful assistant answering a by-the-way question from a user. You have access to the user's project workspace and can read files, search code, and investigate to answer accurately.

Use the conversation context below to understand what the user is working on, then answer their question.

Be concise and direct. Provide the answer in under 300 words. Do not ask follow-up questions — this is a one-shot interaction.`
```

- [ ] **Step 2: Write the plugin factory function**

```typescript
export const BtwPlugin: Plugin = async ({ serverUrl, directory }) => {
  const fromEnv = resolveEnv()
  if (fromEnv) btwModel = fromEnv

  return {
    config: async (config: any) => {
      const cfg = config?.btw
      if (cfg && typeof cfg === "object") {
        if (typeof cfg.model === "string" && cfg.model.includes("/")) {
          const [providerID, ...rest] = cfg.model.split("/")
          btwModel = { providerID, modelID: rest.join("/") }
        } else if (cfg.providerID && cfg.modelID) {
          btwModel = { providerID: cfg.providerID, modelID: cfg.modelID }
        }
      }
      const envOverride = resolveEnv()
      if (envOverride) btwModel = envOverride
    },
    "command.execute.before": async (input, output) => {
      if (input.command !== "btw") return

      const v2client = createOpencodeClient({
        baseUrl: serverUrl.toString(),
        directory,
      })

      const { sessionID, arguments: query } = input
      const messageID = input.sessionID // we'll capture the actual messageID differently

      try {
        // Fetch context from main session
        const { data: messages } = await v2client.session.messages({
          sessionID,
        })

        // Format transcript (excluding the BTW message — we don't have its messageID here)
        const transcript = (messages || [])
          .map((m) => {
            const text = (m.parts || [])
              .filter((p) => p.type === "text")
              .map((p) => (p as any).text)
              .join("")
            const role = m.info.role === "user" ? "User" : "Assistant"
            return `${role}: ${text}`
          })
          .filter(Boolean)
          .join("\n\n")

        // Create ephemeral session
        const createRes = await v2client.session.create({})
        const tempSessionID = createRes.data?.id
        if (!tempSessionID) {
          output.parts = [{ type: "text", text: "Error: could not create BTW session" }] as any
          return
        }

        let answerText = ""
        try {
          const promptBody = `Context from current session:\n\n${transcript}\n\n--- BTW QUESTION ---\n\n${query}`
          const response = await v2client.session.prompt({
            sessionID: tempSessionID,
            model: btwModel,
            parts: [{ type: "text", text: promptBody }],
          })

          answerText = (response.data?.parts || [])
            .filter((p) => p.type === "text")
            .map((p) => (p as any).text)
            .join("\n")
        } finally {
          await v2client.session.delete({ sessionID: tempSessionID }).catch(() => {})
        }

        // Return answer via output.parts
        output.parts = [{
          type: "text",
          text: answerText || "BTW returned no answer.",
        }] as any
      } catch (err) {
        output.parts = [{
          type: "text",
          text: `BTW error: ${err instanceof Error ? err.message : String(err)}`,
        }] as any
      }
    },
  }
}
```

- [ ] **Step 3: Fix message filtering and add deleteMessage**

The current `messageID` is not correctly captured. The `input` object for `command.execute.before` does not include a `messageID`. We need to capture the BTW message's ID differently.

Refined approach — fetch messages, find the BTW message by matching the command pattern in text, and use that message ID for deletion:

```typescript
"command.execute.before": async (input, output) => {
  if (input.command !== "btw") return

  const v2client = createOpencodeClient({
    baseUrl: serverUrl.toString(),
    directory,
  })

  const { sessionID, arguments: query } = input

  try {
    // Fetch context from main session
    const { data: messages } = await v2client.session.messages({ sessionID })
    const allMessages = messages || []

    // Find and exclude the BTW message itself
    const btwMsgIndex = allMessages.findIndex(
      (m) => m.info.role === "user" && (m.parts || []).some(
        (p) => p.type === "text" && (p as any).text?.startsWith("/btw")
      )
    )

    const btwMessageID = btwMsgIndex >= 0 ? allMessages[btwMsgIndex].info.id : null

    const transcript = allMessages
      .filter((_, i) => i !== btwMsgIndex)
      .map((m) => {
        const text = (m.parts || [])
          .filter((p) => p.type === "text")
          .map((p) => (p as any).text)
          .join("")
        const role = m.info.role === "user" ? "User" : "Assistant"
        return `${role}: ${text}`
      })
      .filter(Boolean)
      .join("\n\n")

    // Create ephemeral session
    const createRes = await v2client.session.create({})
    const tempSessionID = createRes.data?.id
    if (!tempSessionID) {
      output.parts = [{ type: "text", text: "Error: could not create BTW session" }] as any
      return
    }

    let answerText = ""
    try {
      const response = await v2client.session.prompt({
        sessionID: tempSessionID,
        model: btwModel,
        parts: [{ type: "text", text: `${SYSTEM_PROMPT}\n\nContext:\n${transcript}\n\n--- BTW QUESTION ---\n${query}` }],
      })

      answerText = (response.data?.parts || [])
        .filter((p) => p.type === "text")
        .map((p) => (p as any).text)
        .join("\n")
    } finally {
      await v2client.session.delete({ sessionID: tempSessionID }).catch(() => {})
    }

    // Return answer via output.parts
    output.parts = [{ type: "text", text: answerText || "BTW returned no answer." }] as any

    // Cleanup: delete the BTW message from main session (best-effort, after answer)
    if (btwMessageID) {
      v2client.session.deleteMessage({ sessionID, messageID: btwMessageID }).catch(() => {})
    }
  } catch (err) {
    output.parts = [{
      type: "text",
      text: `BTW error: ${err instanceof Error ? err.message : String(err)}`,
    }] as any
  }
}
```

- [ ] **Step 4: Verify the plugin export and type assertions**

The `as any` casts on `output.parts` are needed because the `Part` type requires `id`, `sessionID`, `messageID` fields that we don't know at construct time. OpenCode's runtime handles filling these in. The cast is intentional and documented.

---

### Task 2: Create `commands/btw.md` — Command template

**Files:**
- Create: `commands/btw.md`

- [ ] **Step 1: Write the command template**

```markdown
The /btw command is handled by the opencode-advisor BTW plugin. It spawns an ephemeral sub-session to answer your question independently without persisting in the current conversation history.

For more info, see the btw plugin documentation.
```

Note: This file enables tab-completion for `/btw`. The actual execution is handled by the plugin's `command.execute.before` hook. This file must be placed at `~/.config/opencode/commands/btw.md`.

---

### Task 3: Update `package.json` — Add SDK dependency + BTW export

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `@opencode-ai/sdk` as dependency**

```json
{
  "dependencies": {
    "@opencode-ai/plugin": ">=1.4.9",
    "@opencode-ai/sdk": ">=1.4.9"
  }
}
```

- [ ] **Step 2: Add BTW export entry**

Update the `exports` and `description`:

```json
{
  "name": "@u007/opencode-advisor",
  "version": "1.2.0",
  "description": "OpenCode plugins — advisor() tool and /btw command",
  "exports": {
    ".": "./src/advisor.ts",
    "./btw": "./src/btw.ts"
  },
  "keywords": ["opencode", "plugin", "advisor", "btw", "deepseek"]
}
```

---

### Task 4: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add BTW section after the Advisor section**

```markdown
## BTW Command

A `/btw` (by-the-way) slash command that spawns a fully ephemeral sub-session to answer your question independently. The BTW message, its response, and all agent activity are completely isolated from the main conversation history.

```
User: /btw what is the capital of France?
   ↓
Ephemeral session investigates, reads files, answers
   ↓
Answer returned to user — zero trace in main session
```

### How it works

1. User types `/btw <question>`
2. Plugin intercepts via `command.execute.before` hook
3. Creates an ephemeral session via SDK (no parentID — fully independent)
4. Feeds it the main session transcript + the question
5. Ephemeral session runs, reads files, investigates
6. Captures the single response
7. Deletes the ephemeral session (no persistence)
8. Deletes the `/btw` message from main session
9. Returns answer to user

### Install

Drop `src/btw.ts` into `~/.config/opencode/plugins/` and `commands/btw.md` into `~/.config/opencode/commands/`.

Or via npm (same package as advisor, just reference the btw export in opencode.json):

```json
{
  "plugin": [
    "@u007/opencode-advisor",
    "@u007/opencode-advisor/btw"
  ]
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
```

---

### Task 5: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add BTW plugin section after Advisor section**

```
## BTW Plugin

- **Plugin entry:** `BtwPlugin` (default export from `src/btw.ts`) — implements the `Plugin` type from `@opencode-ai/plugin`
- **Hook:** `"command.execute.before"` — intercepts `/btw` commands
- **Ephemeral session:** v2 SDK client creates temp session, sends prompt with transcript context, deletes after response
- **Message cleanup:** `deleteMessage()` removes the `/btw` user message from main session
- **Model resolution:** Config envs `OPENCODE_BTW_MODEL`, `OPENCODE_BTW_PROVIDER`, or opencode.json `btw` block
```

---

### Task 6: Self Review

- [ ] **Step 1: Spec coverage check**

- `"command.execute.before"` hook for `/btw` → Task 1 ✓
- Ephemeral session create/prompt/delete → Task 1 ✓
- Context from main session → Task 1 ✓
- Message cleanup via deleteMessage → Task 1 ✓
- Config/env model resolution → Task 1 ✓
- commands/btw.md for autocomplete → Task 2 ✓
- package.json updates → Task 3 ✓
- README docs → Task 4 ✓
- CLAUDE.md docs → Task 5 ✓

- [ ] **Step 2: Placeholder scan**

No placeholders, TODOs, or TBDs in the plan. ✓

- [ ] **Step 3: Type consistency check**

- `btwModel` matches `{ providerID: string, modelID: string }` consistently ✓
- `createOpencodeClient` from `@opencode-ai/sdk/v2` ✓
- `v2client.session.create()` returns `{ data: { id: string } }` ✓
- `v2client.session.prompt()` takes `{ sessionID, model, parts }` ✓
- `v2client.session.delete()` takes `{ sessionID }` ✓
- `v2client.session.deleteMessage()` takes `{ sessionID, messageID }` ✓
- `v2client.session.messages()` takes `{ sessionID }`, returns `Array<{ info: { id, role }, parts }>` ✓
