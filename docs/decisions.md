# Decisões de arquitetura (ADR)

Formato curto: contexto → decisão → consequências. Novas decisões entram no fim, numeradas.

## Índice
Leia só o ADR que precisa: `grep -n "^## ADR-018" docs/decisions.md` e leia a partir da linha. ADR novo ou emenda acrescenta/atualiza a linha aqui.

- ADR-001 — Electron + React + TypeScript
- ADR-002 — Claude Agent SDK como motor do chat
- ADR-003 — Persistência local em JSON
- ADR-004 — Aprovação antes de aplicar + rollback por patch reverso
- ADR-005 — Tokens pessoais para GitHub/GitLab/Bitbucket
- ADR-006 — Comunidade em Supabase com RLS
- ADR-007 — Agenda local + ICS somente leitura
- ADR-008 — Squad, sprints e changelog
- ADR-009 — Testes com Vitest em lógica pura isolada
- ADR-010 — CI no GitHub Actions
- ADR-011 — Instalador NSIS per-user
- ADR-012 — Fronteira do IPC: origem + zod
- ADR-013 — Confiança explícita em configurações de projeto
- ADR-014 — Sistema de estilos: tokens em camadas (emendas H06.1: tema claro; H06.5: camada views e migração)
- ADR-015 — Segredos de configuração cifrados e mascarados
- ADR-016 — Atalhos no renderer, menu nulo em produção
- ADR-017 — Dependências de UI
- ADR-018 — Git sem executar código do repositório antes da confiança (emendas v0.6.1: submódulos; H07.3: bloqueio, hooks, tempo limite)
- ADR-019 — Release em rascunho com checksum e procedência (emenda TR1: notas do CHANGELOG e pre-release)
- ADR-020 — Tema claro via nativeTheme e regra pura compartilhada
- ADR-021 — Feedback ao usuário: notificações tipadas e erros do agente classificados (emenda H07.4: ação abrirSessao)
- ADR-022 — Comando do agente sempre passa pelo card de aprovação (emenda H06.10: lista branca de tools)

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
- **Status:** decidido na Sprint 05 (H05.2).
- **Contexto:** o app só rodava pelo código-fonte; o Claude Agent SDK traz o Claude Code como executável nativo (~370 MB) que não roda de dentro do asar.
- **Decisão:** `electron-builder` 26.18.0 (versão exata) com `electron-builder.yml`: NSIS per-user (`perMachine: false`, `allowElevation: false`, sem UAC), `appId com.devdeck.app`, ícone gerado do SVG pelo próprio Electron (`scripts/make-icon.mjs`, `.ico` commitado), `deleteAppDataOnUninstall: false`, `publish: null` (sem auto-update). Fuses pelo `electronFuses` do builder: RunAsNode, NODE_OPTIONS, `--inspect` e GrantFileProtocolExtraPrivileges desligadas; integridade do asar, OnlyLoadAppFromAsar e cookies cifrados ligados — conferidas no `.exe` por `scripts/verify-fuses.mjs`. SDK em versão exata, `claude-agent-sdk-win32-x64` em `asarUnpack` e chamado por `pathToClaudeCodeExecutable` (caminho absoluto); `afterPack` confere o SHA-256 do `claude.exe` e do `sdk.mjs` contra `scripts/sdk-hashes.json` (divergente → build falha). Com GrantFileProtocolExtraPrivileges desligada, `file://` não lê o asar: a UI empacotada é servida por `app://devdeck` (`protocol.handle`, só a pasta do renderer, caminho conferido por `resolveAppAsset`). No empacotado, `--remote-debugging-*`, `--inspect*` e `--js-flags` encerram o app; hooks de dev (`DEVDECK_*`) dependem de `!app.isPackaged`.
- **Consequências:** instalador ~238 MB, instalado ~757 MB. Sem assinatura de código: SmartScreen avisa (README ensina conferir hash e attestation). `app.asar.unpacked` fica fora da integridade do asar e o hash só é conferido no build (risco aceito: quem grava na pasta per-user também troca o `DevDeck.exe`). Atualizar SDK = atualizar `sdk-hashes.json` no mesmo PR.

