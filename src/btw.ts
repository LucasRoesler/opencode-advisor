import { type Plugin } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"

const DEFAULT_PROVIDER = "deepseek"
const DEFAULT_MODEL = "deepseek-v4-pro"

let btwModel = {
  providerID: DEFAULT_PROVIDER,
  modelID: DEFAULT_MODEL,
}

let inBtwCall = false

function textPart(text: string): { type: "text"; text: string } {
  return { type: "text", text }
}

function resolveModelFromEnv() {
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

export const BtwPlugin: Plugin = async ({ serverUrl, directory }, options) => {
  if (options && typeof options === "object") {
    if (typeof options.model === "string" && options.model.includes("/")) {
      const [providerID, ...rest] = options.model.split("/")
      btwModel = { providerID, modelID: rest.join("/") }
    } else if (typeof options.providerID === "string" && typeof options.modelID === "string") {
      btwModel = { providerID: options.providerID, modelID: options.modelID }
    }
  }
  const envOverride = resolveModelFromEnv()
  if (envOverride) btwModel = envOverride

  const v2client = createOpencodeClient({
    baseUrl: serverUrl.toString(),
    directory,
  })

  async function fetchTranscript(sessionID: string): Promise<string> {
    const { data: messages } = await v2client.session.messages({ sessionID })
    const msgList = messages ?? []
    return msgList
      .filter((m: any) => {
        if (m.info.role !== "user") return true
        const isBtw = m.parts.some(
          (p: any) => p.type === "text" && typeof p.text === "string" && p.text.toLowerCase().startsWith("/btw")
        )
        return !isBtw
      })
      .map((m: any) => {
        const text = m.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("")
        const role = m.info.role === "user" ? "User" : "Assistant"
        return `${role}: ${text}`
      })
      .filter((s: string) => s.split(": ")[1]?.length > 0)
      .join("\n\n")
  }

  async function processBtw(sessionID: string, query: string) {
    inBtwCall = true
    try {
      const transcript = await fetchTranscript(sessionID)

      const promptParts = []
      if (transcript) {
        promptParts.push(`--- CONVERSATION CONTEXT ---\n\n${transcript}\n\n`)
      }
      promptParts.push(`--- QUESTION ---\n\n${query}`)

      const createRes = await v2client.session.create({})
      const tempSessionID = createRes.data?.id
      if (!tempSessionID) {
        console.error("btw: ephemeral session creation returned no ID")
        return
      }

      let answerText = "BTW returned no answer."
      try {
        const response = await v2client.session.prompt({
          sessionID: tempSessionID,
          model: btwModel,
          system: SYSTEM_PROMPT,
          parts: [{ type: "text", text: promptParts.join("") }],
        })

        answerText = response.data?.parts
          ?.filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n") || "BTW returned no answer."
      } finally {
        await v2client.session.delete({ sessionID: tempSessionID }).catch((e) => console.error("btw: failed to delete ephemeral session", e))
      }

      await v2client.session.prompt({
        sessionID,
        noReply: true,
        parts: [textPart(`---\n**BTW:** ${query}\n\n${answerText}\n---`)],
      }).catch((e) => console.error("btw: failed to append card", e))
    } finally {
      inBtwCall = false
    }
  }

  return {
    "command.execute.before": async (input, output) => {
      if (input.command !== "btw") return

      if (inBtwCall) {
        output.parts = [textPart("Error: BTW command cannot be called recursively.")]
        return
      }

      const { sessionID } = input
      const btwQuery = input.arguments

      if (!btwQuery || !btwQuery.trim()) {
        output.parts = [textPart("Error: empty BTW query. Usage: /btw <question>")]
        return
      }

      output.parts = [textPart(`[BTW] ${btwQuery}...`)]

      processBtw(sessionID, btwQuery).catch((e) => console.error("btw:", e))
    },
  }
}
