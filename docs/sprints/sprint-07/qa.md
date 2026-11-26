# Sprint 07 — QA e security review

## QA
<evidência = comando + linha que prova, ou caminho do print em `sprint-07/`>

| Caso | Resultado | Evidência |
|---|---|---|
| H07.1: submódulo com `ignore=none` no `.gitmodules`, no `.git/config` do pai, só no index e só no HEAD — o ambiente da v0.6.0 roda o filtro, o novo não | ✅ | `tests/integration/git-exec.test.ts` (git 2.50.1, controle positivo) — PR #9 |
| H07.1: repositório embutido e `gitdir:` externo; partial clone com blob ausente | ✅ | mesmo arquivo — PR #9 |
| H07.1: `typecheck`, 1.864 testes, `build`, E2E de confiança no git | ✅ | PR #9 |
| v0.6.1: instalador do release = build atestado; VirusTotal 0/55 | ✅ | `SHA256SUMS.txt`, attestation pela API, link na `sprint-07.md` |

## Roteiro manual
1. …

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| (bypass) | gate do `.gitmodules` | `.gitmodules` só no index/HEAD não era lido | ✅ corrigido no PR #9 (index → HEAD com `config --blob`) |
| (bypass) | leitura do blob | lazy fetch em partial clone rodaria `core.sshCommand` | ✅ corrigido no PR #9 (`GIT_NO_LAZY_FETCH`, `protocol.allow=never`) |
| baixa | env do agente | `GIT_NO_LAZY_FETCH` não está no env do agente (só importa em partial clone já confiado) | → candidata da Sprint 07 |
| baixa | inspeção | sem teste de timeout da inspeção | → candidata da Sprint 07 |
| baixa | `core.worktree` | sem teste com git real | → candidata da Sprint 07 |

Veredito da Cybersecurity no PR #9: libera.
