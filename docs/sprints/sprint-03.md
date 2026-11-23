# Sprint 03 — Qualidade, segurança e instalador

**Período:** a partir de 2026-11-23 · **Versão alvo:** v0.3.0 · **Branch:** `sprint/03-qualidade` · **Status:** planejada

## Objetivo
Dar base de qualidade ao DevDeck (testes + CI) e fechar os 4 bloqueantes de segurança da primeira revisão real do squad. Instalador Windows completo fica para a Sprint 04 (aqui só spike).

## Histórias (rascunho levado ao debate — versão final em "Histórias finais")
- **H03.1** Testes automatizados (vitest) da lógica pura.
- **H03.2** CI no GitHub Actions (typecheck + testes + build).
- **H03.3** Revisão de segurança real + correções.
- **H03.4** Instalador Windows (electron-builder, NSIS).
- **H03.5** Bugs dos testes manuais da Sprint 02.

## Debate

> Primeira sprint com os papéis rodando como subagentes reais (`.claude/agents/`), cada um lendo o código de forma independente. Abaixo, a síntese de cada parecer.

### Tech Lead
- **Testabilidade:** nenhuma função-alvo é importável em teste hoje (todas puxam `electron`/`./store`). Refatoração mínima: extrair lógica pura para `src/main/lib/` (`streak.ts`, `recurrence.ts`, `ics.ts`, `edit.ts`) e `src/renderer/src/lib/diffRows.ts`; `evaluateAchievements(defs, metrics, prev, now)` puro. Regra: `lib/` não importa `electron`, `fs`, `store`, `events` — com teste-guarda.
- **H03.1:** só `vitest` como dependência nova, ambiente `node`, testes em `tests/unit/**`, fixtures `.ics` em `tests/fixtures/` (com `.gitattributes -text`), `tsconfig.test.json` entrando no typecheck. Refatoração em commit `refactor:` separado.
- **H03.2:** matriz ubuntu + windows, Node 24, `npm ci → typecheck → test → build`.
- **H03.4:** `appId` igual ao AUMID (`com.devdeck.app`); `pathToClaudeCodeExecutable` apontando para `app.asar.unpacked` quando empacotado (o SDK resolve o binário dentro do asar e o spawn falha); `files: out/**`; `@supabase/supabase-js` para devDependencies; validar ESM do SDK carregando de dentro do asar.
- **Estimativas:** H03.1 M · H03.2 P · H03.3 M (timebox) · H03.4 G · H03.5 P–M (~20% da capacidade).
- **ADRs sugeridos:** 009 testes em lógica pura isolada; 010 CI; 011 instalador NSIS per-user; 012 validação de IPC com `zod` (já é dependência).

### QA
- **Plano de testes** detalhado por alvo (sequência de commits, recorrência, ICS, conquistas, edit/revert, diff), rodando em dois fusos (`America/Sao_Paulo` e `America/New_York`) com relógio fixo.
- **Bugs prováveis encontrados lendo o código:**
  - **Denunciar nunca envia:** `CommunityView.tsx` usa `prompt()`, que o Electron não suporta (alta confiança).
  - Agenda: limites inclusivos fazem evento de dia inteiro de ontem/amanhã aparecer em "Hoje"; horário inexistente no horário de verão desloca a série; eventos ICS sem UID se sobrescrevem e exceção órfã é descartada; `STATUS:CANCELLED` ignorado; série diária antiga (> 5.000 ocorrências desde o início) some; lembrete acima de 180 min dispara errado; evento com início vazio é salvo.
  - Conquistas: `levelFromXp(Infinity)` entra em loop; linguagens contadas com diferença de maiúsculas ("Poliglota" inflado); feed ICS com erro conta para "Sincronizado"; revert de patch vazio soma revert (farm de conquista).
  - Edit/revert: `old_string` vazio gera prévia vazia; patch gravado usa o conteúdo previsto, não o real (CRLF pode quebrar o revert); `readFile` sem tratamento no revert.
  - Diff: "1 linhas"; `diffLines` sem limite pode travar com arquivo grande.
  - GitHub: dia vindo em outro fuso pode contar como "futuro" (hipótese).
