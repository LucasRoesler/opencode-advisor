import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "fs"
import { createHash } from "crypto"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"))
const VERSION = PKG.version
const PLUGINS_DIR = join(process.env.HOME!, ".config", "opencode", "plugins")
const COMMANDS_DIR = join(process.env.HOME!, ".config", "opencode", "commands")

type Plugin = {
  id: string
  src: string
  dest: string
  commands?: { src: string; dest: string }[]
}

const PLUGINS: Plugin[] = [
  {
    id: "advisor",
    src: join(ROOT, "src", "advisor.ts"),
    dest: join(PLUGINS_DIR, "advisor.ts"),
  },
  {
    id: "btw",
    src: join(ROOT, "src", "btw.ts"),
    dest: join(PLUGINS_DIR, "btw.ts"),
    commands: [
      {
        src: join(ROOT, "commands", "btw.md"),
        dest: join(COMMANDS_DIR, "btw.md"),
      },
    ],
  },
]

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function hashFile(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12)
  } catch {
    return null
  }
}

type PluginStatus = "missing" | "current" | "stale" | "unknown"

function checkStatus(p: Plugin): { status: PluginStatus; srcHash: string; dstHash: string | null } {
  const srcHash = hashFile(p.src) ?? "?"
  const dstHash = hashFile(p.dest)
  if (!dstHash) return { status: "missing", srcHash, dstHash: null }
  return { status: srcHash === dstHash ? "current" : "stale", srcHash, dstHash }
}

function showStatus() {
  const header = `Plugin          Status     Version`
  console.log(header)
  console.log("─".repeat(header.length))
  for (const p of PLUGINS) {
    const { status } = checkStatus(p)
    const label = status === "missing" ? "not installed" : status === "current" ? "current ✓" : "outdated !"
    console.log(`${p.id.padEnd(16)} ${label.padEnd(10)} ${VERSION}`)
    if (p.commands) {
      const cmdLabel = existsSync(p.commands[0].dest) ? "installed" : "not installed"
      console.log(`  └ cmd         ${cmdLabel}`)
    }
  }
}

function copyFile(src: string, dest: string, label: string) {
  ensureDir(dirname(dest))
  copyFileSync(src, dest)
  console.log(`  ${label} → ${dest}`)
}

function install(p: Plugin) {
  ensureDir(PLUGINS_DIR)
  console.log(`Installing ${p.id} v${VERSION}...`)
  copyFile(p.src, p.dest, "plugin")
  if (p.commands) {
    for (const cmd of p.commands) {
      copyFile(cmd.src, cmd.dest, "cmd")
    }
  }
  console.log(`  done`)
}

function remove(p: Plugin) {
  const files = [p.dest, ...(p.commands ?? []).map((c) => c.dest)]
  for (const f of files) {
    if (existsSync(f)) {
      unlinkSync(f)
      console.log(`  removed ${f}`)
    }
  }
}

function ask(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${question} [y/N] `)
    const onData = (data: Buffer) => {
      process.stdin.off("data", onData)
      process.stdin.pause()
      const answer = data.toString().trim().toLowerCase()
      resolve(answer === "y" || answer === "yes")
    }
    process.stdin.resume()
    process.stdin.once("data", onData)
  })
}

async function interactive() {
  console.log(`\nOpenCode Plugins Installer v${VERSION}\n`)

  showStatus()
  console.log()

  for (const p of PLUGINS) {
    const { status } = checkStatus(p)
    if (status === "missing") {
      const ok = await ask(`Install ${p.id}?`)
      if (ok) install(p)
    } else if (status === "stale") {
      const ok = await ask(`Upgrade ${p.id} (source has changed)?`)
      if (ok) install(p)
    } else {
      console.log(`${p.id}: up to date`)
    }
  }

  console.log("\nDone.")
}

const args = process.argv.slice(2)

if (args.includes("--help")) {
  console.log(`
Usage: bun run install [flags] [plugin]

Flags:
  (no args)          Interactive mode — shows status, prompts for actions
  <plugin>           Install/upgrade a specific plugin (advisor | btw)
  --all              Install/upgrade all plugins
  --remove <plugin>  Remove a plugin
  --status           Show installed plugin status
  --help             Show this help
`)
  process.exit(0)
}

if (args.includes("--status")) {
  showStatus()
  process.exit(0)
}

const removeIdx = args.indexOf("--remove")
if (removeIdx >= 0) {
  const id = args[removeIdx + 1]
  const p = PLUGINS.find((x) => x.id === id)
  if (!p) {
    console.error(`Unknown plugin: ${id}`)
    process.exit(1)
  }
  remove(p)
  process.exit(0)
}

if (args.includes("--all")) {
  for (const p of PLUGINS) install(p)
  process.exit(0)
}

const argPlugins = args.filter((a) => !a.startsWith("--"))
if (argPlugins.length > 0) {
  for (const id of argPlugins) {
    const p = PLUGINS.find((x) => x.id === id)
    if (!p) {
      console.error(`Unknown plugin: ${id}`)
      process.exit(1)
    }
    install(p)
  }
  process.exit(0)
}

await interactive()
