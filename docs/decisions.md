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

## ADR-014 — Sistema de estilos: tokens em camadas
- **Contexto:** a paleta (terracota `#d97757` e creme) era a da marca Claude; cores literais espalhadas por ~1.700 linhas de CSS e em componentes.
- **Decisão:** CSS puro com `@layer tokens, legacy, base, shell`. `styles/tokens.css` é o único arquivo com cor literal, em duas camadas (primitivos → semânticos), identidade "Índigo Noturno". O CSS antigo foi migrado para tokens e envolvido em `@layer legacy`; regras novas vencem pela ordem da camada, sem `!important`. Testes: guarda de cor literal e da paleta antiga, contraste WCAG AA dos pares usados (`lib/contrast`). Sem Tailwind nem CSS-in-JS.
- **Consequências:** trocar de tema = trocar semânticos (tema claro na Sprint 05). Regra de `shell` que sobrescreve um seletor do legado precisa redeclarar as variantes (ex.: `.btn.primary`).

## ADR-015 — Segredos de configuração cifrados e mascarados
- **Contexto:** env/headers de MCP e o link ICS ficavam em texto puro no disco e voltavam inteiros ao renderer.
- **Decisão:** cifrados com `safeStorage` (`basic_text` no Linux conta como indisponível); sem cofre, o salvamento é recusado. O renderer recebe só máscara; para manter um valor, manda `null`, aceito só com o mesmo transporte, URL, comando e argumentos e sem variável de ambiente sensível nova (`NODE_OPTIONS`, `*_PROXY`…). Migração no boot, inclusive da cópia legada; gravação atômica. Lógica pura em `src/main/lib/secrets.ts`.
- **Consequências:** voltar para a v0.3.0 deixa esses segredos ilegíveis. Apagar texto puro em SSD não é garantido: o CHANGELOG recomenda trocar os tokens.

## ADR-016 — Atalhos no renderer, menu nulo em produção
- **Decisão:** uma tabela (`lib/shortcuts.ts`) alimenta o listener global, a paleta e a ajuda. Atalhos com Ctrl não disparam em campo editável (exceto paleta e ajuda), nem com IME ou AltGr. Nenhum atalho global aprova: Alt+A/Alt+R só valem com foco no cartão, sem repetição e 600 ms após ele aparecer. `Menu.setApplicationMenu(null)` fora de dev (Alt não abre menu, Ctrl+R não recarrega).
- **Consequências:** sem DevTools por atalho no app empacotado.

## ADR-017 — Dependências de UI
- **Decisão:** `lucide-react` (ícones) e `@fontsource-variable/inter` / `jetbrains-mono` (fontes locais, `font-src 'self'`, nunca `data:`) entram com versão exata, publicadas há mais de 7 dias, sem scripts de instalação. `axe-core` só em dev (`DEVDECK_AXE`). `cmdk` rejeitado: puxaria vários pacotes Radix e um fuzzy próprio; a paleta é nossa (`lib/fuzzy` testada) e reaproveita o `Modal` com focus-trap.
- **Consequências:** +~300 KB de fontes no pacote (só o subset latino carrega).
