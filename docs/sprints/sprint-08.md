# Sprint 08 — O agente pergunta, e a aprovação fica por trecho

**Período:** 2026-11-27 → a definir · **Versão alvo:** v0.8.0 · **Status:** planejada

> Painel vivo da sprint. Ata em `sprint-08/ata.md`; QA e security review em `sprint-08/qa.md`; evidências em `sprint-08/`. Regras de tamanho em `docs/squad.md` → "Economia de contexto".

## Objetivo
O agente passa a perguntar ao usuário em múltipla escolha (`AskUserQuestion`), a aprovação de edição pode ficar só com parte do diff, e a suíte E2E fica estável e sem efeitos colaterais.

## Histórias (PO)

### H08.1 — UI para `AskUserQuestion` · Must · G
*Como dev no chat, quero responder às perguntas de múltipla escolha do agente, para que ele peça decisões em vez de supor.*
- [ ] Dado que o agente chama `AskUserQuestion`, quando a chamada chega, então o chat mostra um cartão inline com cada pergunta (cabeçalho, texto, opções com descrição, "Escolha uma ou mais" no multiSelect) e "Outro" com texto livre; o painel direito mostra só o atalho "Claude perguntou" (D4).
- [ ] Dado que escolho (uma ou várias) e clico "Responder" ou Ctrl+Enter, então o renderer manda só índices ou o texto do "Outro" por `agent:answer`, o main monta `answers` a partir da própria cópia das perguntas e o turno continua (D1, D2).
- [ ] Dado "Pular", fechar a sessão ou interromper, então o agente recebe `deny` com texto fixo e não trava (D3, M3).
- [ ] Dado entrada do modelo fora dos limites (> 4 perguntas, fora de 2–4 opções, campo > 1000 caracteres, campo desconhecido), então o main recusa com `deny` fixo antes de emitir o cartão; caracteres de controle e bidi são removidos (M1).
- [ ] `AskUserQuestion` na lista branca (emenda ADR-022), nunca em "Sempre", nunca auto-allow; `decide()` recusa `kind: 'question'` e `agent:answer` recusa os outros kinds (M2, M3). Unit do zod, da lista e da separação de canais.
- [ ] Cartão só texto (sem markdown nem link), visualmente distinto do card de aprovação, com "não cole segredos"; título truncado na notificação; resposta passa por `redact` antes de gravar (M4).
- [ ] Depois de respondido: resumo somente leitura ("Você respondeu: …" / "Você pulou"). Não rouba o foco do composer; chegada em `role="status"`.
- [ ] E2E: pergunta → resposta → continuação do turno no servidor falso (`tool_use` + 2º turno que confere o `tool_result`).

#### Checklist de ameaça
N/A: não toca git nem execução de processo. Superfície nova é IPC com entrada do modelo (coberta por M1–M4 e pelo security review).

### H08.5 — Aprovação parcial por trecho (hunk) · Could · M+
*Como dev, quero aprovar ou recusar trechos do diff, para aceitar só parte da edição do agente.*
- [ ] Dado Edit sem `replace_all` ou Write com prévia completa, quando o card abre, então todos os trechos vêm marcados e o primário é "Aprovar selecionados (N de M)".
- [ ] Dado zero marcados, então "Aprovar selecionados" fica `aria-disabled` com a dica "Marque ao menos um trecho ou rejeite".
- [ ] Dado seleção parcial, então "Aprovar todas da sessão" fica desabilitado.
- [ ] Dado `approve: true`, então o renderer envia só `hunks: number[]` (únicos, ≤ 500, no intervalo); qualquer outro formato é recusado pelo zod (M5).
- [ ] Dado todos os trechos marcados, então o resultado é igual ao `after` (teste com CRLF e sem newline final) (M5).
- [ ] Dado `previewPartial`, `previewError`, NotebookEdit ou `replace_all`, então não há seleção, só aprovação total (M6).
- [ ] Dado que o arquivo mudou entre a prévia e a decisão, então `deny` "o arquivo mudou, peça de novo"; senão Edit aplica com `old_string = before`, `new_string = after'` (M7).
- [ ] Dado aprovação parcial, então `PendingChange.after = after'`, "Reverter" restaura o `before` exato e o modelo recebe o aviso dos trechos descartados por `PostToolUse` `additionalContext` (M8, D6).
- [ ] Teclado: J/K navegam entre trechos e Espaço alterna, só com o foco no diff; Alt+A aprova os marcados.

#### Checklist de ameaça
N/A: não toca git nem execução de processo. Escrita em arquivo só depois da aprovação, recalculada no main (M5–M8, ADR-023).

### H08.2 — Estabilizar o E2E do lembrete da agenda · Should · P (trilha rápida)
- [ ] 10 rodadas seguidas sem falha, ou causa raiz registrada.
- [ ] Diagnóstico só no log em caso de falha.

### H08.3 — `theme.e2e.mjs` só grava capturas com variável de ambiente · Should · P (trilha rápida)
- [ ] Sem a variável, `git status` limpo depois da rodada.
- [ ] Com a variável, regrava `docs/sprints/sprint-06/tema-claro/`.
- [ ] Uma linha na documentação dos E2E.

### H08.4 — Conferir o VirusTotal da v0.7.0 · Should · P (trilha rápida, sem código)
- [ ] Resultado do scan (ou motivo do "pendente") registrado no `qa.md`.
- [ ] Falha do workflow vira correção P.