## ADR-012 — Fronteira do IPC: origem + zod
- **Contexto:** handlers aceitavam qualquer chamador e qualquer argumento; ids viravam caminhos de arquivo.
- **Decisão:** todo handler é registrado por `handle()` (`src/main/ipc.ts`), que exige o frame principal da UI do app (`isAppUrl`) e valida a tupla de argumentos com `zod` (`src/main/lib/validation.ts`). Ids são UUID; o store recusa id não-UUID antes de montar caminho. Navegação, janelas novas, webview e permissões do Chromium são negadas por padrão.
- **Consequências:** novo canal IPC exige esquema; chamada fora do padrão falha com erro legível em vez de executar.

## ADR-013 — Confiança explícita em configurações de projeto
- **Contexto:** `.claude/settings.json` e `.mcp.json` de um repositório executam comandos (hooks, permissões, MCP) sem passar pela aprovação do DevDeck.
- **Decisão:** carregar configurações do projeto vem desligado; quando ligado e houver itens que executam código, um diálogo lista o que roda e só carrega após confiança explícita, registrada por realpath + hash dos arquivos (mudou, pergunta de novo). "Aprovar todas da sessão" fica confinado ao workspace (realpath) e fora de pastas sensíveis.
- **Consequências:** abrir repositório de terceiros não executa nada sozinho; o usuário vê um diálogo extra na primeira vez.
- **Emenda (Sprint 05, H05.5):** `settings.json` passa por lista de permitidas: chave de topo desconhecida, ou dentro de `permissions` fora de `deny`/`ask`, pede confiança ("Chaves não reconhecidas"). "Sempre nesta sessão" de qualquer tool só vale se todos os caminhos dela (`lib/toolpath`: `file_path`, `notebook_path`, `path`, `*_path`) ficam dentro do workspace (realpath); fora ou em pasta sensível o card mostra o selo, esconde o botão e o main recusa mesmo se pedido. Prévia de diff parcial desabilita "Aprovar todas da sessão".

## ADR-014 — Sistema de estilos: tokens em camadas
- **Contexto:** a paleta (terracota `#d97757` e creme) era a da marca Claude; cores literais espalhadas por ~1.700 linhas de CSS e em componentes.
- **Decisão:** CSS puro com `@layer tokens, legacy, base, shell`. `styles/tokens.css` é o único arquivo com cor literal, em duas camadas (primitivos → semânticos), identidade "Índigo Noturno". O CSS antigo foi migrado para tokens e envolvido em `@layer legacy`; regras novas vencem pela ordem da camada, sem `!important`. Testes: guarda de cor literal e da paleta antiga, contraste WCAG AA dos pares usados (`lib/contrast`). Sem Tailwind nem CSS-in-JS.
- **Consequências:** trocar de tema = trocar semânticos (tema claro na Sprint 06). Regra de `shell` que sobrescreve um seletor do legado precisa redeclarar as variantes (ex.: `.btn.primary`).
- **Emenda (H06.5, 2026-11-25): camada `views` e migração do legado.** Ordem `tokens, legacy, base, shell, views`. `views.css` (perfil, conquistas, agenda) é a última camada: vence o shell, então só reusa classe do shell com escopo da aba (lista `VIEWS_SHELL_SHARED` no `css-layers.test`, só encolhe) e não usa `!important`. Componentes migrados ficam em `components.css` (`@layer shell`, importado antes do `shell.css`). O legado (app.css + community.css) tem catraca de linhas no teste. Mover CSS de camada exige o diff de estilo computado zerado (`tests/e2e/style-snapshot.mjs`, base do commit anterior): a especificidade só vale dentro da camada, então regra que vencia por especificidade no legado pode passar a perder ou ganhar.
- **Emenda (H06.1, 2026-11-25): tema claro.** O claro é um bloco `@media (prefers-color-scheme: light) { :root { … } }` no próprio `tokens.css`, que redefine só semânticos sobre primitivos novos (`--paper-*`, `--ink-*`, `--indigo-8/11`…). `themeTokens()` (`renderer/src/lib/contrast.ts`) separa os dois temas e o `contrast.test` roda todos os pares AA em cada um; outro teste exige que todo semântico do escuro exista no claro. No claro o accent é escuro e `--on-accent` é branco (invertido do escuro). Estilo novo vai no `shell` com nome de classe próprio (o `css-layers.test` barra reuso de classe do legado); regra do legado que muda com o tema sai do legado (ex.: `.thinking`). Em E2E com Playwright, `electron.launch` precisa de `colorScheme: null`: o padrão emula `light` e esconde a troca feita pelo `nativeTheme`.

