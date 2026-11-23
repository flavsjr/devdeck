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

## ADR-009 — Testes com Vitest em lógica pura isolada
- **Contexto:** nenhuma regra de negócio era testável: tudo importava `electron`, disco ou o store.
- **Decisão:** lógica pura em `src/main/lib/` e `src/renderer/src/lib/` (sem `electron`, `fs`, `store`, `events`, garantido por teste-guarda); Vitest 5 em ambiente `node`, rodando em dois fusos (São Paulo e Nova York) com relógio fixo.
- **Consequências:** testes rápidos e determinísticos sem Electron; código com efeito colateral fica fino em volta da `lib/`. Sem testes de componente (DOM) por enquanto.

## ADR-010 — CI no GitHub Actions
- **Decisão:** workflow `ci.yml` em push (`main`, `sprint/**`), PR e manual: `npm ci → typecheck → test → build` em Windows e Ubuntu, Node 24; job separado com gitleaks. `permissions: contents: read`, actions fixadas por SHA, `persist-credentials: false`, sem `pull_request_target`; Dependabot atualiza as actions.
- **Consequências:** o binário do Electron não é baixado na checagem (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); empacotamento fica num workflow de release separado (Sprint 04).

## ADR-011 — Instalador NSIS per-user
- **Status:** reservado — decidido na Sprint 04 junto com a H03.4 (instalador).

## ADR-012 — Fronteira do IPC: origem + zod
- **Contexto:** handlers aceitavam qualquer chamador e qualquer argumento; ids viravam caminhos de arquivo.
- **Decisão:** todo handler é registrado por `handle()` (`src/main/ipc.ts`), que exige o frame principal da UI do app (`isAppUrl`) e valida a tupla de argumentos com `zod` (`src/main/lib/validation.ts`). Ids são UUID; o store recusa id não-UUID antes de montar caminho. Navegação, janelas novas, webview e permissões do Chromium são negadas por padrão.
- **Consequências:** novo canal IPC exige esquema; chamada fora do padrão falha com erro legível em vez de executar.

## ADR-013 — Confiança explícita em configurações de projeto
- **Contexto:** `.claude/settings.json` e `.mcp.json` de um repositório executam comandos (hooks, permissões, MCP) sem passar pela aprovação do DevDeck.
- **Decisão:** carregar configurações do projeto vem desligado; quando ligado e houver itens que executam código, um diálogo lista o que roda e só carrega após confiança explícita, registrada por realpath + hash dos arquivos (mudou, pergunta de novo). "Aprovar todas da sessão" fica confinado ao workspace (realpath) e fora de pastas sensíveis.
- **Consequências:** abrir repositório de terceiros não executa nada sozinho; o usuário vê um diálogo extra na primeira vez.
