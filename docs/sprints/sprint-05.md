# Sprint 05 — Distribuição segura

**Período:** 2026-11-23 → 2026-12-07 · **Versão alvo:** v0.5.0 · **Status:** pendências fechadas e tag `v0.5.0` criada em 2026-11-25; release em rascunho aguardando o Publish (usuário)

## Objetivo
Distribuir o DevDeck como instalador Windows verificável, sem que abrir um repositório recebido pronto execute código pelo git.

## Convocação (PO)
Primeira sprint com a regra de convocação (`docs/squad.md`): só opina quem trabalha na história ou tem veto sobre o risco dela.

| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| H05.1 git sem execução | Back | TL, Front, UX, Sec, QA | processo externo + confiança + estado novo na UI |
| H05.2 instalador | DevOps | Back, TL, Sec, QA, UX | empacotamento, fuses, SDK nativo, ícone |
| H05.3 release | DevOps | Sec, QA | workflow com token de escrita e attestation |
| H05.4 bugs ICS/diff | Back | Front, QA | parser ICS, prévia de edição, diff no renderer |
| H05.5 confiança estrita | Back | Front, UX, Sec, QA | política de aprovação e diálogo de confiança |
| H05.6 rate limit | Back | Sec, QA | migration Supabase com trigger SECURITY DEFINER |
| H05.7 roteiro manual | QA | Front, UX | evidência no app instalado |
| H05.8 token em query | Back | Sec | segredo de MCP |
| H05.9 varredura de camadas | Front | QA | teste de CSS no CI |

**Não convocados:** nenhum — os sete papéis têm tarefa nesta sprint.

## Histórias (PO)

### H05.1 — Git não executa código do repositório sem confiança (B3) · Must · G
*Como dev que abre um repositório recebido pronto (zip, pasta copiada), quero que o DevDeck não execute nada configurado no repo para que abrir uma pasta seja seguro.*
- [ ] Dado `.git/config` com chave fora da lista de permitidas, quando abro o workspace e uso status, diff ou restore, então **nenhum comando configurado no repo executa**. Teste de integração com git real e marcador por vetor (fsmonitor, filtro clean/smudge/process + `.gitattributes`, textconv, `diff.external`, hooksPath, `post-index-change`, `core.pager`). **Controle positivo obrigatório:** com confiança, o marcador aparece.
- [ ] Lista de permitidas por chave exata, sem diferenciar maiúsculas; `include*`, `core.worktree`, `extensions.worktreeConfig` e `lfs.url` pedem confiança.
- [ ] `.git` como arquivo `gitdir:`, link/junction, `commondir`, `worktrees/` ou `config.worktree` → arriscado, cada caso com teste.
- [ ] `git.exe` falso na raiz do workspace não roda: o DevDeck usa git por caminho absoluto fora do workspace.
- [ ] Toda chamada, mesmo confiada: `--no-optional-locks`, `core.fsmonitor=false`, `core.hooksPath=<pasta vazia do app>`, `protocol.allow=never`, `GIT_TERMINAL_PROMPT=0`, env por lista de permitidas sem `GIT_*` herdado.
- [ ] Hash de confiança cobre `.git/config` e `info/attributes`; gate reavaliado antes de cada chamada; arquivo mudou → diálogo volta.
- [ ] Workspace sem confiança: o SDK do chat recebe env restrito (sem `GIT_*`, `GIT_DIR` inexistente, `GIT_CEILING_DIRECTORIES`); marcador limpo no teste manual (marcador presente = bloqueante).
- [ ] UI com a microcopy do UX: diálogo único "Abrir sem git" / "Confiar e usar git", estado "Git pausado neste workspace", "⏸ git pausado" na status bar; sem erro cru; `git.diff` com `.catch` e sem corrida ao trocar de arquivo.
- [ ] ADR-018.

### H05.2 — Instalador NSIS per-user · Must · G
*Como dev, quero instalar sem admin para usar o DevDeck no dia a dia sem rodar pelo código-fonte.*
- [ ] Spike no primeiro dia: ESM do SDK carrega de dentro do asar.
- [ ] Instala sem UAC em `%LOCALAPPDATA%\Programs`, `com.devdeck.app`, ícone 16–256; atualizar por cima preserva `%APPDATA%\DevDeck` (hash antes/depois); desinstalar não apaga os dados.
- [ ] Chat responde no instalado, com `claude.exe` em `app.asar.unpacked` e `mcpServersDelivery: 'initialize'` (tokens fora da linha de comando).
- [ ] `verify-fuses` lê o `.exe`: off RunAsNode, NODE_OPTIONS, inspect, GrantFileProtocolExtraPrivileges; on integridade do asar, OnlyLoadAppFromAsar, cookies cifrados.
- [ ] `verify-sdk`: hash divergente → build sai ≠ 0. SDK `0.3.330` e electron-builder `26.18.0` exatos.
- [ ] Empacotado: `DEVDECK_SNAPSHOT`/`AXE`/`VIEW` não geram nada (controle em dev); `--remote-debugging-port`/`--inspect*` recusados. Tamanho registrado. ADR-011.

