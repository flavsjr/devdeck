# Sprint NN — <tema>

**Período:** AAAA-MM-DD → AAAA-MM-DD · **Versão alvo:** vX.Y.Z · **Status:** planejada | em andamento | concluída

> Painel vivo da sprint. Ata do debate em `sprint-NN/ata.md` (modelo `_template-ata.md`); QA e security review em `sprint-NN/qa.md` (modelo `_template-qa.md`); evidências em `sprint-NN/`. Regras de tamanho em `docs/squad.md` → "Economia de contexto".

## Objetivo
<uma frase>

## Histórias (PO)

### HNN.1 — <título> · Must | Should | Could · P | M | G
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

## Decisões (resumo da ata)
- <uma linha por decisão do PO; o debate completo fica em `sprint-NN/ata.md`>

## Trilha rápida (sem debate, ver `docs/squad.md`)
| Item | Dono | Gatilho de segurança | Status |
|---|---|---|---|

## Tarefas (Tech Lead)
<uma linha por célula; detalhe no commit, no teste ou no ADR>

| Tarefa | Papel | Status |
|---|---|---|

## Riscos aceitos
- …

## Pendências com o usuário
- …

## QA e security review (resumo de `sprint-NN/qa.md`)
| História | QA | Security |
|---|---|---|

## Entregas
- …

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
