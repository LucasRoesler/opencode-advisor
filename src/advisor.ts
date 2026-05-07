import { type Plugin, tool } from "@opencode-ai/plugin"

const DEFAULT_PROVIDER = "deepseek"
const DEFAULT_MODEL = "deepseek-v4-pro"

let advisorModel = {
  providerID: DEFAULT_PROVIDER,
  modelID: DEFAULT_MODEL,
}

let inAdvisorCall = false

function resolveModelFromEnv() {
  const env = (typeof process !== "undefined" && process.env) || {}
  const combined = env.OPENCODE_ADVISOR_MODEL
  if (combined && combined.includes("/")) {
    const [providerID, ...rest] = combined.split("/")
    return { providerID, modelID: rest.join("/") }
  }
  const providerID = env.OPENCODE_ADVISOR_PROVIDER
  const modelID = env.OPENCODE_ADVISOR_MODEL
  if (providerID && modelID) return { providerID, modelID }
  return null
}

const SYSTEM_PROMPT = `You are a strategic advisor for a coding agent. Read the conversation transcript below and provide a concise plan or course correction.

Your advice must be actionable — tell the executor:
- What to do next
- What order to proceed in
- What to watch out for
- What not to do

Key heuristics:
- Prefer the simplest approach that meets the spec
- Flag approaches that create maintenance burden
- If the executor is stuck or looping, suggest a different approach
- If tests or evidence contradict an assumption, say so explicitly

Respond in under 300 words. Use enumerated steps. Do NOT write code — only advise.`

const TOOL_DESCRIPTION = `Consult a strategic advisor (backed by a stronger reviewer model, configurable; defaults to DeepSeek V4 Pro) that reads your full conversation context and provides a concise plan or course correction.

Call advisor BEFORE substantive work — before writing code, editing files, committing to an interpretation, or building on an assumption. If the task requires orientation first (finding files, reading code, fetching docs), do that, then call advisor. Orientation is NOT substantive work.

Also call advisor:
- When stuck — errors recurring, approach not converging, results that don't fit
- When considering a change of approach
- When you believe the task is complete. BEFORE this call, make your deliverable durable: write the file, save the result, commit the change

On tasks longer than a few steps, call advisor at least once before committing to an approach and once before declaring done. On short reactive turns where tool output directly dictates the next action, skip advisor.

Give the advice serious weight. Only override if you have primary-source evidence that contradicts a specific claim. Surface conflicts in another advisor call rather than silently switching approaches.`

export const AdvisorPlugin: Plugin = async ({ client }) => {
  const fromEnv = resolveModelFromEnv()
  if (fromEnv) advisorModel = fromEnv

  return {
    config: async (config: any) => {
      const cfg = config?.advisor
      if (cfg && typeof cfg === "object") {
        if (typeof cfg.model === "string" && cfg.model.includes("/")) {
          const [providerID, ...rest] = cfg.model.split("/")
          advisorModel = { providerID, modelID: rest.join("/") }
        } else if (cfg.providerID && cfg.modelID) {
          advisorModel = { providerID: cfg.providerID, modelID: cfg.modelID }
        }
      }
      const envOverride = resolveModelFromEnv()
      if (envOverride) advisorModel = envOverride
    },
    tool: {
      advisor: tool({
        description: TOOL_DESCRIPTION,
        args: {},
        async execute(_args, context) {
          if (inAdvisorCall) {
            return "Error: advisor tool cannot be called recursively. The advisor model must respond with text only."
          }

          const { sessionID, messageID } = context

          try {
            inAdvisorCall = true

            const { data: messages } = await client.session.messages({
              path: { id: sessionID },
            })

            const transcript = messages!
              .filter((m) => m.info.id !== messageID)
              .map((m) => {
                const text = m.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("")
                const role = m.info.role === "user" ? "User" : "Assistant"
                return `${role}: ${text}`
              })
              .filter((s) => s.split(": ")[1].length > 0)
              .join("\n\n")

            if (!transcript) {
              return "Advisor declined: no prior conversation to analyze."
            }

            const session = await client.session.create({
              body: { title: "advisor-subcall" },
            })

            try {
              const response = await client.session.prompt({
                path: { id: session.data!.id },
                body: {
                  model: advisorModel,
                  parts: [
                    {
                      type: "text",
                      text: `${SYSTEM_PROMPT}\n\n--- CONVERSATION TRANSCRIPT ---\n\n${transcript}`,
                    },
                  ],
                },
              })

              const text = response.data?.parts
                ?.filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n")

              return text || "Advisor returned no advice."
            } finally {
              await client.session
                .delete({ path: { id: session.data!.id } })
                .catch(() => {})
            }
          } finally {
            inAdvisorCall = false
          }
        },
      }),
    },
  }
}