### H05.3 — Release em draft e job de empacotamento · Must · M
*Como quem baixa o instalador, quero conferir hash e procedência para saber que o binário veio do CI.*
- [ ] `scripts/check-tag.mjs` puro com teste: tag ≠ versão do `package.json` falha.
- [ ] Jobs `build` e `release` separados, `permissions: {}` no topo, SHAs fixados, sem cache no release; draft com `SHA256SUMS.txt` e attestation; `actionlint`/`zizmor` limpos; `dry_run` executado (GitHub real só após tag aprovada).
- [ ] Job `package` no CI fora de PR: `--dir` + `verify-fuses` + `verify-sdk`.
- [ ] READMEs EN/PT: SmartScreen, `Get-FileHash`, `gh attestation verify`. ADR-019.

### H05.4 — Bugs de agenda/ICS e diff · Should · M
*Como dev, quero agenda e diff corretos para confiar no que vejo antes de aprovar.*
- [ ] Os 8 `it.todo` viram testes verdes; CI falha com `it.todo` "Sprint 04".
- [ ] Arquivo de 2 MB / 20 mil linhas: diff < 500 ms ou truncado com "Prévia parcial", e "Aprovar todas" desabilitado.

### H05.5 — Confiança e "sempre nesta sessão" estritos · Should · M
*Como dev, quero que chave nova do Claude Code e "sempre nesta sessão" não passem sem controle.*
- [ ] Chave desconhecida em `settings.json` (topo ou dentro de `permissions`, exceto `deny`/`ask`) abre o diálogo com "Chaves não reconhecidas".
- [ ] "Sempre" só dentro do realpath do workspace; NotebookEdit com symlink/`..` e Read em `~/.ssh` perguntam; tool sem extrator de caminho não ganha "Sempre"; card com selo "fora do workspace". Emenda ADR-013.

### H05.6 — Rate limit na migration 0002 · Should · M
*Como moderador da comunidade, quero limitar denúncias e curtidas em massa.*
- [ ] `rate_events` sem grants, trigger SECURITY DEFINER com `search_path = ''` e advisory lock.
- [ ] 121ª curtida em 1 h ou 11ª denúncia em 24 h → banco recusa com mensagem legível; denúncia de conta com < 72 h não conta para ocultar.
- [ ] Evidência pgTAP ou script SQL com `role authenticated`.

### H05.7 — Roteiro manual no app instalado · Should · P
- [ ] ABNT2 (AltGr, teclas mortas, ç); NVDA (nome, papel e estado; "Git pausado" e diálogo nativo lidos); aprovação real com painel recolhido em ~900 px e 1280×720; MCP/ICS reais com `findstr` sem token no disco. Prints em `docs/sprints/sprint-05/manual/`. Linux `basic_text` só se houver máquina.

### Could
- **H05.8** — recusar token na query da URL de MCP ("use header"); URL nunca em log (P).
- **H05.9** — `cssLayers.test.ts` com lista de exceções que só encolhe (P).

### Won't
Tema claro + migração do `@layer legacy` (Sprint 06, juntos) · assinatura de código · auto-update · hash do `claude.exe` em runtime.

**Corte:** sai H05.9 → H05.8 → H05.5. Se H05.1 passar de G, H05.3 vai para a Sprint 06. Não cortáveis: git absoluto, gate e env do SDK, `mcpServersDelivery`, fuses, controle positivo do teste.

## Debate

**Convocados:** PO, TL, UX, Front, Back, QA, Cybersecurity, DevOps. Pareceres em paralelo, depois réplica com 11 conflitos; decisão do PO.

