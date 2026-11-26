# Sprint 07 — Pontas soltas de qualidade e segurança

**Período:** 2026-11-25 → a definir · **Versão alvo:** v0.7.0 · **Status:** planejada, em execução (H07.1 já entregue como hotfix v0.6.1)

> Painel vivo da sprint. Ata em `sprint-07/ata.md` (modelo `_template-ata.md`); QA e security review em `sprint-07/qa.md`; evidências em `sprint-07/`. Regras de tamanho em `docs/squad.md` → "Economia de contexto".
>
> Criado em 2026-11-26 a partir do modelo. O achado da H07.1 saiu do debate da Sprint 07 feito no outro computador, que não foi registrado aqui: se houver ata ou planning de lá, juntar em `sprint-07/ata.md`.

## Objetivo
Fechar a dívida de teste e segurança da v0.6.x, tirar do caminho o trabalho repetido do release e fazer o "Ver no chat" abrir a sessão certa.

## Histórias (PO)

### H07.1 — Hotfix: git do agente não entra em submódulo · Must · P · ✅ entregue (v0.6.1)
*Como dev que abre um repositório recebido pronto, quero que nenhum submódulo execute código ao abrir o chat, para não rodar nada sem o diálogo de confiança.*
- [x] `submodule.<nome>.ignore=none` (no `.gitmodules` ou no `.git/config` do pai) não faz o `git status` do Claude Code entrar no submódulo nem rodar o filtro dele.
- [x] O gate lê o `.gitmodules` com `git config --file … --no-includes`; sem o arquivo na árvore, lê o do index e depois o do HEAD. Pausa com `ignore` ≠ `all`, `.gitmodules` especial ou ilegível, ou mais de 200 submódulos.
- [x] Inspeção sem lazy fetch (`GIT_NO_LAZY_FETCH`, `protocol.allow=never`): em partial clone, ler o blob não roda o `core.sshCommand` do repositório.
- [x] Sem `.gitmodules`, o hash de confiança é igual ao da v0.6.0 (confiança já gravada continua valendo).
- [x] ADR-018 (emenda), CHANGELOG 0.6.1, READMEs EN/PT.

