# DevDeck

**English** · [Português](README.pt-BR.md)

DevDeck is a local cockpit for developers. It brings vibe coding with Claude, MCP servers, reviewable diffs, AI cost tracking, your git activity across platforms, achievements, your daily agenda and a community feed together in one desktop app.

Stack: Electron 45 · electron-vite 6 · React 19 · TypeScript · zustand · Claude Agent SDK · MCP SDK · Supabase · ical.js

## Features

| Area | What you get |
|---|---|
| **Chat** | One Claude Agent SDK session per chat, scoped to a workspace. Streaming replies, local history, resume and stop. Attach files with `@` from the file tree. |
| **Reviewable diffs** | `Edit`/`Write`/`Bash`/MCP tool calls stop in an approval panel with unified or side-by-side diffs. You can approve, approve all for the session, ask for changes (your comment goes back to Claude) or reject. Each applied change can be reverted with a reverse patch. |
| **MCP panel** | stdio, HTTP or SSE servers. Toggle them, test the connection, set an auto/ask policy per tool, and import servers from Claude Desktop or Claude Code. |
| **Costs** | Per turn, session, day, month and model, with cache tokens. Daily and per-session budgets, plus a context-usage meter. |
| **Profile** | GitHub, GitLab (cloud or self-hosted) and Bitbucket Cloud metrics from read-only personal tokens: commits, PRs, reviews, streaks, a 26-week heatmap, languages and top repositories. |
| **Achievements** | 31 achievements across AI, Git, Focus, Agenda and Community, with XP, levels and up to 3 featured badges. |
| **Agenda** | Recurring local events (with a one-click daily stand-up), reminders with a Join button, and read-only ICS subscriptions (Outlook/Google). |
| **Community** | Articles and code snippets on Supabase, with likes, comments and reports. Access is enforced by row-level security. |
| **Flow** | Spotify embed and a 25/5 focus timer. |

## Getting started

```powershell
npm install
npm run dev
```

If Electron reports a missing binary, run `node node_modules/electron/install.js`.

- **Claude:** open *Config → Authentication* and paste an Anthropic API key. It is encrypted with the OS keychain via `safeStorage`.
- **Community (optional):** create a Supabase project and run [`supabase/migrations/0001_community.sql`](supabase/migrations/0001_community.sql). Add `{{ .Token }}` to the Magic Link email template, then copy `.env.example` to `.env`. Use the publishable/anon key only, never the `service_role` key.
- **Git providers:** in *Profile → Connections*, paste a read-only token for each provider you use.

Other scripts: `npm run typecheck`, `npm test` (Vitest, runs in two time zones), `npm run test:coverage`, `npm run build`, `npm start`. CI runs typecheck, tests, build and a secret scan on every push and PR.

### Security model

- Only the DevDeck UI can call the main process, and every argument is validated (zod). Navigation, new windows and browser permissions are denied by default.
- Project settings (`.claude/settings.json`, `.mcp.json`) are **off by default**. When enabled, DevDeck lists the hooks, permissions and MCP servers a repository wants to run and only loads them after you trust the workspace. It asks again if those files change.
- "Approve all for this session" never applies outside the workspace or to `.git`, `.claude`, `.vscode`, `.github` and similar folders.

## How we work

DevDeck is built by a **squad** (PO, Tech Lead, UX, Frontend, Backend, QA, Cybersecurity, DevOps). Each role is a Claude Code subagent in [`.claude/agents/`](.claude/agents/). Work happens in sprints:

- Process and the debate format: [`docs/squad.md`](docs/squad.md)
- Sprints: [`docs/sprints/`](docs/sprints/)
- Architecture decisions: [`docs/decisions.md`](docs/decisions.md)
- Release notes: [`CHANGELOG.md`](CHANGELOG.md)

## Project layout

```
src/
  shared/      IPC contracts, achievement catalog
  main/        Electron main: agent, MCP, providers, profile, achievements, agenda, store
  preload/     window.deck bridge (contextBridge)
  renderer/    React UI
supabase/      community schema + RLS
tests/         Vitest unit tests (pure logic in src/**/lib)
.github/       CI workflow + Dependabot
docs/          squad, sprints, ADRs
```

Local data lives in `%APPDATA%/DevDeck`.