## ADR-015 — Segredos de configuração cifrados e mascarados
- **Contexto:** env/headers de MCP e o link ICS ficavam em texto puro no disco e voltavam inteiros ao renderer.
- **Decisão:** cifrados com `safeStorage` (`basic_text` no Linux conta como indisponível); sem cofre, o salvamento é recusado. O renderer recebe só máscara; para manter um valor, manda `null`, aceito só com o mesmo transporte, URL, comando e argumentos e sem variável de ambiente sensível nova (`NODE_OPTIONS`, `*_PROXY`…). Migração no boot, inclusive da cópia legada; gravação atômica. Lógica pura em `src/main/lib/secrets.ts`.
- **Consequências:** voltar para a v0.3.0 deixa esses segredos ilegíveis. Apagar texto puro em SSD não é garantido: o CHANGELOG recomenda trocar os tokens.
- **Emenda (Sprint 05):** env/headers de MCP vão ao Claude Code pelo stdin (`mcpServersDelivery: 'initialize'`), não pela linha de comando legível por outros usuários da máquina. URL de MCP com credencial na query ou `usuário:senha` é recusada ("use header"); a query entra no `redact`.

## ADR-016 — Atalhos no renderer, menu nulo em produção
- **Decisão:** uma tabela (`lib/shortcuts.ts`) alimenta o listener global, a paleta e a ajuda. Atalhos com Ctrl não disparam em campo editável (exceto paleta e ajuda), nem com IME ou AltGr. Nenhum atalho global aprova: Alt+A/Alt+R só valem com foco no cartão, sem repetição e 600 ms após ele aparecer. `Menu.setApplicationMenu(null)` fora de dev (Alt não abre menu, Ctrl+R não recarrega).
- **Consequências:** sem DevTools por atalho no app empacotado.

## ADR-017 — Dependências de UI
- **Decisão:** `lucide-react` (ícones) e `@fontsource-variable/inter` / `jetbrains-mono` (fontes locais, `font-src 'self'`, nunca `data:`) entram com versão exata, publicadas há mais de 7 dias, sem scripts de instalação. `axe-core` só em dev (`DEVDECK_AXE`). `cmdk` rejeitado: puxaria vários pacotes Radix e um fuzzy próprio; a paleta é nossa (`lib/fuzzy` testada) e reaproveita o `Modal` com focus-trap.
- **Consequências:** +~300 KB de fontes no pacote (só o subset latino carrega).
- **Emenda (Sprint 05):** `playwright-core` 1.65.1 (devDependency exata, sem dependências nem scripts de instalação, sem baixar navegadores) para E2E no Electron (`npm run test:e2e`, `tests/e2e/`). Diálogos nativos são respondidos pelo teste interceptando `dialog.showMessageBox` no main; o app roda com `--user-data-dir` descartável.