Detalhes, security review e verificação: [PR #9](https://github.com/flavsjr/devdeck/pull/9) e `sprint-07/qa.md`.

### H07.2 — Testes de componente dos parciais da H06.2/H06.3 · Must · M · ✅ pronta (aguarda PR)
*Como mantenedor, quero os critérios que ficaram parciais na Sprint 06 cobertos por teste, para não regredirem sem ninguém ver.*
- [x] Botão de fechar da notificação: alvo ≥ 24 px, `role` correto e foco visível/recuperado ao fechar.
- [x] Com `prefers-reduced-motion`, nenhuma animação na pilha.
- [x] Lembrete com "Abrir na agenda" abre a aba Agenda.
- [x] Erro do chat: um único toast; "Copiar detalhes" copia; "Tentar de novo" fica desabilitado sem mexer no composer. (No fluxo real o botão sai do card antigo durante o turno; o E2E prova "nenhum disponível".)

### H07.3 — Endurecer a inspeção do git · Must · M · ✅ pronta (aguarda PR)
*Como dev que abre repositório de terceiros, quero que a inspeção de confiança feche os casos de borda restantes, para não rodar código do repositório sem diálogo.*
- [x] T38: repositório embutido (gitlink sem `.git/modules`) com controle positivo — teste já escrito, entra no commit desta história (TR2).
- [x] `GIT_NO_LAZY_FETCH=1` também no env do agente.
- [x] Inspeção que estoura o timeout termina e reporta erro (sem confiar por padrão).
- [x] `core.worktree` e `include.path` que resolvem (realpath, também caminho relativo) para fora do repositório **ou** para dentro do workspace editável são recusados, testados com git real nas duas direções (D3).
- [x] Dado um zip com `.git/hooks/pre-commit`, o gate recusa e lista o hook; hooks `.sample` não contam (D2).

### H07.4 — "Ver no chat" abre a sessão do erro · Should · M · ✅ pronta (aguarda PR)
*Como dev com várias sessões, quero que "Ver no chat" leve à sessão onde o erro aconteceu, para não procurar à mão.*
- [x] Seleciona a sessão do erro e rola até a mensagem.
- [x] `sessionId` que não é UUID ou não existe é recusado, com aviso.
- [x] Erro da sessão ativa mantém o comportamento atual.

### H07.5 — VirusTotal no CI · Should · M · ✅ pronta (aguarda PR; prova real na próxima tag)
*Como mantenedor, quero o resultado do VirusTotal já nas notas do rascunho, para publicar sem subir o arquivo à mão.*
- [x] Link e resultado do scan nas notas do rascunho.
- [x] Sem chave ou com a API fora: notas dizem "scan pendente" e o release segue.
- [x] A chave nunca aparece em log; o secret só existe num job restrito, que não roda em PR de fork: environment `release` restrito a tags `v*.*.*` (D5).
- [x] As notas avisam que a amostra enviada ao VirusTotal fica pública.

### H07.6 — UI para `AskUserQuestion` · Could · G → Sprint 08
Fica para a Sprint 08 (tamanho G e precisa de UX).

## Convocação (PO)
| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| H07.1 | Back | TL, Sec, QA | execução de processo (git) e confiança no workspace |
| H07.2 | QA | Front, TL | testes de componente no renderer |
| H07.3 | Back | Sec, QA, TL | execução de processo (git) e confiança no workspace |
| H07.4 | Front | TL, Sec, QA | navegação por id vindo de evento (IPC/validação) |
| H07.5 | DevOps | Sec, TL | secret no CI e release |
| TR1 | DevOps | TL, Sec (revisão) | `release.yml` é gatilho de segurança |

**Não convocados (sem tarefa nesta sprint):** UX (H07.6 foi para a Sprint 08).

**Ordem de corte:** T47/T48 → H07.5 → H07.4 → parte da H07.2. H07.3 e TR1 não saem.

## Decisões (resumo da ata)
- **H07.1 (2026-11-25, outro computador):** saiu como hotfix antes do planning por ser execução de código sem diálogo nas v0.5.0/v0.6.0.
- **D1:** H07.2 por E2E (estender `notifications.e2e.mjs`) + unit da regra pura; sem jsdom (candidata futura com ADR).
- **D2:** hook não-`.sample` em `.git/hooks` vira risco no gate (achado médio da Sec) → H07.3.
- **D3:** `core.worktree`/`include.path` recusados para fora do repo **e** para dentro do workspace editável.
- **D4:** `GIT_NO_LAZY_FETCH` no agente: risco aceito (`git log -p` em partial clone).
- **D5:** VT em job próprio, sem checkout, `permissions: {}`, environment `release`; lookup por hash antes do upload; falha → "scan pendente".
- **D6:** pre-release para `v0.*` ou sufixo; notas do CHANGELOG via `--notes-file`; sem seção → job falha.
- **D7:** H07.4 com ação nova `abrirSessao`, `isUuid` em `src/shared/lib/ids.ts`, fallback para o fim da lista.

## Candidatas para o planning (backlog)
<o PO prioriza; itens herdados da Sprint 06 e do hotfix>

1. **Testes de componente dos parciais da H06.2/H06.3** (anotados na `sprint-06.md`): alvo ≥ 24 px do fechar, `role`/foco, lembrete "Abrir na agenda", layout e `prefers-reduced-motion`, "Copiar detalhes", sem toast duplicado + "Ver no chat", "Tentar de novo" desabilitado e composer intacto.
2. **T38 — repositório embutido (gitlink sem `.git/modules`)** com controle positivo: o teste já existe na cópia local de `tests/integration/git-exec.test.ts` (sem commit; passa com o código da v0.6.1).
3. **Achados baixos da Sec no hotfix:** `GIT_NO_LAZY_FETCH` no env do agente (partial clone já confiado), teste de timeout da inspeção, teste de `core.worktree` com git real.
4. **"Ver no chat" abrindo a sessão do erro** quando não é a ativa (`navegar` com `sessionId` UUID): exige TL e Sec.
5. **UI para `AskUserQuestion`** (ficou fora da lista branca na H06.10 por não ter tela de resposta).
6. **Automação do release:** pre-release e notas do CHANGELOG direto no `release.yml` (trilha rápida, Sec revisa); VirusTotal pela API no CI com resultado nas notas do rascunho (história: DevOps + Sec, secret criado pelo usuário). Publicar continua com aprovação explícita.
7. **Could da Sprint 06:** T47 "Alternar tema" na paleta; T48 sino com o histórico de notificações.
8. **Comunidade** (H06.6 pgTAP no CI e o resto): fica para depois, por decisão do usuário.

## Trilha rápida (sem debate, ver `docs/squad.md`)
| Item | Dono | Gatilho de segurança | Status |
|---|---|---|---|
| TR1 — `release.yml` marca pre-release e preenche as notas a partir do CHANGELOG (publicar continua manual) | DevOps | sim (release) → Sec revisa | ✅ (aguarda PR) |
| TR2 — commit do teste T38 (vai junto com a H07.3) | Back | não | ✅ |
| T47 "Alternar tema" na paleta; T48 sino com histórico (desenho do UX, consultado) — entraram por decisão do usuário | Front | não | ✅ (aguarda PR) |

## Tarefas (Tech Lead)
<uma linha por célula; detalhe no commit, no teste ou no ADR>

| Tarefa | Papel | Status |
|---|---|---|
| T49 H07.3: `GIT_NO_LAZY_FETCH=1` em `agentEnv` (`gitproc.ts`) + unit | Back | ✅ |
| T50 H07.3: timeout injetável em `exec`/`execCode` (`gitcore.ts`), motivo "tempo esgotado", teste com binário fake | Back | ✅ |
| T51 H07.3: `core.worktree`/`include.path` fora do repo ou dentro do workspace → risco (`gitconfig.ts`), unit + git real | Back | ✅ |
| T52 H07.3: hook não-`.sample` em `.git/hooks` → risco no gate + teste | Back | ✅ |
| T53 H07.3 (TR2): commit do T38 (gitlink) em `git-exec.test.ts` | Back | ✅ |
| T54 H07.4: `isUuid` em `src/shared/lib/ids.ts` + ação `abrirSessao` na notificação de erro + unit | Front | ✅ |
| T55 H07.4: abrir sessão, `data-item-id` + scroll (fallback fim), aviso de recusa, sessão ativa igual | Front | ✅ |
| T56 H07.2: `data-testid` nos botões + regra pura do erro em `lib/notifications.ts` com unit | Front | ✅ |
| T57 H07.2: E2E fechar ≥ 24 px/role/foco, reduced-motion, "Abrir na agenda" | QA | ✅ |
| T58 H07.2: E2E erro do chat (1 toast, "Copiar detalhes", "Tentar de novo", composer) | QA | ✅ |
| T59 TR1: `scripts/release-notes.mts` + unit; `--prerelease` e `--notes-file` no `release.yml` | DevOps | ✅ |
| T60 H07.5: job VT (hash → upload_url → polling, "scan pendente") e resultado nas notas | DevOps | ✅ |
| T61 Emendas ADR-018 (D2–D4) ✅, ADR-019 (D5–D6) ✅, ADR-021 (D7; a ata dizia ADR-014) ✅; CHANGELOG 0.7.0; READMEs | TL | ⏳ |

## Riscos aceitos
- D4: com `GIT_NO_LAZY_FETCH` no agente, `git log -p` pode falhar em partial clone.
- D5: o instalador enviado ao VirusTotal fica público (projeto é aberto).

## Pendências com o usuário
- T26: roteiro manual com a sessão OAuth realmente expirada no app instalado.
- Diálogos nativos no tema claro e lista branca de tools no app instalado (H06.10).
- Ata/planning da Sprint 07 feito no outro computador, se existir.
- ~~H07.5: environment `release` e secret `VT_API_KEY`~~ ✅ criados pelo usuário em 2026-11-26 (conferido pela API: política `tag:v*.*.*`, secret só no environment).

## QA e security review (resumo de [`sprint-07/qa.md`](sprint-07/qa.md))
| História | QA | Security |
|---|---|---|
| H07.1 | ✅ integração com git real, com controle positivo | ✅ libera; 2 bypass achados e corrigidos no PR; 3 baixas → candidatas |
| H07.3 | ✅ git real com controle positivo em cada caso | ✅ libera; 3 médias e 2 baixas corrigidas na história |

## Entregas
- **v0.6.1 (hotfix, 2026-11-26):** tag `v0.6.1` em `de6f7a4` (merge do PR #9). [Run 45738700736](https://github.com/flavsjr/devdeck/actions/runs/45738700736) verde: `DevDeck-Setup-0.6.1.exe` (SHA-256 `6ae236039a2d2f7cf60c36807a39be2cfe86b1e4f5f697e02b54af98156bfeb2`), `SHA256SUMS.txt` e attestation. [VirusTotal](https://www.virustotal.com/gui/file/6ae236039a2d2f7cf60c36807a39be2cfe86b1e4f5f697e02b54af98156bfeb2): **0/55** (usuário, 2026-11-26). Notas do rascunho preenchidas a partir do CHANGELOG; publicado como pre-release em 2026-11-26 12:01 UTC, com aprovação do usuário.

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