### Tema: como ler `.git/config` sem executar nada
- **TL / Back:** parser INI próprio em node, falha fechada; nenhum processo git antes da confiança.
- **Cybersecurity:** **[bloqueante]** parser próprio diverge do git e vira bypass; usar `git config --file <arq> --list -z --no-includes` com cwd fora do workspace, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` vazio.
- **QA:** "nenhum processo git sobe" só se prova por marcador; reescrever como "nenhum comando configurado no repo executa".
- **Decisão (PO):** `git config --file` com git absoluto, cwd = userData e env limpo; saída `-z` interpretada em `lib/` com teste, inválida = arriscada; estrutura do `.git` checada em node com `lstat`. Bloqueante cai com essa mitigação.

### Tema: simple-git ou wrapper próprio
- **Back:** manter simple-git com `strict`, `unsafe` e `allowConfig`.
- **TL:** simple-git chama `git` sem caminho absoluto com cwd no workspace — no Windows um `git.exe` plantado roda; o plugin bloqueia `-c core.hooksPath`.
- **Decisão (PO):** wrapper `gitrun.ts` (execFile, git absoluto, env por lista de permitidas). Sai uma dependência.

### Tema: conteúdo do HEAD
- **TL / Sec:** `show HEAD:path --no-textconv`. **Back:** `git cat-file blob HEAD:path`.
- **Decisão (PO):** `cat-file blob` — plumbing, sem textconv nem filtro por definição.

### Tema: git rodado pelo SDK do chat
- **Back / TL:** a CLI do SDK roda `git status` no cwd ao abrir sessão; gate antes de `query()`.
- **Cybersecurity:** **[bloqueante]** além do gate, env do SDK sem `GIT_*`, `GIT_DIR` inexistente e `GIT_CEILING_DIRECTORIES` quando o usuário abre sem confiar; o SDK neutraliza fsmonitor e hooks, mas não filtros.
- **Decisão (PO):** aceito na íntegra; avaliar `includeGitInstructions: false`.

### Tema: tokens de MCP na linha de comando (achado do Back)
- **Back:** `mcpServersDelivery` padrão `'argv'` expõe env/headers aos outros processos da máquina.
- **Decisão (PO):** `'initialize'` como critério Must da H05.2, emenda ao ADR-015.

### Tema: fuse GrantFileProtocolExtraPrivileges
- **Cybersecurity:** desligar. **TL:** manter e testar na Sprint 06 (pode quebrar `<script type=module>` em `file://`).
- **Decisão (PO):** desligar, com smoke do `loadFile` como critério; se quebrar, a H05.2 só fecha com mitigação aceita por Cybersecurity.

### Tema: hash do `claude.exe`
- **TL / DevOps:** só no build. **Back:** também antes do spawn (~1 s).
- **Decisão (PO):** só no build — quem grava na pasta per-user troca o `DevDeck.exe` também. Risco aceito.

### Tema: rate limit
- **Cybersecurity:** 120 curtidas/h, 20 denúncias/h, idade mínima da conta. **Back:** 120/h e 10 denúncias/dia.
- **Decisão (PO):** 120 curtidas/h, 10 denúncias/24 h; denúncia de conta com < 72 h é gravada mas não oculta post.

### Tema: diff grande
- **Back:** main corta > 1 MB. **Front:** `buildDiff` com timeout, fallback linear e teto de render; "Prévia parcial" no card.
- **Decisão (PO):** as duas camadas; prévia parcial desabilita "Aprovar todas da sessão" (mesmo risco do B4).

### Decisões rápidas
- Lista de permitidas de chaves do git: a de Cybersecurity (Back e UX de acordo — generosa o bastante para repo comum não disparar o diálogo).
- Diálogo de confiança continua nativo (o renderer não consegue forjar); um diálogo só com seções (UX).
- Job `package` no CI fora de PR entra na H05.3 (DevOps); H05.9 é Could e primeira a sair.
- Config global/sistema do usuário: risco aceito explícito (Sec, QA).
- Ícone gerado do SVG com o próprio Electron, sem dependência nova; `.ico` commitado (DevOps).
- Fuses pelo `electronFuses` nativo do electron-builder; conferência com `@electron/fuses` exato (DevOps).
- Tema claro fora: componentes novos só com tokens; READMEs dizem "tema escuro apenas nesta versão" (UX).