## ADR-018 — Git sem executar código do repositório antes da confiança
- **Contexto (B3):** `git status`/`diff`/`restore` executam o que o `.git/config` do repositório manda (fsmonitor, filtros clean/smudge/process, textconv, `diff.external`, hooks). Repositório recebido pronto (zip, pasta copiada) executaria código só por ser aberto. O simple-git chamava `git` sem caminho absoluto com cwd no workspace (no Windows, um `git.exe` plantado na raiz rodaria), e o próprio Claude Code roda `git status` no cwd ao abrir a sessão.
- **Decisão:** wrapper próprio (`gitcore.ts`, `lib/gitproc.ts`) no lugar do simple-git: git por caminho absoluto (PATH só com entradas absolutas fora do workspace), `execFile` sem shell, env por lista de permitidas (nenhum `GIT_*` herdado) com `GIT_DIR`/`GIT_WORK_TREE`/`GIT_CEILING_DIRECTORIES` explícitos, e prefixo fixo em toda chamada, mesmo confiada: `--no-pager --no-optional-locks -c core.fsmonitor=false -c core.hooksPath=<pasta vazia do app> -c protocol.allow=never`. Conteúdo do HEAD por `cat-file blob` (sem textconv nem filtro). O `.git/config` é lido por `git config --file … --list -z --no-includes` com cwd fora do workspace e config global/sistema vazia (sem parser próprio: divergência viraria bypass); a estrutura do `.git` (arquivo `gitdir:`, link/junction, `commondir`, `worktrees/`, `config.worktree`) por `lstat`. Chave fora da lista de permitidas (`lib/gitconfig.ts`) ou estrutura não conferível → git pausado até confiança explícita, num diálogo nativo único com o do `.claude/`; hash de `.git/config` + `info/attributes`, gate reavaliado (por lstat) antes de cada chamada. Sem confiança, o SDK recebe `GIT_DIR` inexistente e teto no pai do workspace.
- **Consequências:** repositório com LFS ou filtros pede confiança uma vez. Config global/sistema do próprio usuário (ex.: LFS global acionado por `.gitattributes` do repo) é risco aceito baixo. Sem confiança, o git do agente também fica indisponível (estado "Git pausado" na UI). Teste de integração com git real e controle positivo (`tests/integration/git-exec.test.ts`).
- **Emenda (hotfix v0.6.1, debate da Sprint 07):** `submodule.<nome>.ignore` (do `.gitmodules`, que é arquivo da árvore, ou do `.git/config`) vence o `diff.ignoreSubmodules=all` forçado por env: com `ignore=none`, o `git status`/`diff` do agente e do próprio SDK entra no submódulo e roda o filtro da config dele (`.git/modules/<nome>/config`), que o gate nunca mostrou. Confirmado com git 2.50; repositório recebido em zip executava código sem clique nas v0.5.0 e v0.6.0. Decisão: o gate também lê o `.gitmodules` (mesmo `git config --file … --no-includes`, lstat e hash; ausente não muda o hash, então confiança já gravada continua valendo). Sem o arquivo na árvore, o git usa o do index e depois o do HEAD (achado do security review do hotfix): o gate resolve `:.gitmodules`/`HEAD:.gitmodules` por `rev-parse --verify --quiet` e lê o blob por `git config --blob <oid> --no-includes` (cwd fora do workspace, `--git-dir` explícito, fsmonitor desligado, `safe.directory=*` só nesse comando de leitura); erro que não seja "não existe" pausa. `index` e `HEAD` entram na assinatura do gate e pausa se `ignore` ≠ `all`, se o arquivo não for comum ou ilegível, ou com mais de 200 submódulos; o `agentEnv` recebe `submodule.<nome>.ignore=all` para cada nome visto no `.gitmodules` e em `submodule.*` do pai (env tem precedência sobre arquivo). `submodule.active=false` não resolve (testado). Repositório embutido sem `.gitmodules` e `.git` como arquivo `gitdir:` não entram (teste com controle positivo). Risco aceito baixo: submódulo novo criado no meio da sessão só ganha `ignore=all` na próxima sessão do agente (a edição do `.gitmodules` pelo agente passa pelo card; o gate do DevDeck pausa na hora se ela trouxer `ignore` ≠ `all`).
- **Emenda (H07.3, Sprint 07): bloqueio, hooks e tempo limite.** (1) `core.worktree` que não resolve para a raiz e `include.path`/`includeIf.<cond>.path` que resolvem fora do `.git` (para o workspace, que o agente edita durante a sessão, ou para fora do repositório) deixam o git **bloqueado**: `GitRiskSummary.blocked`, `gitAllowedBy` recusa qualquer confiança, o diálogo de abertura não pergunta e "Revisar configurações…" só explica. Resolução como o git faz (relativo ao `.git`, `~` na home) + realpath do prefixo existente; classificação pura em `lib/gitconfig.ts` (`classifyGitPath`). `core.worktree` na própria raiz continua só pedindo confiança. (2) Tudo em `.git/hooks` menos `*.sample` pausa: o DevDeck roda com `core.hooksPath` vazio, mas o git do agente usa os hooks do repositório. O conteúdo entra no hash só quando há hook (repositório sem hook mantém a confiança gravada) e cada hook entra na assinatura. (3) Timeout da inspeção injetável; processo morto pelo tempo vira motivo explícito, confiança só nesta execução e resultado fora do cache. (4) `GIT_NO_LAZY_FETCH=1` também no env do agente; custo aceito: `git log -p`/`blame` podem falhar em partial clone (D4). Security review: valor que o DevDeck não resolve como o git (`%(prefix)/`, `~usuario/`, `:(optional)`, `C:x`) e link pendente no caminho contam como fora; `core.worktree` precisa dar na raiz pelo texto **e** pelo realpath (link dentro do `.git` poderia ser trocado depois); hook link/pasta/> 1 MiB vale só nesta execução; inspeção incompleta não aceita confiança.

