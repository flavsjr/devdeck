# Decisões de arquitetura (ADR)

Formato curto: contexto → decisão → consequências. Novas decisões entram no fim, numeradas.

## ADR-001 — Electron + React + TypeScript
- **Contexto:** precisa de acesso a arquivos, processos (MCP stdio, agente) e git locais, com UI rica.
- **Decisão:** Electron 45 + electron-vite + React 19 + TS. Main/preload em CommonJS; SDK ESM-only carregado por `import()` dinâmico.
- **Consequências:** app pesado (~100 MB), mas ecossistema Node completo. Empacotamento exige desempacotar binários nativos.

## ADR-002 — Claude Agent SDK como motor do chat
- **Contexto:** queremos o loop do Claude Code (tools Read/Edit/Bash, MCP, sessões) sem reimplementar.
- **Decisão:** `@anthropic-ai/claude-agent-sdk` em modo streaming-input, uma `query()` por chat; `canUseTool` vira a aprovação de diff.
- **Consequências:** custo e uso vêm prontos (`modelUsage`, `total_cost_usd`); dependemos do contrato do SDK.

## ADR-003 — Persistência local em JSON
- **Decisão:** arquivos em `%APPDATA%/DevDeck` (settings, sessões, ledger JSONL, agenda, conquistas); segredos via `safeStorage`.
- **Consequências:** zero infraestrutura; sem sync entre máquinas.

## ADR-004 — Aprovação antes de aplicar + rollback por patch reverso
- **Decisão:** simular `Edit`/`Write` para mostrar o diff; após aplicar, guardar patch unificado e permitir reversão com `reversePatch`.
- **Consequências:** reversão falha (com aviso) se o arquivo mudou depois.

## ADR-005 — Tokens pessoais para GitHub/GitLab/Bitbucket
- **Decisão:** PAT/API token de leitura por provedor, criptografado; requisições pelo main com `net.fetch`.
- **Alternativa rejeitada:** OAuth (exige registrar apps e guardar client secrets).
- **Consequências:** configuração manual pelo usuário; métricas do Bitbucket são aproximadas (amostra de repositórios recentes).

## ADR-006 — Comunidade em Supabase com RLS
- **Decisão:** Postgres do Supabase acessado do renderer com chave publishable; toda regra de acesso em RLS + grants por coluna + triggers `SECURITY DEFINER`.
- **Consequências:** sem servidor próprio; segurança depende da migration — qualquer tabela nova exige RLS e revisão do agente `cybersecurity`.

## ADR-007 — Agenda local + ICS somente leitura
- **Decisão:** eventos locais com recorrência simples; calendários externos via link ICS (`ical.js`), sync a cada 30 min; lembretes no main.
- **Alternativa adiada:** Microsoft Graph (registro no Azure AD).
- **Consequências:** não cria eventos no Outlook; link ICS é tratado como segredo.

## ADR-008 — Squad, sprints e changelog
- **Decisão:** processo com papéis (PO, Tech Lead, UX, Front, Back, QA, Cybersecurity, DevOps) como subagentes em `.claude/agents/`, uma sprint por arquivo em `docs/sprints/`, `CHANGELOG.md` no formato Keep a Changelog e SemVer.
- **Consequências:** toda entrega deixa rastro de decisão, teste e segurança.
