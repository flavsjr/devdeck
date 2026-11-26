# Sprint 07 — ata do debate

**Convocados:** PO, TL, Cybersecurity, QA, Frontend, Backend, DevOps · **Não convocados (sem tarefa):** UX (H07.6 foi para a Sprint 08)

Planning em 2026-11-26. O debate da Sprint 07 feito no outro computador, que originou a H07.1 (hotfix v0.6.1), não foi registrado; se aparecer, juntar aqui.

### D1 — Camada de teste da H07.2
- **TL / QA:** o vitest roda em `node`, sem jsdom. 24 px, reduced-motion e "Abrir na agenda" dependem de layout e roteamento reais → estender `tests/e2e/notifications.e2e.mjs` (`boundingBox`, `emulateMedia`, clipboard pelo main). Regra pura (dedupe do erro) em `lib/notifications.ts` com teste unitário.
- **Frontend:** preferia jsdom + testing-library para `role` e foco; é dependência nova (Sec revisa). Pede `data-testid` nos botões da notificação.
- **Decisão (PO):** E2E + unit da regra pura, sem dependência nova. jsdom vira candidata futura, com ADR e revisão da Sec.

### D2 — `.git/hooks` no gate (achado novo da Sec, médio)
- **Sec:** um zip com `.git` embutido pode trazer `pre-commit`, e ele roda no `git commit` do agente, mesmo com o Bash aprovado. Mitigação: hook que não é `.sample` vira motivo de risco.
- **Backend:** cabe na H07.3, que continua M.
- **Decisão (PO):** entra na H07.3, com critério próprio.

### D3 — `include.path` e `core.worktree` (Sec, médio)
- **Sec:** a allowlist (`gitconfig.ts`) já marca `core.worktree` como risco e `include` como sessionOnly, mas caminho que cai **dentro** do workspace pode ser editado pelo agente durante a sessão.
- **Backend / TL:** `core.worktree` não tem detecção dedicada, precisa de regra e de teste com git real.
- **Decisão (PO):** recusar o que resolve (realpath, também caminho relativo) para fora do repositório **ou** para dentro do workspace editável. Os testes cobrem as duas direções.

### D4 — `GIT_NO_LAZY_FETCH` no env do agente (Sec, baixo)
- **Sec:** quebra `git log -p` em partial clone.
- **Decisão (PO):** risco aceito e documentado; sem mitigação nesta sprint.

### D5 — Desenho do VirusTotal (H07.5)
- **DevOps:** job `scan` separado (`needs: build`), lookup por sha256 → upload via `upload_url` (o instalador passa de 32 MB) → polling a cada 20 s com teto de 10 min; falha → "scan pendente" e o release segue. Resultado vai como artifact para as notas.
- **Sec:** sem checkout, sem npm, sem action de terceiro, `permissions: {}`, chave no header `x-apikey` vinda do env, curl sem `-v`. O upload torna a amostra pública. A saída do VT é dado não confiável.
- **TL:** M no limite por causa do polling.
- **Decisão (PO):** aprovado. O environment se chama `release` (sugestão da Sec), restrito a tags `v*.*.*`. Amostra pública é aceitável porque o projeto é aberto; registrar isso nas notas. Continua Should e é o primeiro corte depois de T47/T48.

### D6 — TR1: pre-release e notas
- **DevOps:** `--prerelease` quando a tag é `v0.*` ou tem sufixo; script Node extrai `## [X.Y.Z]` do CHANGELOG para `out/NOTES.md` + `--notes-file`; `CHANGELOG.md` entra no sparse-checkout.
- **Sec:** o único risco de injeção é interpolar no `--notes`; arquivo resolve.
- **Decisão (PO):** aprovado. O job falha se a seção da versão não existir.

### D7 — H07.4: tipo da ação
- **Frontend:** ação nova `abrirSessao {sessionId, itemId}` (o `navegar` continua simples), `isUuid` em `src/shared/lib/ids.ts`, `data-item-id` no item do chat, scroll respeitando reduced-motion. Riscos: corrida com `openSession` assíncrono, autoscroll, StrictMode.
- **TL:** recusa de sessão inexistente só depois de consultar o store. **Sec:** de acordo; o id nunca vira caminho.
- **Decisão (PO):** aprovado. Se o item sumiu, rola para o fim da lista.

### Decisões rápidas
- Emendas de ADR, sem ADR novo: ADR-018 (D2, D3, D4), ADR-019 (D5, D6), ADR-014 (D7).
- Ordem de corte mantida: T47/T48 → H07.5 → H07.4 → parte da H07.2. H07.3 e TR1 não saem.