## ADR-019 — Release em rascunho com checksum e procedência
- **Decisão:** `release.yml` só por tag `v*.*.*` (e `workflow_dispatch` como dry run sem release), `permissions: {}` no topo. Job `build` (Windows, só leitura, sem cache) confere tag = versão (`scripts/check-tag.mts`), roda `npm ci`, typecheck, testes e `dist:win` (afterPack + verify-fuses) e sobe o instalador como artefato. Job `release` (Ubuntu, sem npm) é o único com `contents: write`, `id-token: write` e `attestations: write`: gera `SHA256SUMS.txt`, emite a attestation de build (`actions/attest-build-provenance` fixada por SHA) e cria o release **rascunho** com `gh release create --draft --verify-tag`. Publicar é manual, depois de conferir hash, attestation e VirusTotal. O CI ganha um job `package` (fora de PR) com `pack:win` para pegar quebra de empacotamento antes da tag.
- **Consequências:** nenhum código de terceiros roda com token de escrita. Sem assinatura de código; procedência por `gh attestation verify`. Tag só com aprovação explícita do usuário (dispara o workflow).
- **Emenda (TR1, Sprint 07): notas e pre-release no CI.** O job `release` roda `scripts/release-notes.mts` (sem dependências, no sparse-checkout com o `CHANGELOG.md`) antes de baixar e atestar o instalador: extrai a seção `## [X.Y.Z]` da tag para `out/NOTES.md` e o `gh release create` usa `--notes-file` (nada do CHANGELOG passa pelo shell). Sem a seção, ou com ela vazia, o job falha e não há rascunho. `--prerelease` quando a tag é `v0.*` ou tem sufixo, pela saída `prerelease` do script. Publicar continua manual, com aprovação.

