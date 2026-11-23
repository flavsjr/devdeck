# Sprint 01 — MVP "VibeDeck" (fase 1)

**Período:** 2026-11-23 · **Versão:** v0.1.0 · **Status:** concluída

> Sprint registrada retroativamente: o processo de squad foi adotado na Sprint 02.

## Objetivo
Ter um hub local de vibe coding utilizável: chat com Claude sobre um workspace, MCPs, diff com aprovação e controle de custos.

## Histórias

### H01.1 — Chat com o agente no workspace
*Como dev, quero conversar com o Claude sobre a pasta do projeto para codar sem sair do app.*
- [x] Chat por workspace com streaming, histórico local e retomada (`resume`).
- [x] Botão Parar interrompe o turno.

### H01.2 — Diff com aprovação antes de aplicar
*Como dev, quero ver e aprovar cada edição para não perder o controle do código.*
- [x] `Edit`/`Write` param no painel de aprovação com diff unificado/lado a lado.
- [x] Aprovar, aprovar todas da sessão, pedir ajuste (feedback volta ao Claude), rejeitar.
- [x] Alteração aplicada vira card com **Reverter** (patch reverso, detecta conflito).

### H01.3 — Painel de MCPs
- [x] CRUD stdio/HTTP/SSE, ligar/desligar, testar conexão, política por tool, importar do Claude.

### H01.4 — Custos e métricas
- [x] Custo por turno/sessão/dia/mês/modelo, teto diário (alerta) e por sessão (`maxBudgetUsd`), uso de contexto.

### H01.5 — Flow
- [x] Embed do Spotify + timer 25/5.

## Decisões
Ver ADR-001 a ADR-004 em [`../decisions.md`](../decisions.md).

## QA
| Caso | Resultado | Evidência |
|---|---|---|
| Typecheck main/preload/renderer | ✅ | `npm run typecheck` sem erros |
| Build de produção | ✅ | `electron-vite build` |
| App abre e carrega workspace | ✅ | captura de tela em dev |
| Handshake do Agent SDK (sem chamada paga) | ✅ | `initializationResult()` lista modelos |
| Teste de conexão MCP stdio | ✅ | servidor mínimo com 1 tool listado |
| Turno real com o modelo | ⏳ | pendente de execução manual pelo usuário |

## Retro
- **Funcionou:** tipos do SDK lidos direto do pacote evitaram chute de API.
- **Melhorar:** `npm install` não rodou o postinstall do Electron nesta máquina — adicionado `postinstall` no projeto.
- **Ações:** adotar squad + sprints + changelog a partir da Sprint 02.
