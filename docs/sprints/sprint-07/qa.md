# Sprint 07 — QA e security review

## QA
<evidência = comando + linha que prova, ou caminho do print em `sprint-07/`>

| Caso | Resultado | Evidência |
|---|---|---|
| H07.1: submódulo com `ignore=none` no `.gitmodules`, no `.git/config` do pai, só no index e só no HEAD — o ambiente da v0.6.0 roda o filtro, o novo não | ✅ | `tests/integration/git-exec.test.ts` (git 2.50.1, controle positivo) — PR #9 |
| H07.1: repositório embutido e `gitdir:` externo; partial clone com blob ausente | ✅ | mesmo arquivo — PR #9 |
| H07.1: `typecheck`, 1.864 testes, `build`, E2E de confiança no git | ✅ | PR #9 |
| v0.6.1: instalador do release = build atestado; VirusTotal 0/55 | ✅ | `SHA256SUMS.txt`, attestation pela API, link na `sprint-07.md` |
| H07.3: T38 repositório embutido (gitlink e `gitdir:` externo), com controle positivo | ✅ | `git-exec.test.ts` — "repositório embutido…" |
| H07.3: `GIT_NO_LAZY_FETCH=1` no env do agente (liberado e pausado, sem herdar `0`) | ✅ | `gitproc.test.ts` — "agente: sem GIT_* herdado…" |
| H07.3: inspeção com timeout de 1 ms termina, motivo "tempo limite", incompleta, sem confiança; controle com tempo folgado | ✅ | `git-exec.test.ts` — "inspeção que passa do tempo limite…" |
| H07.3: `core.worktree` fora (absoluto e relativo), subpasta, junction no `.git` → bloqueia; raiz → só confiança; controle: `rev-parse --show-toplevel` do agente dá a pasta de fora | ✅ | `git-exec.test.ts` + `gitconfig.test.ts` |
| H07.3: `include.path` no workspace, fora, link pendente → bloqueia; dentro do `.git` → só nesta execução; controle: git puro lê a chave incluída | ✅ | idem |
| H07.3: `pre-commit` em `.git/hooks` pausa e aparece; só `.sample` não; editar o hook muda assinatura e hash; controle: commit do agente roda o hook | ✅ | `git-exec.test.ts` — "hook pre-commit…" |
| H07.3: bloqueado não passa com confiança gravada nem da sessão | ✅ | `gitconfig.test.ts` — "gitAllowedBy" |
| H07.3: `typecheck`, `npm test` (1.914), `build` | ✅ | local, 2026-11-26 |
| H07.2: fechar com alvo 24 × 24 px, `role="button"` e nome "Fechar notificação"; notificação nova não rouba o foco; Tab chega ao fechar com `:focus-visible` e contorno; Enter fecha e o foco volta à origem (nunca ao `<body>`) | ✅ | `node tests/e2e/notifications.e2e.mjs` → "Notificações: tudo ok" (3 rodadas) |
| H07.2: `prefers-reduced-motion` → `animation-name: none`, 0 animações na pilha; controle: sem ele, `notify-entrada` | ✅ | mesmo E2E (`emulateMedia`) |
| H07.2: lembrete real (evento salvo por `window.deck.agenda.save`, agendador do main) → toast info com "Abrir na agenda" → aba Agenda; título com `<img>` vira texto | ✅ | mesmo E2E; `isFocused` forçado só no processo de teste (o main manda a nativa sem foco) |
| H07.2: erro do chat (401) com o chat na tela → só o card; em outra aba → 1 toast "Erro no chat" com "Ver no chat", sem repetir ao voltar e sair | ✅ | mesmo E2E + `notifications.test.ts` — "aviso do erro do turno (H07.2)" (7 casos da regra pura `avisoErroDoTurno`) |
| H07.2: "Copiar detalhes" copia o mesmo texto do `<pre>` (CRLF normalizado; clipboard de quem roda é guardado e devolvido) | ✅ | mesmo E2E |
| H07.2: "Tentar de novo" não reenvia sozinho (0 pedidos em 3 s); durante o turno nenhum botão disponível (o botão sai do card antigo; `aria-disabled` é defesa extra, não alcançável no fluxo real); rascunho do composer intacto durante e depois; controles: o clique reenvia e o card novo volta a oferecer o botão | ✅ | mesmo E2E (`setAtraso` no servidor falso) |
| H07.2: `typecheck`, `npm test` (1.942), `build` | ✅ | local, 2026-11-26 |
| H07.4: erro em sessão não ativa → toast "Erro no chat \"B\": …" com "Ver no chat" → seleciona B e o card do erro fica na vista; controle: abrindo B pela barra lateral (6 turnos depois do erro) o card fica fora da vista | ✅ | `node tests/e2e/notifications.e2e.mjs` → "Notificações: tudo ok" (3 rodadas, a última depois das ressalvas do TL) |
| H07.4: sessão excluída antes do clique → aviso "O chat deste erro não existe mais.", continua na sessão ativa | ✅ | mesmo E2E |
| H07.4: `sessionId` não UUID (vazio, `s1`, `../x`, com espaço, número, null) recusado mesmo "existindo" na lista; UUID fora da lista → inexistente; `itemId` inválido só perde o alvo; item que sumiu → fim da lista | ✅ | `notifications.test.ts` — "\"Ver no chat\" de outra sessão (H07.4)"; `tests/unit/shared/ids.test.ts` |
| H07.4: erro da sessão ativa em outra aba continua `navegar: chat` | ✅ | `notifications.test.ts` — "aviso do erro do turno (H07.2)" |
| H07.4: TL aprova com ressalvas, todas aplicadas: o `seq` também protege a navegação (`openSession` com `vale`), `rolarPara` de outra sessão é descartado, falha do `load` mostra o erro real; `typecheck`, `npm test` (1.966), `build` | ✅ | local, 2026-11-26 |
| H07.5: `vt-scan` — sem chave → pendente sem pedido; conhecido → só lookup; desconhecido → upload pelo `upload_url` + polling (60 s, depois 20 s; ≤ 28 consultas em 10 min); 429 no polling espera; 401/403/500/rede → "api", 429 → "cota"; id de análise ou stats estranhos → pendente | ✅ | `tests/unit/scripts/vt-scan.test.ts` |
| H07.5: chave só no `x-apikey`, nunca na URL nem no log; `redirect: 'error'` em todo pedido; `upload_url` de outra origem (host parecido, http, `user@`) → pendente sem enviar o arquivo | ✅ | idem |
| H07.5: servidor real em 127.0.0.1 — upload multipart com o arquivo; redirect recusado pelo fetch (servidor vê 1 pedido); resposta > 2 MiB → pendente | ✅ | `tests/integration/vt-scan.test.ts` |
| H07.5: notas — "N de T" + link pelo sha do SHA256SUMS + aviso de amostra pública; pendente com motivo fechado; sha diferente, contagem não inteira, total zero, motivo desconhecido, vt.json ausente ou > 64 KiB → "ausente ou inválido"; nada de texto do VT entra | ✅ | `release-notes.test.ts` — "seção do VirusTotal (H07.5)" + smoke local do CLI |
| H07.5: guarda do workflow — `VT_API_KEY` só no job `scan`, `environment: release`, `contents: read`, checkout esparso sem credencial, sem npm; release com `needs: [build, scan]` e build obrigatório; controle: `contents: write` no scan faz o guarda falhar | ✅ | `tests/unit/scripts/release-workflow.test.ts` |
| H07.5: environment `release` no GitHub com política `tag:v*.*.*` e `VT_API_KEY` só nele (não no repositório) | ✅ | `gh api …/environments` e `…/secrets` (só nomes), 2026-11-26 |
| H07.5: prova real (VT respondendo, rascunho com o link) | ⏳ | primeira tag da v0.7.0 |
| E2E: lembrete da agenda falhou 1 vez em 5 rodadas com espera de 45 s (agendador a cada 30 s); espera subiu para 70 s e o teste imprime diagnóstico se falhar | ⚠️ observar | mesmo E2E |

