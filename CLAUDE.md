# DevDeck — instruções para o Claude Code

App desktop Electron + React + TypeScript. Leia `docs/squad.md` antes de trabalhar numa feature.

## Processo (obrigatório)
- Trabalho acontece em **sprints**: um arquivo por sprint em `docs/sprints/sprint-NN.md` (modelo em `_template.md`) com histórias, ata do debate, tarefas, QA, security review e retro.
- Decisões passam pelo **debate do squad** (agentes em `.claude/agents/`: po, tech-lead, ux-designer, frontend, backend, qa, cybersecurity, devops). Só participam os papéis **convocados** na matriz do PO: quem trabalha na história ou tem veto sobre o risco dela (regras em `docs/squad.md`). Decisão final é do PO; objeção bloqueante de Cybersecurity só cai com mitigação registrada.
- Decisão de arquitetura nova → ADR em `docs/decisions.md`.
- Toda entrega atualiza `CHANGELOG.md` (Keep a Changelog, SemVer, uma versão por sprint).
- README existe em inglês (`README.md`) e português (`README.pt-BR.md`): mudou um, atualize o outro.

## Git
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…), mensagem em português ou inglês, assunto ≤ 72 caracteres.
- **Nunca** adicionar linha `Co-Authored-By` nem atribuição de ferramenta em commits ou PRs.
- Push, tag e release só com aprovação explícita do usuário.

## Código
- Comentários e textos de UI em português do Brasil.
- Renderer nunca acessa fs, rede privilegiada ou segredos: tudo via `window.deck` (`DeckApi` em `src/shared/types.ts`) e handlers em `src/main/index.ts` que validam a entrada.
- Segredos só no main com `safeStorage`. Rede no main com `net.fetch`.
- SQL do Supabase: nova migration numerada em `supabase/migrations/`, RLS em toda tabela, grants por coluna.
- Regra de negócio nova vai para `src/main/lib/` ou `src/renderer/src/lib/` (sem `electron`, `fs`, `store`, `events`) **com teste** em `tests/unit/`. Regra pura usada pelo main **e** pelo renderer vai para `src/shared/lib/` (também sem `window`/`document`), com teste em `tests/unit/shared/` (ADR-020).
- Novo canal IPC: registrar com `handle()` de `src/main/ipc.ts` e esquema zod em `src/main/lib/validation.ts`. Ids que viram caminho de arquivo são UUID.
- Antes de entregar: `npm run typecheck`, `npm test` e `npm run build` sem erros.

## Comandos
- `npm run dev` — app em desenvolvimento (`DEVDECK_VIEW=profile` abre direto numa aba; `DEVDECK_SNAPSHOT=arquivo.png` salva captura).
- `npm run typecheck` · `npm test` · `npm run test:coverage` · `npm run build` · `npm start`
