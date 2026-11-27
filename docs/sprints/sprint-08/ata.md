# Sprint 08 — ata do debate

**Convocados:** PO, TL, Cybersecurity, UX (Front, Back e QA representados pelo desenho do TL e pelos critérios) · **Não convocados (sem tarefa):** DevOps só na H08.4 (trilha rápida)

Planning em 2026-11-27. O usuário escolheu a H08.5 (diff por trecho) como extra e decidiu que as pendências manuais bloqueiam o fechamento.

### D1/D2 — H08.1: canal e formato da resposta
- **TL:** `AskUserQuestion` passa pelo `canUseTool`; o host devolve `allow` com `updatedInput.answers` (`{[pergunta]: "rótulo1, rótulo2" | texto livre}`) ou `deny`. Propôs reaproveitar `agent:decide` com variante `{answer}` e o renderer mandando rótulos.
- **Sec (M2, BLOQUEANTE):** canal próprio `agent:answer [uuid, answerSchema]` que só resolve pending `kind: 'question'`; `decide()` recusa esse kind e vice-versa. O renderer manda índices de opção ou "Outro"; o main monta `answers` da cópia dele, nunca com chaves vindas do renderer.
- **Decisão (PO):** canal próprio e índices (D1, D2). A objeção cai com a mitigação registrada nos critérios e nas T62/T63.

### D3/D4 — H08.1: cartão
- **UX:** inline no chat, `section` + `fieldset/legend`, rádio ou checkbox, "Outro" que só habilita quando marcado, "Responder" (desabilitado até tudo respondido) e "Pular", Ctrl+Enter; não rouba o foco do composer; chegada em `role="status"`; depois vira resumo somente leitura. No painel direito só um atalho.
- **TL:** chamava o botão de "Cancelar".
- **Decisão (PO):** "Pular" com a ajuda "Pular avisa o Claude que você preferiu não responder." (D3); cartão inline + atalho no painel (D4).

### D5 — H08.1: entrada do modelo
- **Sec (M1, BLOQUEANTE):** zod no main antes de emitir o cartão: ≤ 4 perguntas, 2–4 opções, ≤ 1000 caracteres por campo, campos desconhecidos fora, controle/bidi removidos; inválido → `deny` fixo. **(M3, BLOQUEANTE):** tratamento antes do ramo genérico de `makeCanUseTool`, nunca `alwaysAllowed`/`NO_PATH`/auto-allow; sem resposta → `deny`. **(M4):** só texto, visual distinto do card de aprovação, aviso "não cole segredos", título truncado na notificação. **Média:** `redact` na resposta antes de gravar.
- **Decisão (PO):** M1, M3 e M4 obrigatórias (D5).

### D6 — H08.5: aprovação por trecho
- **TL:** só Edit sem `replace_all` e Write; `src/shared/lib/hunks.ts`; o main recompõe a edição; aviso ao modelo por `PostToolUse` `additionalContext` (maior risco: o modelo presumir a edição inteira); ADR-023. Tamanho M+.
- **Sec (M5–M7, BLOQUEANTES; M8):** main calcula os trechos de `before`/`after` completos e o renderer manda só `hunks: number[]` (únicos, ≤ 500, no intervalo, só com `approve: true`); teste de que todos os trechos = `after` (CRLF, sem newline final); sem seleção com prévia parcial, erro de prévia ou NotebookEdit; reler o arquivo na decisão e recusar se mudou; Edit com `old_string = before`; `PendingChange.after = after'`. Baixa: o modelo pode reaplicar o trecho recusado.
- **UX:** todos marcados por padrão, "Aprovar selecionados (2 de 5)" primário, zero marcados → `aria-disabled`, contagem `aria-live`, J/K/Espaço, "Aprovar todas da sessão" desabilitado com parcial.
- **Decisão (PO):** segue Sec + TL + UX; ADR-023 obrigatório (D6). Critérios finais na `sprint-08.md`.

### D7 — Escopo
- **TL:** H08.1 é G real (3–4 d; o servidor falso precisa de `tool_use` + 2º turno), H08.5 é M+ (2–3 d).
- **Decisão (PO):** H08.1 Must, H08.5 Could; corte H08.5 → H08.3 → H08.2; pendências manuais fora da ordem de corte e bloqueando o fechamento (decisão do usuário).

### Decisões rápidas
- H08.2, H08.3 e H08.4 na trilha rápida (TL revisa; Sec só se a H08.4 mexer no release).
