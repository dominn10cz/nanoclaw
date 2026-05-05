# Fork customizations (dominn10cz/nanoclaw)

What this fork adds on top of upstream `qwibitai/nanoclaw` v2.0.30.

## Skill-installed adapters and tools

These come from upstream long-lived branches (`channels`, `providers`) but the install lives on disk because the skills modify tracked files (barrel imports, `package.json`).

| What | Skill | Files touched |
|------|-------|---------------|
| Telegram channel adapter | `/add-telegram` | `src/channels/telegram*.ts` (5 files), `src/channels/index.ts` import, `package.json` (`@chat-adapter/telegram`) |
| Gmail MCP tool | `/add-gmail-tool` | `container/Dockerfile` (`GMAIL_MCP_VERSION` ARG + new pnpm install RUN block), `~/.gmail-mcp/` stub credentials (host-side, gitignored) |

Container.json wiring per agent group (`groups/<name>/container.json`) is gitignored — installation-specific.

## OneCLI OAuth subscription auth

`src/providers/index.ts` registers the `claude` provider (`import './claude.js'`). This is required when authenticating via Anthropic OAuth subscription tokens (`sk-ant-oat0-…`) rather than API keys — see `CLAUDE.md` § "Gotcha: OAuth subscription token needs the `claude` provider".

`.env` (gitignored) must contain `ANTHROPIC_BASE_URL=https://api.anthropic.com/` to activate the provider's env contribution.

## V1-ported container skills

Skills carried over from V1 — the SKILL.md files are pure markdown instructions for the agent (no separate runtime implementation).

- `container/skills/freelo/` — Freelo.io REST API client patterns (uses `FREELO_EMAIL` + `FREELO_API_KEY` from agent env or OneCLI vault)
- `container/skills/capabilities/` — agent self-introspection prompt
- `container/skills/set-models/` — model preference switching
- `container/skills/status/` — agent status reporting

## Removed from upstream

- `groups/global/CLAUDE.md` — V2's `migrateGroupsToClaudeLocal` (in `src/claude-md-compose.ts`) auto-deletes `groups/global/` on every host startup, since V2's per-group composed CLAUDE.md replaces V1's global-fragment model. Tracked file removed to match runtime reality.
- `groups/main/CLAUDE.md` — V1 "main group" model is gone in V2 (replaced by entity-model `agent_groups` + `messaging_groups`). The `groups/main/` folder was an orphan after migration.

## Per-install state (NOT in this repo)

- `.env` — channel tokens, `ASSISTANT_NAME`, `TELEGRAM_BOT_POOL`, `OPENAI_API_KEY`, `FREELO_*`, `ANTHROPIC_BASE_URL`
- `groups/<folder>/` — per-group CLAUDE.local.md, container.json, attachments, conversations
- `~/.config/nanoclaw/mount-allowlist.json` — host filesystem mount allowlist
- `~/.gmail-mcp/` — stub credentials (real OAuth tokens live in OneCLI vault)
- `~/Development/workspace/nanoclaw-shared/` — shared RW data across agent groups (`clients.md`, `contacts.md`, etc.)
- `data/v2.db` and `data/v2-sessions/` — central DB + per-session DBs
- `~/.onecli/` — OneCLI vault (Postgres + app data)

See `.nanoclaw-migrations/v2-progress.md` (gitignored) for the live V1→V2 migration progress notes.

## Pulling upstream updates

```bash
git fetch origin
git merge origin/main           # standard merge
# or for a cleaner history:
git rebase origin/main
```

Conflicts most likely in:
- `src/channels/index.ts` (telegram import)
- `src/providers/index.ts` (claude import)
- `container/Dockerfile` (GMAIL_MCP_VERSION block + pnpm install)
- `package.json` (telegram dep)

Each is small and merges trivially. After merge, rebuild:
```bash
pnpm install --frozen-lockfile
pnpm run build
./container/build.sh
```
