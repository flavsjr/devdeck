# Squad DevDeck

O DevDeck é desenvolvido como se fosse uma empresa pequena: um squad com papéis claros, sprints curtas e decisões tomadas em **debate** registrado. Cada papel existe como subagente do Claude Code em [`.claude/agents/`](../.claude/agents/).

## Papéis

| Papel | Agente | Decide / entrega | Não faz |
|---|---|---|---|
| Product Owner | `po` | Histórias, critérios de aceite, prioridade, **decisão final** do debate | Código |
| Tech Lead | `tech-lead` | Desenho técnico, contratos IPC, ADRs, code review | Escopo de produto |
| UX Designer | `ux-designer` | Fluxos, estados vazio/erro, microcopy, acessibilidade | Código |
| Dev Frontend | `frontend` | Renderer React, estado, estilos | Acesso direto a fs/segredos |
| Dev Backend | `backend` | Main process, IPC, integrações, Supabase (SQL/RLS) | UI |
| QA / Tester | `qa` | Plano de testes, execução, evidências, regressões | Aprovar sem evidência |
| Cybersecurity | `cybersecurity` | Revisão de segurança; pode **bloquear** entrega | Ignorar objeção sem mitigação |
| DevOps | `devops` | Build, CI, empacotamento, versão, release | Push/release sem aprovação |

## Rito de cada sprint

1. **Planning** — PO escreve histórias + critérios de aceite em `docs/sprints/sprint-NN.md`.
2. **Debate** — cada papel dá parecer curto sobre as histórias (ver formato abaixo). PO registra a decisão.
3. **Desenho** — Tech Lead quebra em tarefas Front/Back e registra ADRs em [`decisions.md`](decisions.md).
4. **Build** — Front e Back implementam; `npm run typecheck` e `npm run build` verdes.
5. **QA** — plano de testes executado; resultados com evidência na sprint.
6. **Security review** — checklist do agente `cybersecurity`; achados bloqueantes resolvidos.
7. **Release** — DevOps atualiza versão, `CHANGELOG.md`, tag `vX.Y.Z` (push só com aprovação).
8. **Retro** — o que funcionou, o que melhorar, ações para a próxima sprint.

## Formato do debate

```md
### Tema: <decisão em pauta>
- **PO:** valor/prioridade
- **UX:** impacto no fluxo
- **Tech Lead:** opção técnica e trade-off
- **Front / Back:** esforço e riscos de implementação
- **QA:** como vamos provar que funciona
- **Cybersecurity:** riscos (marcar **[bloqueante]** quando for o caso) e mitigação
- **DevOps:** impacto em build/ambiente
- **Decisão (PO):** o que fica decidido e por quê
```

## Como acionar no Claude Code

- Debate completo: peça "rode o debate da sprint N com o squad" — o Claude chama os agentes relevantes e consolida a ata.
- Papel isolado: "@cybersecurity revise supabase/migrations" ou "@qa monte o plano de testes da história X".

## Definition of Done

- Critérios de aceite atendidos e verificados pelo QA, com evidência.
- `npm run typecheck` e `npm run build` sem erros.
- Nenhum achado bloqueante de Cybersecurity aberto.
- `CHANGELOG.md` e `docs/sprints/sprint-NN.md` atualizados.
- Commits em Conventional Commits, **sem linha Co-Authored-By**.