## Tarefas (Tech Lead)
| Tarefa | Papel | Status |
|---|---|---|
| `lib/gitconfig.ts`: interpretar `--list -z`, lista de permitidas, estrutura do `.git` | Back | ✅ `af29aa5` |
| `lib/gitproc.ts` (`parseStatusZ`): parser de `status --porcelain=v1 -z --branch` | Back | ✅ `af29aa5` |
| `gitcore.ts` + `lib/gitproc.ts`: git absoluto, env por lista, prefixo `-c` fixo | Back | ✅ `af29aa5` |
| Gate de confiança do git + IPC `git:trust` + `GitStatus.paused` | Back | ✅ `af29aa5` |
| `git.ts` reescrito, simple-git removido | Back | ✅ `af29aa5` |
| Gate e env restrito no `agent.ts`; `mcpServersDelivery` | Back | ✅ `af29aa5` |
| Teste de integração com git real (marcador + controle positivo) | Back/QA | ✅ `af29aa5` |
| Aba Alterações pausada, status bar, `.catch` e corrida | Front | ✅ `af29aa5` |
| Spike do SDK no asar, `electron-builder.yml`, ícone, `pathToClaudeCodeExecutable`, UI por `app://` | DevOps/Back | ✅ |
| `verify-fuses`, `verify-sdk`, recusa de switches de depuração | DevOps/Back | ✅ |
| `release.yml`, `check-tag.mts`, job `package` | DevOps | ✅ (dry run no GitHub pendente) |
| ICS/edit/diff (`it.todo`) | Back/Front | ✅ |
| Confiança estrita e "sempre" por caminho | Back/Front | ✅ |
| Migration `0002` + teste SQL | Back | ✅ código · ⏳ execução (sem Postgres local: rodar `supabase test db` ou SQL Editor) |
| H05.8 credencial na URL de MCP (Could) | Back | ✅ |
| H05.9 varredura de camadas CSS (Could) | Front | ✅ |
| ADR-011, ADR-018, ADR-019, emendas 013/015 | TL | ✅ `eeb7a1a` |
| Achados do QA e do security review | Back/Front/DevOps | ✅ `a75207f` |

## QA
Execução do agente `qa` no HEAD `eeb7a1a`, depois revalidada em `a75207f`: typecheck, 936 testes (54 arquivos, dois fusos; integração com git real), build, `verify-fuses` (7 fuses), `verify-sdk` (controle negativo: 1 byte a mais → saída 1), `check-tag` (tag certa 0, errada 1).

| Caso | Resultado | Evidência |
|---|---|---|
| H05.1 nenhum comando do repo executa + controle positivo | ✅ | `tests/integration/git-exec.test.ts` (fsmonitor, clean, smudge, textconv, `diff.external`, hooksPath, `post-index-change`, submódulo); git puro cria os marcadores, o DevDeck não |
| Lista de permitidas, maiúsculas, include, worktree, `lfs.url` | ✅ | `tests/unit/main/gitconfig.test.ts` |
| `.git` como gitdir/link/commondir/worktrees/config.worktree | ✅ (link/junction só simulado) | `gitconfig.test.ts`; `gitdir:` real na integração |
| `git.exe` plantado não roda | ✅ DevDeck · ⏳ SDK | integração; SDK no roteiro manual |
| Prefixo `-c`, env por lista, sem `GIT_*`, sem submódulo | ✅ | `tests/unit/main/gitproc.test.ts`; integração "não vazam" e "submódulo" |
| Env restrito do SDK (inclusive subpasta de repo) | ✅ código · ⏳ marcador | `agentEnv` com teto sempre; roteiro manual passo 4 |
| UI "Git pausado", status bar, `.catch`/corrida | ✅ · ⏳ NVDA | `sprint-05/evidencias/h05.1-git-pausado.png`, `h05.1-repo-limpo.png` |
| H05.2 UI empacotada por `app://` com GrantFileProtocol off | ✅ | `evidencias/h05.2-app-empacotado.png` (sem erro de CSP; `DEVDECK_*` ignoradas) |
| Fuses, hash do SDK, versões exatas, depuração recusada | ✅ | `verify-fuses`, `verify-sdk`, `cli.test.ts` (prefixos `--`, `-`, `/`); `--remote-debugging-port` → saída 1 no `.exe` |
| Sem UAC, atualizar preserva dados, desinstalar mantém, chat no instalado | ⏳ | roteiro manual H05.7 |
| Instalador 238 MB / instalado 757 MB | ✅ | `dist/DevDeck-Setup-*.exe`, ADR-011 |
| H05.3 check-tag, jobs separados, SHAs, sem cache | ✅ | `tests/unit/scripts/check-tag.test.ts`, `release.yml` |
| actionlint/zizmor e dry run | ⏳ | ferramentas fora desta máquina; dry run no GitHub |
| H05.4 8 `it.todo` | ✅ | 0 restantes; CI falha se voltar |
| Diff de 2 MB/20 mil linhas, "Aprovar todas" desabilitado | ✅ | `diffRows.test.ts` (< 500 ms); `decide()` recusa no main |
| H05.5 chaves desconhecidas; "Sempre" por caminho e só com extrator | ✅ | `trust.test.ts`, `toolpath.test.ts` |
| H05.6 migration 0002 | ✅ código · ⏳ execução | `supabase/tests/0002_rate_limit.sql` (com controle positivo); sem Postgres local |
| H05.8 credencial na URL de MCP | ✅ | `secrets.test.ts` |
| H05.9 camadas CSS | ✅ | `css-layers.test.ts` (já pegou o `.badge` reusado no card) |

