# Sprint 07 — <tema a definir no planning>

**Período:** 2026-11-25 → a definir · **Versão alvo:** v0.7.0 · **Status:** planejamento pendente (H07.1 já entregue como hotfix v0.6.1)

> Painel vivo da sprint. Ata em `sprint-07/ata.md` (modelo `_template-ata.md`); QA e security review em `sprint-07/qa.md`; evidências em `sprint-07/`. Regras de tamanho em `docs/squad.md` → "Economia de contexto".
>
> Criado em 2026-11-26 a partir do modelo. O achado da H07.1 saiu do debate da Sprint 07 feito no outro computador, que não foi registrado aqui: se houver ata ou planning de lá, juntar em `sprint-07/ata.md`.

## Objetivo
<a definir no planning (PO)>

## Histórias (PO)

### H07.1 — Hotfix: git do agente não entra em submódulo · Must · P · ✅ entregue (v0.6.1)
*Como dev que abre um repositório recebido pronto, quero que nenhum submódulo execute código ao abrir o chat, para não rodar nada sem o diálogo de confiança.*
- [x] `submodule.<nome>.ignore=none` (no `.gitmodules` ou no `.git/config` do pai) não faz o `git status` do Claude Code entrar no submódulo nem rodar o filtro dele.
- [x] O gate lê o `.gitmodules` com `git config --file … --no-includes`; sem o arquivo na árvore, lê o do index e depois o do HEAD. Pausa com `ignore` ≠ `all`, `.gitmodules` especial ou ilegível, ou mais de 200 submódulos.
- [x] Inspeção sem lazy fetch (`GIT_NO_LAZY_FETCH`, `protocol.allow=never`): em partial clone, ler o blob não roda o `core.sshCommand` do repositório.
- [x] Sem `.gitmodules`, o hash de confiança é igual ao da v0.6.0 (confiança já gravada continua valendo).
- [x] ADR-018 (emenda), CHANGELOG 0.6.1, READMEs EN/PT.

Detalhes, security review e verificação: [PR #9](https://github.com/flavsjr/devdeck/pull/9) e `sprint-07/qa.md`.

## Convocação (PO)
| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| H07.1 | Back | TL, Sec, QA | execução de processo (git) e confiança no workspace |

**Não convocados (sem tarefa nesta sprint):** a definir no planning.

## Decisões (resumo da ata)
- **H07.1 (2026-11-25, outro computador):** saiu como hotfix antes do planning por ser execução de código sem diálogo nas v0.5.0/v0.6.0.

## Candidatas para o planning (backlog)
<o PO prioriza; itens herdados da Sprint 06 e do hotfix>

1. **Testes de componente dos parciais da H06.2/H06.3** (anotados na `sprint-06.md`): alvo ≥ 24 px do fechar, `role`/foco, lembrete "Abrir na agenda", layout e `prefers-reduced-motion`, "Copiar detalhes", sem toast duplicado + "Ver no chat", "Tentar de novo" desabilitado e composer intacto.
2. **T38 — repositório embutido (gitlink sem `.git/modules`)** com controle positivo: o teste já existe na cópia local de `tests/integration/git-exec.test.ts` (sem commit; passa com o código da v0.6.1).
3. **Achados baixos da Sec no hotfix:** `GIT_NO_LAZY_FETCH` no env do agente (partial clone já confiado), teste de timeout da inspeção, teste de `core.worktree` com git real.
4. **"Ver no chat" abrindo a sessão do erro** quando não é a ativa (`navegar` com `sessionId` UUID): exige TL e Sec.
5. **UI para `AskUserQuestion`** (ficou fora da lista branca na H06.10 por não ter tela de resposta).
6. **Automação do release:** pre-release e notas do CHANGELOG direto no `release.yml` (trilha rápida, Sec revisa); VirusTotal pela API no CI com resultado nas notas do rascunho (história: DevOps + Sec, secret criado pelo usuário). Publicar continua com aprovação explícita.
7. **Could da Sprint 06:** T47 "Alternar tema" na paleta; T48 sino com o histórico de notificações.
8. **Comunidade** (H06.6 pgTAP no CI e o resto): fica para depois, por decisão do usuário.

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
- T26: roteiro manual com a sessão OAuth realmente expirada no app instalado.
- Diálogos nativos no tema claro e lista branca de tools no app instalado (H06.10).
- Ata/planning da Sprint 07 feito no outro computador, se existir.

## QA e security review (resumo de [`sprint-07/qa.md`](sprint-07/qa.md))
| História | QA | Security |
|---|---|---|
| H07.1 | ✅ integração com git real, com controle positivo | ✅ libera; 2 bypass achados e corrigidos no PR; 3 baixas → candidatas |

## Entregas
- **v0.6.1 (hotfix, 2026-11-26):** tag `v0.6.1` em `de6f7a4` (merge do PR #9). [Run 45738700736](https://github.com/flavsjr/devdeck/actions/runs/45738700736) verde: `DevDeck-Setup-0.6.1.exe` (SHA-256 `6ae236039a2d2f7cf60c36807a39be2cfe86b1e4f5f697e02b54af98156bfeb2`), `SHA256SUMS.txt` e attestation. [VirusTotal](https://www.virustotal.com/gui/file/6ae236039a2d2f7cf60c36807a39be2cfe86b1e4f5f697e02b54af98156bfeb2): **0/55** (usuário, 2026-11-26). Notas do rascunho preenchidas a partir do CHANGELOG; publicado como pre-release em 2026-11-26 12:01 UTC, com aprovação do usuário.

## Retro
- **Funcionou:**
- **Melhorar:**
- **Ações:**
