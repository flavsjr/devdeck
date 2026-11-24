# Sprint 05 — Distribuição segura

**Período:** 2026-11-23 → 2026-12-07 · **Versão alvo:** v0.5.0 · **Status:** em andamento

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
| ICS/edit/diff (`it.todo`) | Back/Front | ⏳ |
| Confiança estrita e "sempre" por caminho | Back/Front | ⏳ |
| Migration `0002` + teste SQL | Back | ⏳ |
| ADR-011, ADR-018, ADR-019, emendas 013/015 | TL | ⏳ |

## QA
| Caso | Resultado | Evidência |
|---|---|---|

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|

## Riscos aceitos
- **Baixa:** filtros da config global/sistema do usuário (ex.: LFS) disparados pelo `.gitattributes` de um repo com `.git/config` limpo — config do próprio usuário (ADR-018).
- **Baixa:** `app.asar.unpacked` fora da integridade do asar; hash do `claude.exe` só no build.
- **Baixa:** instalador sem assinatura → SmartScreen. Mitigação: SHA-256, attestation, VirusTotal antes de publicar.
- **Baixa:** sem confiança, o git do agente também fica indisponível (intencional, documentado na UI).
- **Condicional:** GrantFileProtocolExtraPrivileges desligada quebrar o `loadFile` → só com mitigação e aval de Cybersecurity.
- **Baixa:** Linux `basic_text` sem verificação manual, se não houver máquina.

## Entregas
- …

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