## Roteiro manual
1. …

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| (bypass) | gate do `.gitmodules` | `.gitmodules` só no index/HEAD não era lido | ✅ corrigido no PR #9 (index → HEAD com `config --blob`) |
| (bypass) | leitura do blob | lazy fetch em partial clone rodaria `core.sshCommand` | ✅ corrigido no PR #9 (`GIT_NO_LAZY_FETCH`, `protocol.allow=never`) |
| baixa | env do agente | `GIT_NO_LAZY_FETCH` não está no env do agente (só importa em partial clone já confiado) | → candidata da Sprint 07 |
| baixa | inspeção | sem teste de timeout da inspeção | → candidata da Sprint 07 |
| baixa | `core.worktree` | sem teste com git real | → candidata da Sprint 07 |

Veredito da Cybersecurity no PR #9: libera.

### H07.3 (2026-11-26)
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| média | `readHooks` / hash | hook link ou > 1 MiB entrava no hash só como "não-arquivo" com confiança gravada | ✅ vale só nesta execução |
| média | `resolveGitPathValue` | `%(prefix)/`, `~usuario/`, `:(optional)`, `C:x` caíam em "dentro do `.git`" | ✅ viram "fora" (bloqueia) |
| média | `pathTargetsOf` | `core.worktree` por junction no `.git` que hoje dá na raiz era aceito | ✅ texto e realpath precisam dar na raiz |
| baixa | `realOrLexical` | link pendente no `.git` classificado como `.git` | ✅ parte que existe e não resolve → fora |
| baixa | timeout | inspeção incompleta aceitava confiança da sessão | ✅ incompleta não aceita confiança |
| aceito (D4) | env do agente | `GIT_NO_LAZY_FETCH` quebra `git log -p` em partial clone | documentado no ADR-018 e no CHANGELOG |

Veredito da Cybersecurity na H07.3: libera (médias corrigidas na própria história).
| — | H07.4 `abrirSessao` | Sec: libera. `sessionId` passa por `isUuid` + lista de sessões e o `agent:load` revalida com zod no main; `itemId` precisa ser UUID, existir em `items` e passa por `CSS.escape`; nenhuma ação nova aprova ou executa; nenhum canal IPC novo | — |
| baixa | `abrirSessaoDoAviso` | `refreshSessions` a cada clique em sessão inexistente (leitura local) | aceito, sem ação |
| — | H07.5 desenho | Ajuste do D5 ("sem checkout" → checkout esparso do script, testável): Sec aceita com 5 condições (contents: read; redirect: 'error'; origem exata do upload_url; base só por parâmetro; chave só do env, sem log sensível, teto de resposta) | ✅ cumpridas (review final) |
| baixa | `release.yml` scan | pior caso upload 10 min + polling 10 min passava do `timeout-minutes: 20` (motivo viraria "inválido") | ✅ 30 min (também pedido da DevOps) |
| baixa | `release-notes.mts` | `readFileSync` do vt.json sem teto | ✅ só lê até 64 KiB |
| — | `vt-scan.mts` main | DevOps: falha local (hash/leitura) não gravava vt.json | ✅ grava pendente/api |
