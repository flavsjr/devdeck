# Sprint 08 — QA e security review

## QA
<evidência = comando + linha que prova, ou caminho do print em `sprint-08/`>

| Caso | Resultado | Evidência |
|---|---|---|

## Roteiro manual
1. T71: no app instalado, com a sessão OAuth do Claude realmente expirada, enviar uma mensagem → card "Sua sessão do Claude expirou" com "Usar chave da API", "Como entrar de novo" e "Tentar de novo" (prints em `sprint-08/`).
2. T72: tema claro no app instalado → diálogos nativos (abrir pasta, confirmar exclusão de chat, confiança no git) legíveis e no tema.
3. T73: app instalado → o chat só oferece as tools da lista branca (H06.10); conectores do claude.ai não aparecem.

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| BLOQUEANTE (planning) | H08.1 entrada do modelo | M1: input do `AskUserQuestion` sem limites | critério + T62 |
| BLOQUEANTE (planning) | H08.1 IPC | M2: resposta pelo mesmo canal da aprovação, com chaves do renderer | D1/D2 + T63 |
| BLOQUEANTE (planning) | H08.1 `canUseTool` | M3: pergunta caindo no ramo genérico/auto-allow | critério + T63 |
| BLOQUEANTE (planning) | H08.5 IPC | M5: renderer mandando conteúdo em vez de índices | critério + T66/T67 |
| BLOQUEANTE (planning) | H08.5 prévia | M6: seleção sobre prévia truncada | critério + T67 |
| BLOQUEANTE (planning) | H08.5 corrida | M7: arquivo muda entre a prévia e a decisão | critério + T67 |