- **Critérios de aceite sugeridos:** testes passam sem Electron e nos dois fusos, ≥ 80% de cobertura nos módulos puros, cada bug confirmado vira teste vermelho → verde; CI vermelho em teste quebrado, < 10 min, sem segredos; nenhum bloqueante aberto e `npm audit --omit=dev` sem high/critical; instalador instala sem admin, agente responde, atualização preserva `%APPDATA%/DevDeck`.
- **Roteiro manual** dos itens pendentes da Sprint 02 (provedores, comunidade, lembretes) — ver "QA" abaixo.

### Cybersecurity
**Bloqueantes:**
1. **Repo malicioso executa comandos:** `settingSources: ['project']` (ligado por padrão) carrega `.claude/settings.json` do workspace — hooks rodam sem passar por `canUseTool` e `permissions.allow` pula a aprovação (`agent.ts:283`, `store.ts:64`). Mitigação: desligado por padrão + diálogo "confiar neste workspace" listando hooks e regras `allow`.
2. **"Aprovar todas da sessão" sem confinamento:** auto-aprova Edit/Write fora do workspace e em `.git/hooks/`, `.claude/settings.json`, `.vscode/tasks.json` — vira execução sem aprovar Bash (`agent.ts:460-468`). Mitigação: só dentro do workspace (`safeResolve`) e fora de uma lista de caminhos sensíveis.
3. **Navegação e origem do IPC:** sem `will-navigate`/`will-frame-navigate` e sem checar `event.senderFrame`; se a janela navegar para fora, a página ganha `window.deck` (e `mcp:test` executa comando). Mitigação: bloquear navegação, wrapper de `ipcMain.handle` validando origem, `sandbox` no iframe do Spotify, `setPermissionRequestHandler` negando.
4. **Ids e settings sem validação:** id de sessão vira caminho (`agent:remove('..\\settings')` apaga arquivos; combinado com `revertChange`, escreve em qualquer caminho); `settings:update` grava chaves arbitrárias (`store.ts:84,127`). Mitigação: UUID obrigatório + lista fechada de chaves/tipos (zod).

**Médias:** env/headers de MCP e URL do ICS em texto puro e devolvidos ao renderer; `mcp:test`/`mcp:save` disparam comando sem confirmação do main; política `auto` aceita em tool não somente leitura e sobrevive à troca de comando/URL; "sempre" no Bash libera qualquer comando; `safeResolve` não resolve symlink/junction e lê arquivo sem limite; 3 contas descartáveis ocultam qualquer post (sem rate limit de denúncia/curtida).
**Baixas:** `feed.id` vira caminho de arquivo; Bearer do Bitbucket seguindo `next` sem checar host e token do GitLab em redirect; regex de link aceita `evilzoom.us`; download de ICS sem limite; CSP de produção com `ws://localhost:*` e sem `base-uri`/`form-action`/`object-src`; tags/badges sem limite por item e corrida no rate limit; `workspace:open` exposto sem uso.
**Novas histórias:** CI com `contents: read`, actions por SHA, `persist-credentials: false`, sem `pull_request_target`, gitleaks, fixtures com tokens obviamente falsos; build falha se a chave do Supabase for `service_role`/`sb_secret_`; instalador só gerado no CI a partir de tag, com SHA-256 publicado, attestation, **fuses** (`RunAsNode`, `NodeOptions`, `NodeCliInspect` off; `EmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` on); fixar a versão exata do SDK e conferir hash do binário desempacotado; **sem auto-update** até haver assinatura de código.

