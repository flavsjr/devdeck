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

1. **Planning** — PO escreve histórias + critérios de aceite em `docs/sprints/sprint-NN.md` e, para cada história, a **matriz de convocação** (quem trabalha nela).
2. **Debate** — só os papéis convocados dão parecer, e só sobre as histórias em que trabalham (ver "Quem participa" abaixo). Depois, uma rodada de réplica só para os conflitos. PO registra a decisão em `sprint-NN/ata.md`.
3. **Desenho** — Tech Lead quebra em tarefas Front/Back e registra ADRs em [`decisions.md`](decisions.md).
4. **Build** — Front e Back implementam; `npm run typecheck` e `npm run build` verdes.
5. **QA** — plano de testes executado; resultados com evidência em `sprint-NN/qa.md`.
6. **Security review** — checklist do agente `cybersecurity`; achados bloqueantes resolvidos.
7. **Release** — DevOps atualiza versão, `CHANGELOG.md`, tag `vX.Y.Z` (push só com aprovação).
8. **Retro** — o que funcionou, o que melhorar, ações para a próxima sprint.

## Trilha rápida

Bug, achado de revisão ou ajuste de tamanho **P** que não pede decisão de produto nem cria contrato novo (IPC, tabela, dependência de runtime) **não passa pelo debate**:

1. O orquestrador registra uma linha na tabela "Trilha rápida" da sprint: item, dono, gatilho de segurança (sim/não).
2. O dono implementa com teste. O Tech Lead revisa o diff.
3. Se tocar gatilho de segurança (lista em "Regras de convocação"), Cybersecurity revisa só o diff e registra achados na mesma linha.
4. Commit próprio; linha no `CHANGELOG.md` da versão da sprint.

Vira história normal (com debate) se: mudar comportamento visível de forma não óbvia, precisar de ADR, tiver trade-off entre papéis ou crescer além de P durante o trabalho.

## Economia de contexto

Cada subagente começa do zero e paga para reler tudo. Regras para o orquestrador e para os papéis:

- **Modelo por papel:** Tech Lead e Cybersecurity usam Opus (desenho e veto, onde erro custa caro); os demais usam Sonnet. O `model:` fica no frontmatter de `.claude/agents/*.md`.
- **Brief, não releitura:** ao chamar um papel, o orquestrador manda a história com critérios, as tarefas dele, as decisões que o afetam e os ADRs por número. O papel lê o código que precisa e não lê a sprint nem `decisions.md` inteiros.
- **Arquivos da sprint:** `sprint-NN.md` é o painel vivo (objetivo, histórias, trilha rápida, tarefas, riscos, pendências, entregas, retro). Ata do debate em `sprint-NN/ata.md`, QA e security review em `sprint-NN/qa.md`, evidências (prints, JSON do axe) em `sprint-NN/`. Sprints fechadas são histórico: ninguém lê sem motivo.
- **Escrita curta:** parecer ≤ 120 palavras; célula da tabela de tarefas em uma linha (o detalhe vai no commit, no teste ou no ADR); evidência é comando + linha que prova, não saída inteira.
- **Prova barata primeiro:** teste unitário, integração ou E2E scriptado antes de computer-use. Computer-use só no roteiro final, com captura em escala reduzida.
- **Paralelo só quando independente:** pareceres do debate em paralelo; implementação de Front e Back em paralelo só sem arquivo em comum.

## Quem participa do debate

Parecer custa tempo e dilui o que importa. Ninguém opina só porque foi chamado: só fala quem vai **trabalhar** na história ou quem tem **poder de veto** sobre o risco dela.

**Matriz de convocação.** O PO preenche no planning, uma linha por história:

| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| HNN.1 | Back | Front, Sec, QA | IPC novo + UI de estado + execução de processo |

**Regras de convocação**
- **PO e Tech Lead:** sempre. O PO decide e o TL desenha e divide as tarefas.
- **QA:** sempre que houver uma história Must, porque a Definition of Done exige evidência. QA opina só sobre como provar, sem repetir o desenho.
- **Cybersecurity:** obrigatório quando a história toca um gatilho: segredos, rede, IPC, execução de processo/comandos, MCP, autenticação, confiança no workspace, Supabase (RLS/grants/triggers), dependências novas, build ou release. Fora desses casos, não é convocado.
- **Front / Back / UX / DevOps:** só se tiverem tarefa na história, isto é, se a matriz os lista como dono ou envolvido.
- **Fora da matriz:** quem não aparece nela fica fora do debate. A ata registra "não convocado: sem tarefa nesta sprint".
- **Acréscimo:** um papel convocado que descobre uma dependência de outro papel pede a inclusão dele na ata, com o motivo. O PO aceita ou recusa.

**Rodadas**
1. **Parecer (paralelo):** cada papel convocado responde só sobre as histórias da sua linha. O parecer traz o que ele vai fazer, o risco, o tamanho e os critérios de aceite que ele não consegue cumprir ou testar. Não repete o parecer de outro papel nem resume a história. Sem objeção, escreve "de acordo".
2. **Réplica (só conflitos):** o orquestrador lista as divergências entre pareceres e os achados novos que mudam o escopo. Só respondem os papéis envolvidos em cada conflito.
3. **Decisão (PO):** uma decisão por conflito, com o porquê em uma ou duas frases. Uma objeção **[bloqueante]** de Cybersecurity só cai com mitigação registrada.

## Formato do debate

```md
**Convocados:** PO, TL, Back, Sec, QA · **Não convocados (sem tarefa):** UX, DevOps

### Tema: <decisão em pauta>
- **<Papel convocado>:** posição curta (o que faz, risco, tamanho)
- **<Papel convocado>:** divergência ou "de acordo"
- **Decisão (PO):** o que fica decidido e por quê
```

Um tema só entra na ata se houver decisão a tomar, como divergência, trade-off ou risco. Um consenso sem trade-off vira uma linha em "Decisões rápidas".

## Como acionar no Claude Code

- Debate da sprint: peça "rode o debate da sprint N com o squad". O Claude monta a matriz de convocação com o PO, chama só os papéis convocados, faz a rodada de réplica nos conflitos e consolida a ata.
- Papel isolado: "@cybersecurity revise supabase/migrations" ou "@qa monte o plano de testes da história X".

## Definition of Done

- Critérios de aceite atendidos e verificados pelo QA, com evidência.
- `npm run typecheck` e `npm run build` sem erros.
- Nenhum achado bloqueante de Cybersecurity aberto.
- `CHANGELOG.md` e `docs/sprints/sprint-NN.md` atualizados.
- Commits em Conventional Commits, **sem linha Co-Authored-By**.