## ADR-020 — Tema claro via nativeTheme e regra pura compartilhada
- **Status:** decidido na Sprint 06 (H06.1, H06.2).
- **Contexto:** o app só tinha tema escuro. O ADR-014 previu trocar semânticos. Era preciso trocar sem recarregar, acompanhar o Windows, abrir sem piscar e manter os diálogos nativos no tema. Regras puras usadas pelos dois processos (`errorText`, `deveNotificarNativo`) não tinham lugar, porque `lib/` é por processo.
- **Decisão:** `theme: 'system' | 'dark' | 'light'` no settings (`z.enum` no `settingsPatch`). Valor inválido no disco vira `system`; settings existente sem `theme` vira `dark` e instalação nova vira `system` (`src/main/lib/theme.ts`). O main aplica `nativeTheme.themeSource` antes de criar a janela e a cada troca. O `backgroundColor` vem de um mapa fixo no main (`THEME_BG`), nunca do renderer, escolhido por `shouldUseDarkColors` e atualizado em `nativeTheme.on('updated')`; um teste confere que o mapa é igual ao `--bg` de cada tema. O `tokens.css` redefine os semânticos em `@media (prefers-color-scheme: light)` dentro de `@layer tokens`. O Chromium deriva a media query do `themeSource`, então o renderer não precisa de IPC nem de listener ("Sistema (agora: X)" e o embed usam `matchMedia`). `src/shared/lib/` guarda regra pura usada pelo main e pelo renderer, sem `electron`, `fs`, `store`, `events`, `window` ou `document` (garantido pelo `guard.test.ts`), com testes em `tests/unit/shared/`.
- **Alternativas rejeitadas:** `data-theme` no `<html>` sincronizado por IPC (dois estados, flash até a primeira pintura, diálogos fora do tema); `light-dark()` por token (complica o parse do `contrast.test` e mistura os temas na mesma linha); regra duplicada em cada `lib/` (dois textos para o mesmo código).
- **Consequências:** o tema efetivo tem uma fonte só, o main. Semântico novo sem valor nos dois temas quebra o `contrast.test`. Citar `src/shared/lib/` no `CLAUDE.md` depende do usuário.

## ADR-021 — Feedback ao usuário: notificações tipadas e erros do agente classificados
- **Status:** decidido na Sprint 06 (H06.2, H06.3, H06.7).
- **Contexto:** `notify(string)` sumia em 5 s sem tipo, mostrava "Error invoking remote method…" cru, a sessão expirada aparecia em inglês e até três vezes por turno, e a mensagem do SDK podia levar token para o IPC, o console e o disco.
- **Decisão:**
  - `notify({ tipo, texto, acao? })` com 5 tipos e reducer puro (`renderer/src/lib/notifications.ts`, `now` injetado). Teto de 3; erro conta no teto e só sai por ação do usuário; "+N erros"; dedupe em 5 s. Erro em `role="alert"`, os demais numa região `status` polite montada no boot, e nunca move o foco.
  - Ação é uma união fechada: `navegar` ou `repetir` com `RetryOp` nomeada, sem callback livre. Um teste garante que nenhuma `RetryOp` aprova, liga "Sempre" ou executa comando.
  - Notificação nativa só sem foco (`deveNotificarNativo`) e só para aprovação, lembrete e conquista. O evento de lembrete leva só id e título.
  - `src/shared/lib/errorText` é o dicionário único: o main traduz fs e rede no handler com contexto; o renderer traduz o Supabase e tira o prefixo do IPC.
  - `src/main/lib/agentErrors` classifica pelo `SDKAssistantMessage.error`. `authentication_failed` é desempatado por `hasApiKey`/`apiKeySource` + `api_error_status`, com texto só como fallback e desconhecido virando `unknown`. O item `error` ganha `code` e `detail` (redigido no main) e o renderer mostra texto fixo por `code`. Mensagem sintética com `error` não vira balão: um card por turno, sem toast duplicado.
  - "Como entrar de novo" vai por canal com chave de lista fechada para uma URL fixa no main. "Tentar de novo" só por clique.
- **Alternativas rejeitadas:** classificar só por texto (quebra a cada atualização do SDK); callback livre na ação (não testável e poderia aprovar); emissor nativo único por IPC (superfície nova sem ganho); biblioteca de toast (dependência nova sem erro persistente pronto); mostrar a mensagem original (vazamento).
- **Consequências:** o typecheck impede voltar ao `notify(string)`. As fixtures do SDK viram contrato: atualizar o SDK obriga a regravá-las no mesmo PR do `sdk-hashes.json` (ADR-011).
- **Emenda H07.4 (Sprint 07, D7):** a união da ação ganha `abrirSessao { sessionId, itemId? }`, usada só no aviso de erro de sessão que não é a ativa ("Ver no chat"). `navegar` continua só com a aba. Antes de navegar, `destinoAbrirSessao` (pura) recusa `sessionId` que não é UUID (`isUuid`, `src/shared/lib/ids.ts`) e sessão fora da lista (o store consulta o main de novo antes de recusar), com aviso e sem trocar de sessão; `itemId` inválido só perde o alvo. O id nunca vira caminho no renderer: vai para `agent.load` (zod no main) e, no scroll, para um seletor com `CSS.escape`. Item que sumiu: a lista fica no fim. Erro da sessão ativa segue com `navegar: chat`. (A ata da Sprint 07 citava o ADR-014; a ação de notificação é deste ADR.)

