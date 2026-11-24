# Sprint NN — <tema>

**Período:** AAAA-MM-DD → AAAA-MM-DD · **Versão alvo:** vX.Y.Z · **Status:** planejada | em andamento | concluída

## Objetivo
<uma frase>

## Histórias (PO)

### HNN.1 — <título>
*Como <persona>, quero <ação> para <valor>.*
- [ ] Dado … quando … então …

#### Checklist de ameaça (obrigatório se a história toca git ou execução de processo; senão "N/A: <motivo>")
| Superfície | Coberta? | Como (teste/arquivo) |
|---|---|---|
| Raiz do workspace (config, hooks, fsmonitor, filtros) | | |
| Repositório pai (GIT_CEILING_DIRECTORIES) | | |
| Submódulo (.git/modules) | | |
| Repositório embutido (gitlink sem .git/modules) | | |
| Worktree / `.git` como arquivo `gitdir:` | | |
| Binário no PATH (cwd e pastas do workspace fora) | | |
| Env herdada (GIT_*, proxies, loaders) | | |
| Processo do agente (mesma env? passa por aprovação?) | | |

Cada linha "sim" cita teste com controle positivo. O security review confere linha a linha.

## Convocação (PO)
| História | Dono | Envolvidos | Por quê |
|---|---|---|---|

**Não convocados (sem tarefa nesta sprint):** …

## Debate
<usar o formato de `docs/squad.md`: parecer só dos convocados → réplica só nos conflitos → decisão do PO>

### Decisões rápidas
- …

## Tarefas (Tech Lead)
| Tarefa | Papel | Status |
|---|---|---|

## QA
| Caso | Resultado | Evidência |
|---|---|---|

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|

## Entregas
- …

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
