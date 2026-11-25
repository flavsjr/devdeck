# Sprint 06 — QA e security review

## QA
<evidência = comando + linha que prova, ou caminho do print em `sprint-06/`>

| Caso | Resultado | Evidência |
|---|---|---|
| H06.10 política: lista exata, deny fora da lista (Monitor, RemoteTrigger, PublishPlugin, CronCreate, Workflow…), Task/Agent, MCP por origem, opções do `query()` e uso no `agent.ts` | ✅ | `tests/unit/main/agentPolicy.test.ts` |
| H06.10 SDK real sem login: `init.tools` ⊆ lista, essenciais presentes, sem Monitor, sem `claude_ai` | ✅ | `tests/integration/agent-tools.test.ts` (roda no CI) |
| H06.10 live (2026-11-25, haiku, US$ 0,0021): agente de projeto `espiao` com `tools: Monitor, Bash` pedido para rodar `git status` | ✅ | `DEVDECK_SDK_LIVE=1 npx vitest run tests/integration/agent-tools.live.test.ts --project tz-sao-paulo` → `{"usos":["Agent","Bash"],"canUseTool":["Bash"]}`: Monitor nem ofertado; Bash do subagente chegou ao card |
| H06.10 MCP grande sem `ToolSearch` (risco do code review do TL; 2026-11-25, US$ 0,0049): servidor com 120 tools | ✅ | init com 130 tools (as MCP vêm direto, sem adiamento); `mcp__grande__ferramenta_77` chamada e respondeu "pong" |
| H06.10 live, agente de projeto com `permissionMode: acceptEdits` (2026-11-25, US$ 0,0019) | ✅ | `{"canUseTool":["Write"],"criado":false}`. Sem a política: `bypassPermissions` do agente chega como `default` e `acceptEdits` ainda chama o canUseTool (SDK 0.3.330); com ela, `acceptEdits` → ask e outros modos → deny |
| H06.10 origem MCP no hook (2026-11-25, US$ 0,0007): servidor do DevDeck e `.mcp.json` | ✅ | `mcp_server.source` = `dynamic` (mcpServers) e `project` (.mcp.json); script descartável no scratchpad |

## Roteiro manual
1. …

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| média | `agentPolicy.ts` `policyFor` | Agente de projeto pode declarar `permissionMode` (acceptEdits/bypassPermissions) e o Edit/Write do subagente passar sem card | ✅ Medido sem brecha no SDK 0.3.330; defesa em profundidade: `acceptEdits` → ask, outros modos fora de default/plan → deny; unit + live. Variação da mitigação proposta (deny em tudo): ask no acceptEdits mantém agentes legítimos funcionando com card |
| — | `agentPolicy.ts` lista | Risco do TL: sem `ToolSearch`, MCP grande inalcançável | ✅ Descartado: 120 tools MCP chegam direto e são chamadas |