## ADR-022 — Comando do agente sempre passa pelo card de aprovação
- **Contexto:** no roteiro manual da v0.5.0 (2026-11-25), o `git status` pedido ao agente rodou sem card. Com `permissionMode: 'default'`, o Claude Code (SDK 0.3.330) libera sozinho o Bash que considera só-leitura e não chama o `canUseTool`; reproduzido no SDK puro (0 chamadas). Num workspace confiado, `git status` dentro de um repositório embutido roda o filtro dele sem o usuário ver, e a mitigação "Bash sempre pede aprovação" (H05.5) não valia para esses comandos. O mesmo roteiro mostrou que a CLI não roda `git status` sozinha ao abrir a sessão nessa versão (ADR-018 supunha que sim; o env restrito continua valendo para o git que o agente rodar).
- **Decisão:** hook `PreToolUse` no `query()` (`src/main/lib/agentPolicy.ts`, antes `askHook.ts`) com matcher `Bash|PowerShell` respondendo `permissionDecision: 'ask'`, o que devolve a decisão ao `canUseTool`; `onFailure: 'block'` (se o hook falhar, o comando é bloqueado). PowerShell usa o mesmo card de comando do Bash e, como ele, nunca recebe "Sempre nesta sessão". `Monitor` (comando de shell em segundo plano, com o mesmo avaliador do Bash, apontado pela Cybersecurity) sai da sessão por `disallowedTools`. Read, Glob e Grep continuam sem card. Regra `deny` de permissão vence o `ask` do hook; regra `allow` não vence (o `ask` chega ao `canUseTool`).
- **Consequências:** um card a mais para comandos inofensivos (`ls`, `pwd`); sem Monitor no chat. Validado no SDK puro (com hook, `canUseTool` chamado) e no app (card "Executar comando" para `git status` por Bash e PowerShell; rejeitar → o filtro do repositório não roda). Atualização do SDK exige repetir a validação (nome de tool novo que execute comando entra na lista). Sprint 06: trocar a lista negra por lista branca (`tools`) conferida no `system/init` e teste de integração contando chamadas do `canUseTool`.
- **Emenda (H06.10, 2026-11-25): lista branca de tools.** O SDK 0.3.330 oferecia 31 tools ao agente (RemoteTrigger, PublishPlugin, CronCreate, Workflow…) e, com login do claude.ai, os conectores da conta (`mcp__claude_ai_*`). Agora o `query()` recebe `agentToolOptions()`: `tools` = Read, Glob, Grep, Edit, Write, NotebookEdit, Bash, PowerShell, WebSearch, Task (subagente herda a lista); `settings.disableClaudeAiConnectors: true` (flag vence `false` do projeto); `Monitor` segue em `disallowedTools`. Trava em runtime (Cybersecurity): o hook `PreToolUse` passa a valer para toda tool, sem matcher, com `onFailure: 'block'`, e responde `deny` para tool fora da lista (Task e Agent contam como a mesma) e para `mcp__*` cuja `mcp_server.source` não seja `dynamic` (servidores do DevDeck) ou `project` (`.mcp.json` confiado, ADR-013). Sem `strictMcpConfig` para não quebrar o ADR-013. Fica de fora: `AskUserQuestion` (o DevDeck não tem UI para responder; Sprint 07). Provas: unit da política e das opções, integração com o SDK real lendo `system/init` sem login (roda no CI) e teste live opt-in (`DEVDECK_SDK_LIVE=1`) com agente de projeto declarando `tools: Monitor`.