## Convocação (PO)
| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| H08.1 | Back | Front, UX, QA, TL (ADR), Sec (veto) | lista branca de tools + IPC novo com entrada do modelo |
| H08.5 | Back | Front, UX, QA, TL (ADR-023), Sec (veto) | escrita em arquivo depois da aprovação |
| H08.2, H08.3 | QA | TL | sem gatilho |
| H08.4 | DevOps | Sec só se mexer no pipeline | supply chain |

**Não convocados (sem tarefa nesta sprint):** nenhum fora dos acima.

## Decisões (resumo da ata)
- **D1:** canal próprio `agent:answer [uuid, answerSchema]`, só para `kind: 'question'`; `decide()` recusa esse kind (M2 da Sec).
- **D2:** renderer manda índices ou "Outro" (≤ 2000); o main monta `answers` da cópia dele.
- **D3:** botão de recusa "Pular", com ajuda "Pular avisa o Claude que você preferiu não responder."
- **D4:** cartão inline no chat; painel direito só com atalho "Claude perguntou".
- **D5:** M1 (zod com limites), M3 (antes do ramo genérico, nunca auto-allow, sem resposta → deny) e M4 (só texto, visual distinto, aviso de segredo, título truncado, redact) obrigatórias.
- **D6:** H08.5 segue M5–M8 da Sec; ADR-023 obrigatório; aviso ao modelo por `PostToolUse` `additionalContext`; UX proposta (todos marcados, J/K/Espaço).
- **D7:** corte H08.5 → H08.3 → H08.2; as pendências manuais bloqueiam o fechamento e ficam fora da ordem de corte (decisão do usuário).

**Ordem de corte:** H08.5 → H08.3 → H08.2. H08.1 e H08.4 não saem.

## Trilha rápida (sem debate, ver `docs/squad.md`)
| Item | Dono | Gatilho de segurança | Status |
|---|---|---|---|
| H08.2 — E2E do lembrete estável | QA | não | ⏳ |
| H08.3 — capturas do tema só com env | QA | não | ⏳ |
| H08.4 — VirusTotal da v0.7.0 no `qa.md` | DevOps | só se mexer no release | ⏳ (aguarda o run da tag) |

## Tarefas (Tech Lead)
| Tarefa | Papel | Status |
|---|---|---|
| T62 H08.1: `src/main/lib/askQuestion.ts` — zod da entrada (M1: limites, campos fora, controle/bidi removidos) e da resposta (índices/"Outro"), `buildAnswers` da cópia do main; `AskUserQuestion` na lista sem "Sempre"; unit | Back | ⏳ |
| T63 H08.1: `ApprovalKind 'question'`, canal `agent:answer` (`handle()` + zod), `decide()` recusa `question`, tratamento antes do ramo genérico, deny sem resposta, `redact` na resposta | Back | ⏳ |
| T64 H08.1: cartão inline (fieldset/legend, rádio/checkbox, "Outro", Responder/Pular, Ctrl+Enter, resumo depois), atalho no painel, título truncado na notificação | Front | ⏳ |
| T65 H08.1: servidor falso com `tool_use` + 2º turno conferindo o `tool_result`; E2E pergunta → resposta → continuação; Pular → deny | QA/Back | ⏳ |
| T66 H08.5: `src/shared/lib/hunks.ts` — `splitHunks`/`applyHunks` (CRLF, sem newline final, todos = `after`); unit em `tests/unit/shared/` | Back | ⏳ |
| T67 H08.5: `hunks?: number[]` no zod do approve; main relê o arquivo (M7), recalcula `after'`, Edit com `old_string=before`; desligado em M6; `PendingChange.after`; aviso por `PostToolUse` | Back | ⏳ |
| T68 H08.5: checkbox por trecho nos dois modos de diff, contagem `aria-live`, "Aprovar selecionados (N de M)", J/K/Espaço, "Aprovar todas" desabilitado com parcial | Front | ⏳ |
| T69 H08.5: E2E de aprovação parcial (disco = `before` + aceitos; Reverter; arquivo mudou → deny) | QA | ⏳ |
| T70 Emenda ADR-022 (H08.1), ADR-023 nova (H08.5); CHANGELOG 0.8.0; READMEs | TL | ⏳ |
| T71 Manual: T26 (sessão OAuth realmente expirada no app instalado, prints) | Usuário | ⏳ bloqueia o fechamento |
| T72 Manual: diálogos nativos no tema claro no app instalado | Usuário | ⏳ bloqueia o fechamento |
| T73 Manual: lista branca de tools no app instalado (H06.10) | Usuário | ⏳ bloqueia o fechamento |

## Riscos aceitos
- H08.5: entre o allow e a escrita do SDK fica uma janela residual em que o arquivo pode mudar (Sec aceita; o Edit com `old_string = before` falha sozinho se o arquivo mudou).
- H08.5: o modelo pode tentar reaplicar um trecho recusado; com "Aprovar todas da sessão" ligado, isso passaria sem card (documentar no ADR-023).

## Pendências com o usuário
- T71–T73 (manuais, bloqueiam o fechamento).
- Publicar o rascunho da v0.7.0 depois de conferir notas, `SHA256SUMS.txt`, attestation e VirusTotal.

## QA e security review (resumo de [`sprint-08/qa.md`](sprint-08/qa.md))
| História | QA | Security |
|---|---|---|

## Entregas
- …

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
