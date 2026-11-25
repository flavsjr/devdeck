# Sprint 06 — QA e security review

## QA
<evidência = comando + linha que prova, ou caminho do print em `sprint-06/`>

| Caso | Resultado | Evidência |
|---|---|---|
| H06.3/H06.7 E2E (T24, 2026-11-25): 401 com chave e Bearer falsos no corpo → "A chave da API foi recusada", um card por turno, axe sem serious/critical; 429/529/créditos → cards da H06.7 | ✅ | `node tests/e2e/auth-error.e2e.mjs` → "Erros do Claude: tudo ok" |
| H06.3 E2E (T24): nenhum valor falso na tela/HTML (com "Detalhes técnicos" aberto), no stdout/stderr do Electron nem nos arquivos do `--user-data-dir` | ✅ | mesmo E2E; controle positivo: o servidor falso respondeu 401 com os valores no corpo |
| H06.2 E2E (T25, 2026-11-25): conquista (1º turno no servidor falso), sucesso (salvar chave), aviso (nome de MCP inválido), info ("Nada novo para importar"), erro (MCP com `?token=`), axe na pilha a cada tipo; erro continua após 9 s | ✅ | `node tests/e2e/notifications.e2e.mjs` → "Notificações: tudo ok" (2 rodadas) |
| T25 achado: axe pegava `color-contrast` no meio da animação de entrada do cartão | ✅ teste ajustado | espera as animações da pilha terminarem antes do axe (falso positivo, intermitente) |
| T25 achado: erro persistente cobre "Importar do Claude" na aba MCP | ⚠️ → UX | registrado nos achados da sprint |
| H06.1 contraste: todos os pares AA (texto ≥ 4,5; foco/UI ≥ 3) nos dois temas, sinal do diff sobre o fundo da linha, branco sobre accent invertido no claro, todo semântico do escuro existe no claro | ✅ | `tests/unit/renderer/contrast.test.ts` |
| H06.1 `THEME_BG` × `--bg` dos dois temas | ✅ | `tests/unit/main/theme.test.ts` (o caso do claro deixou de ser pulado) |
| H06.1 E2E (2026-11-25): troca Escuro ↔ Claro sem recarregar, `getBackgroundColor()` = `--bg`, "Sistema (agora: X)" e fundo seguindo o Windows, persistência após reiniciar; axe sem serious/critical nos dois temas em 8 abas, paleta, ajuda, card de aprovação e "Git pausado" | ✅ | `node tests/e2e/theme.e2e.mjs` → "Tema claro: tudo ok"; capturas 1280×720 em `sprint-06/tema-claro/` |
| H06.1 achado do E2E: "Claude está trabalhando…" pulsava o texto até 1,9:1 (nos dois temas) | ✅ corrigido | `.thinking` saiu do legado; texto fixo, ponto pulsa |
| H06.1 achado do E2E: com Escuro/Claro forçado o renderer não vê o tema do Windows | ✅ corrigido | "(agora: X)" só aparece com "Sistema" marcado |
| H06.1 revisão TL + UX (2026-11-25): `--viz-heat-1` igual à célula vazia no claro (bloqueante do TL), `--viz-cat-3` 1,89:1, botão principal desabilitado ilegível, `if` duplicado no FlowCard | ✅ corrigido | heat 1→2 = indigo-2/indigo-10 (passo 1 × `--bg-3` = 1,30, igual ao escuro), cat-3 = amber-11 (6,69:1), `.btn.primary:disabled` neutro; testes novos de escala e de `--viz-cat-*` ≥ 3 nos dois temas |
| H06.1 revisão UX: fundo do composer no claro "vazado" | adiado → H06.5 | regra `.composer textarea` é do legado; mover agora faria a lista de exceções do `css-layers` crescer. Borda do campo já passa 3:1 |
| H06.1 falso positivo: Playwright emula `prefers-color-scheme: light` por padrão | — | `electron.launch({ colorScheme: null })`; registrado na emenda ao ADR-014 |
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
