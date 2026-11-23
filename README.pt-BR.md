# DevDeck

[English](README.md) · **Português**

O DevDeck é o cockpit local do dev. Num único app desktop, ele junta vibe coding com o Claude, servidores MCP, diffs revisáveis, controle de custo de IA, sua atividade git em várias plataformas, conquistas, a agenda do dia e um feed da comunidade.

Stack: Electron 45 · electron-vite 6 · React 19 · TypeScript · zustand · Claude Agent SDK · MCP SDK · Supabase · ical.js

## Funcionalidades

| Área | O que tem |
|---|---|
| **Chat** | Uma sessão do Claude Agent SDK por chat, presa a um workspace. Respostas em streaming, histórico local, retomada e botão Parar. Anexe arquivos com `@` na árvore. |
| **Diff revisável** | Chamadas de `Edit`/`Write`/`Bash`/tools MCP param num painel de aprovação, com diff unificado ou lado a lado. Dá para aprovar, aprovar todas da sessão, pedir ajuste (o comentário volta ao Claude) ou rejeitar. Cada alteração aplicada pode ser revertida por patch reverso. |
| **Painel MCP** | Servidores stdio, HTTP ou SSE. Ligue e desligue, teste a conexão, defina a política auto/pedir por tool e importe do Claude Desktop ou do Claude Code. |
| **Custos** | Por turno, sessão, dia, mês e modelo, incluindo tokens de cache. Teto diário e por sessão, além de medidor de contexto. |
| **Perfil** | Métricas de GitHub, GitLab (cloud ou self-hosted) e Bitbucket Cloud via token pessoal de leitura: commits, PRs, reviews, sequência, heatmap de 26 semanas, linguagens e repositórios mais ativos. |
| **Conquistas** | 31 conquistas em IA, Git, Foco, Agenda e Comunidade, com XP, níveis e até 3 destaques. |
| **Agenda** | Eventos locais recorrentes (com atalho de daily), lembretes com botão Entrar e assinatura ICS somente leitura (Outlook/Google). |
| **Comunidade** | Artigos e snippets no Supabase, com curtidas, comentários e denúncias. O acesso é controlado por row-level security. |
| **Flow** | Embed do Spotify e timer de foco 25/5. |

## Como rodar

```powershell
npm install
npm run dev
```

Se o Electron reclamar de binário ausente, rode `node node_modules/electron/install.js`.

- **Claude:** em *Config → Autenticação*, cole uma chave da API Anthropic. Ela fica criptografada no cofre do sistema via `safeStorage`.
- **Comunidade (opcional):** crie um projeto no Supabase e rode [`supabase/migrations/0001_community.sql`](supabase/migrations/0001_community.sql). Inclua `{{ .Token }}` no template de e-mail Magic Link e copie `.env.example` para `.env`. Use só a chave publishable/anon, nunca a `service_role`.
- **Provedores git:** em *Perfil → Conexões*, cole um token de leitura para cada provedor que você usa.

Outros scripts: `npm run typecheck`, `npm run build`, `npm start`.

## Como trabalhamos

O DevDeck é construído por um **squad** (PO, Tech Lead, UX, Frontend, Backend, QA, Cybersecurity, DevOps). Cada papel é um subagente do Claude Code em [`.claude/agents/`](.claude/agents/). O trabalho acontece em sprints:

- Processo e formato do debate: [`docs/squad.md`](docs/squad.md)
- Sprints: [`docs/sprints/`](docs/sprints/)
- Decisões de arquitetura: [`docs/decisions.md`](docs/decisions.md)
- Notas de versão: [`CHANGELOG.md`](CHANGELOG.md)

## Estrutura

```
src/
  shared/      contratos IPC, catálogo de conquistas
  main/        main do Electron: agente, MCP, provedores, perfil, conquistas, agenda, store
  preload/     ponte window.deck (contextBridge)
  renderer/    interface React
supabase/      schema da comunidade + RLS
docs/          squad, sprints, ADRs
```

Os dados locais ficam em `%APPDATA%/DevDeck`.
