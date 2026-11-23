# Contributing to DevDeck

**English** · [Português](#contribuindo-com-o-devdeck)

Thanks for helping! DevDeck is built in **sprints** by a squad of roles (PO, Tech Lead, UX, Frontend, Backend, QA, Cybersecurity, DevOps) — see [`docs/squad.md`](docs/squad.md).

## Before you start
- Bugs and ideas: open an issue using the templates. Security problems: follow [SECURITY.md](SECURITY.md), never a public issue.
- Bigger changes: open an issue first so the change can be planned in a sprint ([`docs/sprints/`](docs/sprints/)).

## Development
```powershell
npm install
npm run dev
```
Before opening a PR, all of these must pass (CI runs them on Windows and Ubuntu):
```powershell
npm run typecheck
npm test
npm run build
```

## Rules of the codebase
- New business logic goes to `src/main/lib/` or `src/renderer/src/lib/` (no `electron`, `fs`, store or events) **with tests** in `tests/unit/`.
- New IPC channel: register it with `handle()` from `src/main/ipc.ts` and a zod schema in `src/main/lib/validation.ts`. Ids that become file paths are UUIDs.
- The renderer never touches the file system, privileged network or secrets — everything goes through `window.deck`.
- Supabase: new numbered migration in `supabase/migrations/`, RLS on every table, column-level grants.
- Comments and UI text in Brazilian Portuguese. If you change `README.md`, update `README.pt-BR.md` too (and vice versa).
- Every delivery updates [`CHANGELOG.md`](CHANGELOG.md).

## Commits and PRs
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`…), subject up to 72 characters.
- No `Co-Authored-By` or tool attribution lines.
- Fill in the PR template checklist. `main` is protected: PR required and the CI checks must pass.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

---

## Contribuindo com o DevDeck

Obrigado por ajudar! O DevDeck é construído em **sprints** por um squad de papéis (PO, Tech Lead, UX, Frontend, Backend, QA, Cybersecurity, DevOps) — veja [`docs/squad.md`](docs/squad.md).

- **Bugs e ideias:** abra uma issue pelos templates. **Segurança:** siga o [SECURITY.md](SECURITY.md), nunca issue pública. Mudanças grandes: abra issue antes para planejar numa sprint.
- **Antes do PR:** `npm run typecheck`, `npm test` e `npm run build` precisam passar (o CI roda em Windows e Ubuntu).
- **Regras:** lógica nova em `lib/` com teste; canal IPC novo via `handle()` + esquema zod; renderer nunca acessa disco, rede privilegiada ou segredos; migration nova com RLS e grants por coluna; comentários e textos de UI em português; mudou um README, atualize o outro; toda entrega atualiza o `CHANGELOG.md`.
- **Commits:** Conventional Commits, assunto até 72 caracteres, sem linha `Co-Authored-By`. A `main` é protegida: PR obrigatório e checks do CI verdes.

Ao contribuir, você concorda que sua contribuição é licenciada sob a [Licença MIT](LICENSE).