**Bugs do QA (todos corrigidos em `a75207f`):** subpasta de repo deixava o SDK achar o `.git` do pai (alta); descartar `[ab].txt` descartava `a.txt` e `b.txt` (glob → `--literal-pathspecs`); "Sempre" em Bash/MCP; prefixos `-`/`/`; aviso "git não encontrado" sem repo; `include.path` fora do hash (confiança só na execução); status bar desatualizada após confiar e respostas fora de ordem; `decide()` só bloqueava no renderer; job de release sem Node 24; chaves `x-api-key`/`private_token`; `skipIf` silencioso no CI; pgTAP sem controle positivo.

## Security review
Agente `cybersecurity` no HEAD `eeb7a1a`; revalidação em `a75207f`.

| Bloqueante | Fechamento | Evidência |
|---|---|---|
| Parser próprio diverge do git | ✅ | `git config --file … --no-includes` fora do workspace (`gitcore.ts`, `gitproc.ts`) |
| Lista de permitidas por chave exata | ✅ (acréscimos `remote.*.prune/tagopt`, `branch.*.pushremote/description/vscode-merge-base` aceitos) | `lib/gitconfig.ts` |
| Estrutura do `.git` | ✅ | `readGitShape` (lstat) |
| Hooks, env e `-c` fixos | ✅ | `gitArgs`, `gitEnv`, integração |
| Git do SDK sem confiança | ✅ | `agentEnv` |
| `mcpServersDelivery` | ✅ | `agent.ts` |
| GrantFileProtocolExtraPrivileges desligada | ✅ mitigação aceita | `app://` com `standard/secure/supportFetchAPI`, `resolveAppAsset`, `isAppUrl` exige `/index.html` |
| **Submódulo executa filtro (achado na review)** | ✅ `a75207f` | `FORCED_GIT_CONFIG` por env no DevDeck e no agente, `--ignore-submodules=all`, teste com controle positivo |

| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| bloqueante | `gitcore.ts` | Config do pai limpa, mas o status entrava no submódulo e rodava o filtro dele | ✅ corrigido (`a75207f`) |
| alta | `lib/toolpath.ts` | "Sempre" em Bash/WebFetch/MCP sem extrator (`cat ~/.ssh/id_*`) | ✅ `alwaysEligible` |
| média | `lib/cli.ts` | Prefixos `-` e `/` do Chromium no Windows | ✅ regex + `app.commandLine.hasSwitch` |
| média | `lib/gitproc.ts` | PATH cru no agente (`git.exe` plantado) | ✅ PATH filtrado, `NoDefaultCurrentDirectoryInExePath`, teto sempre · ⏳ conferir no instalado |
| baixa | `agent.ts` | `alwaysForSession` aceito com prévia parcial | ✅ recusado no main |
| baixa | `mcp.ts` | Import do `~/.claude.json` com token na URL | ✅ servidor não importado |
| baixa | `gitTrust.ts` | Cache do gate por lstat | aceito (exige código local já rodando) |
| baixa | `sdk-hashes.json` | Só `claude.exe` e `sdk.mjs` | aceito (`npm ci` confere o lockfile) |
| baixa | `release.yml` | Quem tem push cria tag `v*` | aceito se o ruleset de tag `v*` for configurado antes da primeira tag |
| baixa | `gitproc.ts` | Repositório embutido (gitlink sem `.git/modules`) sem teste próprio | backlog (mesmo caminho do submódulo) |

- **Veredito:** ✅ Cybersecurity não bloqueia. H05.3 fecha após o dry run e H05.6 após o pgTAP rodado como `authenticated` (critérios de aceite, não riscos).

