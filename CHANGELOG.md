# Changelog

## 1.1.2 — 2026-05-06

- Version bump to resolve npm publish conflict (1.1.1 was already published).

## 1.1.1 — 2026-05-06

- Republish with no functional changes.

## 1.1.0 — 2026-05-06

- Configurable advisor provider/model. Defaults to `deepseek/deepseek-v4-pro`.
- Read from `opencode.json` via `advisor` block (`{ "advisor": { "model": "provider/model" } }` or split `providerID` / `modelID`).
- Override via env vars `OPENCODE_ADVISOR_MODEL` (supports `provider/model` form) and `OPENCODE_ADVISOR_PROVIDER`.
- Precedence: env var > `opencode.json` > default.
- Log the active provider/model on each advisor call.

## 1.0.1 — 2026-05-06

- Added debug logging of the input transcript sent to the advisor and the returned advice.

## 1.0.0 — 2026-05-06

- Initial release: first-class `advisor()` tool that forwards the session transcript to DeepSeek V4 Pro and returns concise strategic guidance.