### DevOps
- **Antes de tudo:** commitar o `package-lock.json` sincronizado. Não há tags; os links do CHANGELOG estão quebrados — proposta de tag `v0.2.0` no commit `81ca737` (depende de aprovação do usuário).
- **CI:** gatilhos push em `main`, PR e manual; `concurrency`; matriz windows + ubuntu; Node 24 via `.nvmrc`; cache npm; Dependabot para actions. **Não** usar `--omit=optional` (quebra o binding nativo do rolldown).
- **electron-builder:** `appId` = AUMID; NSIS per-user x64; `asarUnpack` do SDK; excluir binários de outras plataformas; `npmRebuild: false`; ícone `build/icon.ico` (a criar).
- **Release:** `npm run dist:win` local para teste; `release.yml` por tag `v*.*.*` em windows, checando tag = versão do package, gerando **draft** com instalador + `SHA256SUMS.txt` (`--publish never` obrigatório). Publicação e tag só com aprovação.
- **Riscos:** instalador de ~180–250 MB (binário do SDK tem 387 MB); app instalado sem `pathToClaudeCodeExecutable` abre mas o chat quebra; `DEVDECK_SNAPSHOT` deve valer só fora do app empacotado.
- **Estimativas:** H03.2 P · H03.4 G.

### Divergências resolvidas na consolidação
- **Download do Electron no CI:** Tech Lead propôs `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; DevOps contou com o `postinstall`. Testes e `electron-vite build` não precisam do binário → job de checagem usa o skip (o `install.js` do Electron respeita a variável); o job de release deixa baixar.
- **Ponto convergente:** Tech Lead, DevOps e Cybersecurity apontaram, de forma independente, o caminho do binário do SDK dentro do asar e a validação de ids no IPC.

### Decisão (PO)
- **Escopo:** M + P + M + G + P–M não cabe numa sprint. **H03.4 (instalador) vai para a Sprint 04**; aqui só um spike local (Could). Distribuir instalador com 4 bloqueantes abertos espalharia a falha.
- **Bloqueantes de Cybersecurity:** os 4 entram como Must, com as mitigações da ata. Acréscimo do PO ao B2: o confinamento resolve symlink/junction (`realpath`); sem isso, um link no repo contorna a regra.
- **Testes (H03.1):** proposta do Tech Lead aprovada — lógica pura em `lib/`, `vitest` como única dependência nova, refatoração em commit `refactor:` separado. ADR-009.
- **CI (H03.2):** ubuntu + windows, Node 24. Divergência do Electron: job de checagem usa o skip; job de release (Sprint 04) baixa o binário. Endurecimento de Cybersecurity entra na própria história. ADR-010.
- **Validação de IPC:** `zod` (já dependência) com wrapper único de `ipcMain.handle`. ADR-012. ADR-011 (NSIS) vai junto com a H03.4.
- **Bugs:** Denunciar é Must (anunciado na v0.2.0 e nunca funcionou). Dos demais, só os já cobertos pelos testes da H03.1, até ~20% da capacidade; o resto vira `it.todo` para a Sprint 04.
- **Lockfile e tag:** commit do `package-lock.json` é a primeira tarefa (CI usa `npm ci`). **Tag `v0.2.0` em `81ca737`, push e PR pendentes de aprovação do usuário — não decidido.** Links do CHANGELOG seguem quebrados até lá.

## Histórias finais

### Must

#### H03.3 — Workspace de terceiros não executa nada sozinho (B1, B2)
*Como dev que abre repositórios de terceiros, quero que hooks e regras do repo só valham depois que eu confiar nele, para não ter a máquina comprometida ao abrir um projeto.*
- [ ] Dado um workspace novo, quando abro, então `settingSources` não inclui `project`.
- [ ] Dado um `.claude/settings.json` no repo, quando ligo as configurações do projeto, então um diálogo lista hooks e regras `allow`, e só carrega depois de "Confiar".
- [ ] Dado um workspace já confiado, quando o `.claude/settings.json` muda (hash), então o diálogo aparece de novo.
- [ ] Dado "Aprovar todas da sessão", quando o agente edita fora do workspace (`..`, caminho absoluto, symlink, junction) ou em `.git/`, `.claude/` ou `.vscode/` (sem diferenciar maiúsculas), então pede aprovação.
- [ ] Teste unitário para cada caso acima.

#### H03.6 — IPC só aceita a UI do DevDeck e entrada válida (B3, B4)
*Como dev, quero que só a interface do app chame o main, com dados válidos, para que uma página externa ou um id forjado não execute comando nem apague arquivo.*
- [ ] Navegação, redirect, frame ou janela nova fora da origem do app são bloqueados (`will-navigate`, `will-frame-navigate`, `setWindowOpenHandler`).
- [ ] Todo handler passa pelo wrapper que valida `event.senderFrame`; nenhum `ipcMain.handle` direto fora dele.
- [ ] Iframe do Spotify com `sandbox`; `setPermissionRequestHandler` nega por padrão.
- [ ] Id não-UUID (ex.: `agent:remove('..\\settings')`, `revertChange`) → erro, nenhum arquivo tocado.
- [ ] `settings:update` com chave fora da lista ou tipo errado → rejeitado (zod), com teste.
- [ ] `npm audit --omit=dev` sem high/critical; Cybersecurity revalida os 4 bloqueantes no Security review.

#### H03.1 — Testes automatizados da lógica pura
*Como mantenedor, quero testes de agenda, conquistas, edit/revert e diff para mudar o código sem regressão silenciosa.*
- [ ] `npm test` roda sem Electron e passa com `TZ=America/Sao_Paulo` e `TZ=America/New_York`, relógio fixo.
- [ ] Cobertura ≥ 80% em `src/main/lib/**` e `src/renderer/src/lib/**`.
- [ ] Teste-guarda falha se `lib/` importar `electron`, `fs`, `store` ou `events`.
- [ ] Todo bug confirmado tem teste: corrigido → vermelho para verde; não corrigido → `it.todo` citando a Sprint 04.
- [ ] `tsconfig.test.json` entra no `npm run typecheck`.

#### H03.2 — CI no GitHub Actions
*Como mantenedor, quero checagem automática em cada push e PR para não integrar código quebrado ou inseguro.*
- [ ] Push em `main`, PR ou disparo manual → `npm ci → typecheck → test → build` em ubuntu e windows, Node 24 (`.nvmrc`), < 10 min.
- [ ] Teste quebrado → check vermelho.
- [ ] `permissions: contents: read`, actions por SHA, `persist-credentials: false`, sem `pull_request_target`, sem segredos.
- [ ] gitleaks no pipeline; fixtures com tokens obviamente falsos.
- [ ] Build falha se a chave do Supabase for `service_role` ou `sb_secret_`.
- [ ] Checagem com `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, sem `--omit=optional`; Dependabot para actions.

#### H03.5 — Denunciar funciona
*Como membro da comunidade, quero denunciar um post abusivo para que ele seja ocultado.*
- [ ] Nenhum `prompt(` em `src/renderer`; motivo coletado num modal próprio.
- [ ] Usuário logado confirma → denúncia gravada no Supabase + confirmação na tela.
- [ ] Cancelar não envia nada; sem login, o app pede login.
- [ ] Item 9 do roteiro manual passa com o Supabase real (3 contas → post oculto).

### Should

#### H03.7 — Bugs de agenda, conquistas e diff (cobertos pela H03.1)
*Como dev, quero agenda e conquistas corretas para confiar no que o DevDeck mostra.*
- [ ] Evento de dia inteiro de ontem ou amanhã não aparece em "Hoje".
- [ ] Lembrete de 240 min dispara 4 h antes; evento sem início não é salvo.
- [ ] `levelFromXp(Infinity)` retorna sem loop; linguagens não duplicam por maiúsculas; feed ICS com erro não conta para "Sincronizado"; revert de patch vazio não soma.
- [ ] Revert com arquivo ausente mostra erro sem derrubar o main; diff exibe "1 linha".

### Could

#### H03.4a — Spike de empacotamento (timebox 1 dia)
*Como DevOps, quero validar o SDK fora do asar para reduzir o risco da H03.4.*
- [ ] `npm run dist:win` local gera instalador per-user e o chat responde com o SDK em `app.asar.unpacked`.
- [ ] Resultado (go/no-go, tamanho) registrado na sprint; artefato não publicado.

## Ordem de execução
1. `chore:` commit do `package-lock.json` sincronizado.
2. `refactor:` extrair `lib/` pura + teste-guarda; typecheck e build verdes.
3. `test:` vitest, fixtures `.ics`, dois fusos; bugs viram testes vermelhos.
4. `ci:` workflow endurecido, gitleaks, checagem da chave do Supabase.
5. `fix:` H03.6 (wrapper de IPC, zod, navegação) — base do resto.
6. `fix:` H03.3 (confiança no workspace, confinamento).
7. `fix:` Denunciar; depois H03.7 até o teto de capacidade.
8. Security review, `npm audit`, roteiro manual (itens 1–15).
9. Spike de empacotamento, se sobrar tempo.
10. `docs:` ADRs 009/010/012, CHANGELOG 0.3.0, sprint, READMEs EN/PT.
11. Aguardar aprovação do usuário para tag `v0.2.0`, push e PR.

## Riscos aceitos
- **Média:** env/headers de MCP e URL do ICS em texto puro e devolvidos ao renderer. Ficam no perfil do usuário e, com a H03.6, só a UI do app lê. Fere a regra de segredos do CLAUDE.md → **primeiro item da Sprint 04**.
- **Média:** `mcp:test`/`mcp:save` sem confirmação do main, política `auto` e "sempre" no Bash. Exigem ação do próprio usuário na UI, que passa a ser a única origem aceita.
- **Média:** denúncia e curtida sem rate limit. Vetor já existe pela API com a chave pública; fica para a migration `0002`.
- **Média:** `safeResolve` lê sem limite de tamanho. Parte de symlink entra agora na H03.3.
- **Baixas:** todas para a Sprint 04. CSP endurecida e remoção de `workspace:open` entram como Could se sobrar timebox na H03.6.
- **Instalador** (fuses, SHA-256, attestation, hash do SDK, sem auto-update): sem risco nesta sprint — nada é distribuído.

## Movido para a Sprint 04
- H03.4 completa: NSIS per-user, `asarUnpack`, fuses, `release.yml` em draft com `SHA256SUMS.txt`, attestation, ícone, versão exata e hash do SDK, sem auto-update, ADR-011.
- Bugs: horário de verão, ICS sem UID ou exceção órfã, `STATUS:CANCELLED`, série > 5.000 ocorrências, patch gravado com conteúdo real (CRLF), limite do `diffLines`, `old_string` vazio, fuso do GitHub.
- Riscos médios e baixos de segurança listados acima.

## QA — roteiro manual pendente da Sprint 02
1. Perfil → conectar GitHub (token só leitura) → login, commits e heatmap aparecem.
2. Repetir com GitLab (e self-hosted, se houver) e Bitbucket (`read:*`).
3. Token inválido num provedor → erro só no cartão dele.
4. Sem rede, clicar Atualizar → erro por cartão, app não trava.
5. Procurar o token em `%APPDATA%/DevDeck` → não aparece em texto puro.
6. Sem `.env` → "Backend da comunidade não configurado".
7. Com migration e `.env`: feed abre sem login; login por código; definir @username.
8. Publicar artigo e snippet, curtir/descurtir, comentar.
9. Denunciar (falha esperada — bug `prompt()`); com 3 contas → post oculto.
10. Excluir o próprio post → confirmação cita "post e todos os comentários".
11. 11º post na mesma hora → mensagem de limite.
12. Evento daqui a 4 min, lembrete 2 min, link https, app minimizado.
13. Esperado: notificação e banner com Entrar; clicar traz a janela; não repete.
14. Lembrete de 240 min → anotar quando dispara (esperado 4 h antes).
15. ICS com evento de dia inteiro ontem → não aparece em "Hoje".