## Riscos aceitos
- **Baixa:** filtros da config global/sistema do usuário (ex.: LFS) disparados pelo `.gitattributes` de um repo com `.git/config` limpo — config do próprio usuário (ADR-018).
- **Baixa:** `app.asar.unpacked` fora da integridade do asar; hash do `claude.exe` só no build.
- **Baixa:** instalador sem assinatura → SmartScreen. Mitigação: SHA-256, attestation, VirusTotal antes de publicar.
- **Baixa:** sem confiança, o git do agente também fica indisponível (intencional, documentado na UI). Workspace aberto numa subpasta de repo: o agente não usa o git do pai.
- **Baixa:** cache do gate por lstat; `sdk-hashes` de dois arquivos; tag `v*` sem ruleset até o usuário configurar.
- **Baixa:** Linux `basic_text` sem verificação manual, se não houver máquina.
- **Baixa (2026-11-25):** NVDA real, teclas mortas do ABNT2 físico e MCP/ICS com credencial real sem verificação manual. Cobertura parcial: axe nos estados críticos, Unicode no chat e E2E de segredo com token falso. Repetir no roteiro da Sprint 06.

## Pendências para fechar
1. ✅ Roteiro manual da H05.7 no app instalado (lista abaixo), fechado em 2026-11-25 com a build do dry run. Itens sem verificação possível viraram risco aceito (NVDA, teclado ABNT2 físico, MCP/ICS com credencial real).
2. ✅ (agente, 2026-11-25) `supabase test db` local (CLI 3.4.0, `postgres:17.12.0.002`, `supabase/config.toml` mínimo sem `project_id` real; porta 55322 porque o Windows reserva 53952–54451): migrations 0001 e 0002 aplicadas, `0002_rate_limit.sql` **10/10 ok**.
3. ✅ Dry run do `release.yml` (`workflow_dispatch` na `main` `3be44a1`, [run 45611684787](https://github.com/flavsjr/devdeck/actions/runs/45611684787)): `build (windows)` verde em 6,5 min com artefato `installer` (238 MB); `release (draft)` pulado, como esperado fora de tag. `DevDeck-Setup-0.5.0.exe` do artefato: SHA-256 `e1372e00e5a69665ca391a4663f392aa52c636ed4fb43ccbbc9a715a6026c221` (é a build usada no roteiro manual restante). Ruleset de tag ✅ (usuário, 2026-11-25; conferido pela API): "Proteção de tags" ativo em `refs/tags/v*` com `creation`, `update`, `deletion` e `non_fast_forward`; bypass só para o papel admin.
4. ✅ Tag e release (2026-11-25): tag `v0.5.0` em `b81b9f8` (main com o fix do ADR-022, PR #5), criada com aprovação do usuário. [Run 45631405457](https://github.com/flavsjr/devdeck/actions/runs/45631405457) verde: pre-release em rascunho "DevDeck v0.5.0 — distribuição segura" com `DevDeck-Setup-0.5.0.exe` (SHA-256 `bc2adfcb77582deecc81d77bb0699006f9fd1fa16f0c45ffce8f93f19bd1dbb3`), `SHA256SUMS.txt` e attestation de procedência. [VirusTotal](https://www.virustotal.com/gui/file/bc2adfcb77582deecc81d77bb0699006f9fd1fa16f0c45ffce8f93f19bd1dbb3) (usuário, 2026-11-25): **1/56**, só CTX `Exe.unknown.generic` (heurística genérica, esperada em NSIS sem assinatura); demais engines sem detecção. Falso positivo aceito: hash confere com o build atestado do CI.

### Roteiro manual (H05.7)
1. Hash dos dados antes: `Get-ChildItem $env:APPDATA\DevDeck -Recurse -File | Get-FileHash | Sort Path > antes.txt`.
2. Instalar `dist\DevDeck-Setup-0.5.0.exe` numa conta sem admin: sem UAC, app em `%LOCALAPPDATA%\Programs\DevDeck`, ícone no Menu Iniciar, área de trabalho e barra (100/150/200%).
3. Chat no instalado responde; `Get-CimInstance Win32_Process -Filter "name='claude.exe'"` mostra caminho em `app.asar.unpacked` e linha de comando sem token de MCP.
4. Marcador do SDK: repo com `filter.evil.clean` que grava `%TEMP%\marcador-sdk.txt`, `.gitattributes` `* filter=evil` e arquivo com data no futuro. "Abrir sem git" + mensagem → sem marcador. Controle: "Confiar e usar git" + chat novo → marcador aparece. Repetir abrindo uma subpasta do repo e com `git.exe` falso na raiz.
5. Atualizar por cima (nova build) e comparar `depois.txt` com `antes.txt`; chats, conquistas e segredos continuam.
6. Desinstalar: `%APPDATA%\DevDeck` continua.
7. Depuração: `DevDeck.exe --remote-debugging-port=9222`, `-remote-debugging-port=9222`, `/remote-debugging-port=9222` e `--inspect` saem; `curl http://127.0.0.1:9222/json/version` falha.
8. ABNT2: `ç Ç á ã ê ~ ^` no chat e no comentário; AltGr+Q/W/E; Alt+A/Alt+R não disparam com AltGr.
9. NVDA: "Git pausado neste workspace" e "Revisar configurações…", diálogo nativo, card de aprovação com selo, "Aprovar todas" indisponível com prévia parcial.
10. Aprovação real com painel recolhido, a ~900 px e a 1280×720.
11. MCP HTTP com header e ICS real: `findstr /s /i "<token>" "%APPDATA%\DevDeck\*"` não acha nada; URL com `?token=` é recusada.

### Resultados do roteiro manual
| Passo | Resultado | Evidência / observação |
|---|---|---|
| 2. Instalar sem admin | ✅ (usuário, 2026-11-24) | Instalou sem UAC; app abriu com o ícone novo e o workspace AlugueFacil (branch na status bar) |
| 3. Chat no instalado | ✅ parcial | O `claude.exe` desempacotado subiu e respondeu ("Failed to authenticate: OAuth session expired…"); resposta real fica para quando houver credencial válida |
| 5. Atualizar por cima | ✅ (usuário, 2026-11-24) | Build com a correção do turno instalada por cima: abriu com o mesmo workspace, o chat anterior e o histórico, e o teto diário de $10. Comparação por hash (passo 1) não foi feita |
| 4. Chat sem confiança num repo com filtro | ✅ com ressalva (usuário, 2026-11-24) | "Git pausado" listou `filter.evil.clean/smudge`; chat com "Abrir sem git" → pasta de marcadores vazia (conferida pelo agente). Ressalva: a sessão do Claude estava expirada (turno falhou na autenticação), então falta o controle positivo (confiar → marcador aparece) para provar que o git do SDK rodou antes da autenticação |
| 4. Controle positivo ("Revisar configurações…" → confiar) | ✅ (agente, 2026-11-24) | Relato "o diálogo não apareceu" **não reproduzido**: no app instalado (dados isolados) o diálogo nativo abriu, "Confiar e usar git" gravou `trusted-git.json` e o git do DevDeck rodou o filtro (marcador `clean`). Virou E2E com Playwright (`tests/e2e/git-trust.e2e.mjs`), inclusive na sequência do usuário ("Abrir sem git" no chat antes). Falta só o git do SDK com login válido |
| 6. Desinstalar mantém dados | ✅ (agente, 2026-11-24) | Desinstalação silenciosa: app removido, `%APPDATA%DevDeck` intacto (SHA-256 igual nos 6 arquivos de dados e sessões); reinstalado em seguida com dados e atalho do Menu Iniciar |
| 8. ABNT2 | ✅ parcial (agente) | Layout real 00010416: AltGr+Q/W/E digitam `/?º` no chat sem disparar atalho; Ctrl+K abre a paleta com foco no campo. `ç` e teclas mortas não dá para injetar pelo layout (a automação manda Unicode): ⏳ conferir digitando |
| 9. Acessibilidade | ✅ parcial (agente) | axe sem violações no card de aprovação e em "Git pausado"; "Git pausado" com `role=status`. NVDA de verdade: ⏳ manual |
| 10. Aprovação com painel recolhido | ✅ (agente, E2E) | `tests/e2e/approval.e2e.mjs`: card aparece com o painel recolhido em janela larga, 1280×720 e ~900 px; selo "fora do workspace" e "Sempre" escondido; prévia parcial desabilita "Aprovar todas"; aviso de Edit que vai falhar |
| 11. Segredos de MCP | ✅ parcial (agente, E2E) | Token falso salvo por IPC: renderer recebe só a máscara, nenhum arquivo de dados tem o token em claro, `mcp-servers.json` guarda o header cifrado; URL com `?token=` recusada. MCP e ICS reais: ⏳ com credencial do usuário |
| 7. Depuração bloqueada | ✅ (agente, `dist/win-unpacked`) | `--`, `-`, `/remote-debugging-port` e `--inspect` → saída 1 |
| **Bug** | ✅ corrigido | Turno que falhou na autenticação desbloqueou "Hello, Claude": estatísticas e conquistas agora só contam turno concluído (`lib/turns.ts`, teste) |
| 3 e 4. Chat com login válido, sem confiança | ✅ (usuário + agente, 2026-11-25) | Build do dry run (SHA-256 `e1372e00…c221`) instalada em `%LOCALAPPDATA%\Programs\DevDeck` (0.5.0). Repo `devdeck-repo-sdk` com `filter.evil.clean` e `a.txt` com mtime no futuro, "Abrir sem git": status bar "git pausado", chat respondeu de verdade (2 turnos, $0.14) e `marcador-sdk.txt` **não existe** (conferido pelo agente) |
| 4. Controle positivo com login válido | ✅ (agente, computer-use, 2026-11-25) | Filtro trocado por um script que grava a cadeia de processos pai no marcador (`%TEMP%\devdeck-quem.sh`). Mudar o `.git/config` pausou o git de novo sem rodar nada (gate reavaliado). **Sem confiança:** chat respondeu e o `git status` pedido ao agente pelo Bash falhou com `not a git repository: …\DevDeck\no-git-here`; marcador sem linha nova. **Com confiança:** linhas `git.exe < DevDeck.exe` (status do app) e uma `git.exe < bash.exe` (Bash do agente). A CLI do SDK 0.3.330 não rodou `git status` sozinha ao abrir o chat em nenhum dos casos |
| 8. ABNT2 por automação | ⚠️ não verificável | A ferramenta envia o caractere, não a tecla física (`;` saiu `;`, não `ç`). Unicode colado (`ç Ç á ã ê ~ ^`) chega certo no chat e na resposta. Teclas mortas físicas: risco aceito |
| 9 e 11. NVDA, MCP/ICS reais | ⚠️ risco aceito (usuário, 2026-11-25) | NVDA não tem automação confiável do que é falado; o agente não digita token. Coberto parcialmente por axe e E2E com token falso |
| **Achados** | → Sprint 06 | (1) Sem `requestSingleInstanceLock`: abrir o app de novo cria outra instância sobre o mesmo `%APPDATA%\DevDeck`. (2) `permissionMode: 'default'` libera Bash só-leitura (`git status`) **sem** chamar `canUseTool`; contradiz a mitigação "Bash sempre pede aprovação" do risco aceito da Sprint 06. (3) Sem confiança, o agente sugeriu rodar git "sem essa variável": o env restrito não é sandbox, um `env -u GIT_DIR …` só depende da aprovação do Bash |

## Backlog para a Sprint 06 (observado no roteiro)
- **Notificações fora do padrão (usuário):** hoje é um toast único de texto para tudo — erro, aviso, conquista, informação —, sem tipo nem severidade, sem fila (um substitui o outro), sem ação e com mensagem crua do SDK/git. Levar ao debate com UX: tipos (erro/aviso/sucesso/conquista) com ícone e cor por token, fila, duração por tipo, ação ("Tentar de novo", "Abrir configurações"), região `aria-live` adequada e conquista com visual próprio, separado de erro.
- **Erro de autenticação do Claude legível:** "OAuth session expired and could not be refreshed" aparece cru, em inglês. Traduzir para uma ação: "Sua sessão do Claude expirou: entre de novo no Claude Code ou cole uma chave da API em Configurações", com botão.

## Entregas
- v0.5.0: instalador NSIS per-user verificável (fuses, hash do SDK, `app://`), release em rascunho com SHA-256 e attestation, git sem executar código do repositório (B3 fechado), confiança e "Sempre" estritos, agenda/diff corrigidos, limite de curtidas e denúncias, varredura de camadas CSS.
- ADRs 011, 018, 019 e emendas 013/015. `CHANGELOG.md` 0.5.0, READMEs EN/PT com instalação.
- Processo: debate só com papéis convocados (matriz no planning, réplica nos conflitos).

## Retro
- **Funcionou:** a réplica resolveu 11 conflitos de uma vez e o PO decidiu com os argumentos lado a lado (parser próprio × `git config --file`, simple-git × wrapper). Controle positivo nos testes de segurança: todo teste de marcador prova que o fixture dispara com git puro, então "passou" significa algo. O smoke do app empacotado pegou o `file://` quebrado pela fuse no mesmo dia, como o debate tinha previsto. A varredura de camadas (H05.9) pegou um `.badge` reusado no primeiro run.
- **Melhorar:** o security review achou um bypass (submódulo) que nenhum papel levantou no debate, e o QA achou a subpasta de repo: o modelo de ameaça do B3 olhou só para a raiz. Escapes em heredoc/Python voltaram a quebrar arquivos (terceira sprint seguida). PowerShell 5.1 grava BOM e quebrou um JSON de teste.
- **Ações:** checklist de ameaça do git no template (raiz, pai, submódulo, worktree, binário no PATH); código com escape só por Edit/Write, nunca por heredoc; `[IO.File]::WriteAllText` ou node para arquivos lidos por outras ferramentas; rodar pgTAP no CI quando houver Supabase local.
