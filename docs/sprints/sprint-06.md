# Sprint 06 — Feedback claro: notificações, erros legíveis e tema claro

**Período:** 2026-11-24 → 2026-12-08 · **Versão alvo:** v0.6.0 · **Status:** ✅ fechada em 2026-11-25 (v0.6.0; tag e release com aprovação do usuário)

> Painel vivo da sprint. Ata em `sprint-06/ata.md`, QA e security review em `sprint-06/qa.md`, spike em `sprint-06/spike-t01.md`.

## Objetivo
Fazer o DevDeck se comunicar com clareza (erro, aviso, sucesso e conquista distinguíveis e acionáveis, sessão do Claude expirada explicada em português) e funcionar bem também em tema claro.

## Dependências da Sprint 05 (não replanejadas)
- Tag `v0.6.0` só depois da `v0.5.0`, que depende do dry run do `release.yml` e do ruleset de tag `v*` (pendência 3 da Sprint 05).
- H06.3 usa a sessão OAuth expirada real do usuário como caso de teste manual. A pendência "git do SDK com login válido" (passo 4 da H05.7) continua sendo da Sprint 05; a H06.3 só deixa claro o caminho para entrar de novo.
- H06.6, se entrar, gera evidência extra de execução da `0002`. O fechamento da H05.6 não espera por ela.

## Histórias (PO)

### H06.1 — Tema claro · Must · G
*Como dev que trabalha em ambiente claro ou cansa a vista com tema escuro, quero escolher entre Sistema, Escuro e Claro para usar o DevDeck o dia todo com conforto.*
- [x] Dado Configurações → Aparência, quando escolho "Sistema", "Escuro" ou "Claro", então o tema troca sem recarregar e a escolha persiste após reiniciar. O seletor é um `radiogroup` e "Sistema" mostra o tema efetivo ("Sistema (agora: Escuro)").
- [x] Dado "Sistema", quando o Windows troca de tema com o app aberto, então o DevDeck acompanha sem reiniciar.
- [x] Dado settings existente sem `theme`, quando o app abre, então o tema é Escuro; em instalação nova, Sistema.
- [x] Dado um valor de tema fora da lista vindo do renderer, quando chega ao main, então o `z.enum` recusa e o valor salvo não muda (teste em `validation`).
- [x] Dado `settings.json` com `theme` inválido, quando o main lê, então usa `system` sem lançar erro (teste).
- [x] Dado tema salvo, quando a janela é criada, então `getBackgroundColor()` é igual ao `--bg` desse tema (mapa fixo no main, nunca valor do renderer), e os diálogos nativos (confiança, git pausado) seguem `nativeTheme.themeSource`.
- [x] `styles/tokens.css` continua o único arquivo com cor literal: o tema claro redefine só semânticos (primitivos novos permitidos) e o `style-guard.test.ts` continua verde.
- [x] Accent índigo escuro (~`#3d4ed8`) com `--on-accent` branco no claro; anel de foco ≥ 3:1 contra `--bg` e `--bg-1`.
- [x] `contrast.test.ts` roda parametrizado nos dois temas: todo par de texto ≥ 4,5:1, UI e anel de foco ≥ 3:1; o caso "branco sobre accent" é invertido no claro; todo semântico do escuro existe no claro.
- [x] `--hover-tint`, `--shadow`, `--scrim` e a escala `--viz-heat-*` (invertida) têm versão clara. O embed do Spotify sai de `theme=0` fixo e segue o tema.
- [x] Diff no tema claro: adição e remoção distinguíveis sem depender de cor (sinal `+`/`-` também no texto acessível, não `aria-hidden`) e com contraste AA.
- [x] axe sem violações *serious*/*critical* nos dois temas, nas 8 abas, na paleta, na ajuda, no card de aprovação e em "Git pausado". Capturas do tema claro em 1280×720 em `docs/sprints/sprint-06/`.
- [x] Nenhuma regra nova em `@layer legacy`. Regra do legado que precisar mudar para o tema sai do legado, e a lista de exceções do `css-layers.test.ts` só encolhe.
- [x] READMEs EN/PT sem "tema escuro apenas nesta versão", com captura do tema claro. ADR-020 + emenda ao ADR-014.

### H06.2 — Sistema de notificações · Must · M
*Como dev, quero distinguir de relance um erro de um aviso, de um sucesso e de uma conquista, e agir sobre eles, para não perder o que importa nem ler mensagem crua.*
- [x] Dado `notify({ tipo, texto, acao? })` com tipo `erro | aviso | sucesso | info | conquista`, quando a notificação aparece, então tem ícone lucide e cor por token semântico, e o tipo é dito em texto para o leitor de tela ("Erro:", "Aviso:"…), nunca só pela cor.
- [x] Typecheck sem nenhuma chamada `notify(string)`. Inventário do grep (41 chamadas) com o tipo de cada uma revisado pelo UX antes da migração.
- [x] `src/shared/lib/errorText.ts` (dicionário puro, sem `electron`/`fs`/DOM, teste em `tests/unit/shared/`): sem o prefixo "Error invoking remote method…", códigos conhecidos em PT-BR e texto genérico para o resto. O main traduz `ENOENT`, `EACCES` e rede no handler, antes do `throw`, com contexto; o renderer traduz o `code` do Supabase (`23505`, limite da `0002`) e tira o prefixo do IPC. Saem os helpers locais da McpView e da CommunityView.
- [x] Fila (reducer puro em `lib/notifications`, `now` injetado, com teste): no máximo 3 visíveis, e erro conta no teto. Sai primeiro a mais antiga que não é erro; erro nunca sai sem ação do usuário. Com 3 erros, o próximo vira "+N erros"; "Fechar todos" a partir de 2 erros. A mesma mensagem em menos de 5 s não duplica e mostra "×2" ("repetida 2 vezes" para o leitor de tela).
- [ ] Durações: sucesso 4 s, info 5 s, conquista 6 s, aviso 8 s. **Erro fica até ser fechado.** O tempo pausa com mouse ou foco em cima. Fechar tem `aria-label="Fechar notificação"` e alvo ≥ 24 px. — ⚠️ parcial no fechamento: alvo ≥ 24 px sem teste → Sprint 07
- [ ] Erro em `role="alert"`; os outros tipos numa região `role="status"` `aria-live="polite"` presente no DOM desde o boot. Notificação nunca rouba o foco. — ⚠️ parcial no fechamento: só no E2E; "não rouba o foco" sem teste → Sprint 07
- [x] Cada notificação tem no máximo uma ação, de uma união fechada: `{ tipo: 'navegar', destino: View } | { tipo: 'repetir', op: RetryOp }`, com `RetryOp` numa lista nomeada. Teste: nenhuma `RetryOp` aprova alteração, liga "Sempre" ou executa comando.
- [x] Conquista tem visual próprio (ícone, título e XP), separado da pilha de erros.
- [x] Regra pura `deveNotificarNativo({ focada, visivel })` em `src/shared`, com teste, usada nos 4 caminhos: `achievements.ts` e `agenda.ts` no main, aprovação e Flow no renderer. Nativa só para aprovação, lembrete e conquista, nunca para erro comum. A aprovação troca `document.hidden` por `!document.hasFocus()`.
- [ ] Dado janela em foco, quando um lembrete da agenda dispara, então aparece um toast info com "Abrir na agenda" (navegação). O evento main→renderer leva só id e título, renderizados como texto. — ⚠️ parcial no fechamento: fluxo sem teste → Sprint 07
- [ ] Em 1280×720 e a ~900 px, a pilha não cobre o composer nem o card de aprovação. Com `prefers-reduced-motion` não há animação de entrada. — ⚠️ parcial no fechamento: layout só no E2E de aprovação; reduced-motion sem teste → Sprint 07
- [x] E2E dos 5 tipos por fluxo real, sem gancho de teste no pacote: erro (MCP com comando inválido), aviso (nome de MCP inválido), sucesso (salvar chave), info ("Nada novo para importar"), conquista (primeiro turno no servidor local; perfil semeado no `--user-data-dir` descartável como alternativa). axe sem violações com os 5 tipos visíveis.

### H06.3 — Erro de autenticação do Claude legível · Must · M
*Como dev cuja sessão do Claude expirou, quero entender em português o que aconteceu e o que fazer, com um botão, para voltar a usar o chat sem procurar a solução.*
- [x] Classificador puro `src/main/lib/agentErrors.ts`: usa `SDKAssistantMessage.error` tipado do SDK 0.3.330. O desempate de `authentication_failed` em `auth_expired`, `auth_invalid_key` e `auth_missing` usa `hasApiKey`/`apiKeySource` + `api_error_status` 401, e o texto só como fallback. Enum desconhecido vira `unknown`. Fixtures em `tests/fixtures/agent-errors/`, capturadas do 0.3.330, redigidas e com a origem anotada; atualizar o SDK obriga a regravar as fixtures.
- [ ] Dado sessão OAuth expirada, quando envio uma mensagem, então o chat mostra o card "Sua sessão do Claude expirou" com a explicação e as ações "Usar chave da API" (abre Configurações com foco no campo), "Como entrar de novo" e "Tentar de novo". — ⚠️ parcial no fechamento: texto/ação em unit; sessão real é a T26 → Sprint 07
- [x] Dado chave da API salva e recusada, quando o turno falha, então o card é "A chave da API foi recusada", com "Trocar chave", e não fala de OAuth.
- [x] Dado `auth_missing`, então o card é "Nenhuma conta do Claude conectada", com "Adicionar chave da API" e "Como entrar".
- [x] Fora de "Detalhes técnicos", o card não contém a mensagem original: o renderer mapeia o código para texto fixo.
- [x] Um card por turno: a mensagem sintética do assistente (texto cru em inglês) some quando `msg.error` existir, e `result.errors` e o catch do pump não duplicam o card.
- [x] `redactPatterns` puro em `lib/secrets.ts` (`sk-ant-[\w-]+`, `Bearer\s+\S+`, JWT `eyJ…`, `x-api-key`, query `token`/`key`/`code`/`access_token`, apiKey salva), aplicado junto com o redact por valor exato em `agent.ts:285` (rethrow → IPC), `:303` (stderr → console), `:320` (catch do pump → item de chat em disco) e `:469` (`result.errors`). Teste com espião no `console.error` e leitura do arquivo de sessão em disco: nenhum valor falso aparece.
- [ ] "Detalhes técnicos" recolhido, redigido no main, com "Copiar detalhes" que copia o mesmo texto. O original nunca chega ao renderer. Se o `redactPatterns` não ficar pronto, os detalhes ficam escondidos. — ⚠️ parcial no fechamento: "Copiar" sem teste de igualdade → Sprint 07
- [x] "Como entrar de novo" abre só uma URL https fixa, por `openExternal` validado no main; o IPC recebe uma chave de lista fechada, nunca a URL.
- [x] Dado erro de autenticação, a barra de status mostra "Claude: sessão expirada", "Claude: chave recusada" ou "Claude: sem conta", com ação, até o próximo turno concluído.
- [ ] O erro do turno aparece no card do chat e não vira toast também. Se o usuário estiver em outra aba, aparece a notificação "Erro no chat: …" com a ação "Ver no chat". — ⚠️ parcial no fechamento: sem toast duplicado sem teste → Sprint 07
- [ ] "Tentar de novo" reenvia a última mensagem só por clique explícito, nunca sozinho, e fica desabilitado durante turno em andamento. O card não apaga o texto do composer. — ⚠️ parcial no fechamento: desabilitado/composer intacto sem teste → Sprint 07
- [x] Regressão: turno com falha de autenticação continua sem contar em estatísticas e conquistas (`lib/turns.ts`).
- [x] E2E com servidor em `127.0.0.1` que devolve 401 com `sk-ant-…` e `Bearer …` falsos no corpo: card certo e nenhum valor falso na tela nem no log.
- [ ] Evidência manual no app instalado com a sessão OAuth expirada real (prints em `docs/sprints/sprint-06/`). — ⚠️ parcial no fechamento: pendência com o usuário (T26) → Sprint 07

### H06.4 — Checklist de ameaça no template + repositório embutido · Should · P
*Como squad, quero um checklist de ameaça obrigatório nas histórias que tocam git ou processo para que bypass como o do submódulo apareça no debate, não no security review.*
- [x] `_template.md` ganha a seção "Checklist de ameaça" (texto da Cybersecurity, abaixo). É obrigatória em história que toca git ou execução de processo, com "N/A: <motivo>" nas outras. Cada "sim" cita teste com controle positivo, e o security review confere linha a linha.
- [ ] Dado uma pasta com `.git` próprio dentro do workspace, registrada como gitlink (`update-index --cacheinfo 160000`) sem `.git/modules` e com filtro malicioso, quando o DevDeck roda status e diff, então nenhum marcador aparece. Controle positivo no mesmo teste: `git -C sub diff` puro cria o marcador. — fora da v0.6.0: T38 em andamento em outra sessão

Texto da seção para o template:

```md
## Checklist de ameaça (obrigatório se a história toca git ou execução de processo; senão "N/A: <motivo>")
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
```

### H06.5 — Migração do `@layer legacy` por área · Should · G (timebox M)
*Como mantenedor do DevDeck, quero tirar o CSS antigo da camada legada para que regra nova não seja sobrescrita sem aviso (bugs do `.btn`/`.meter`).*
- [x] Meta mínima: legado de 1.668 para ≤ 835 linhas (`views.css` inteiro + ~350 linhas do `app.css`), com catraca no `css-layers.test.ts`. Zerar a camada e tirá-la do `index.css` é extra, com emenda ao ADR-014.
- [x] Classes migradas com prefixo ou escopo, sem `!important`. A lista de exceções do `css-layers.test.ts` (47 hoje) encolhe a cada área.
- [x] Capturas do E2E antes e depois de cada área migrada, nos dois temas, comparadas manualmente (sem pixelmatch). axe continua sem violações. **Feito com algo mais forte que capturas:** diff do estilo computado de 4.762 elementos (8 abas × 2 temas + paleta e ajuda, com chat, card de aprovação e diff abertos) entre o CSS antigo e o novo — zero diferenças (`tests/e2e/style-snapshot.mjs`).

### H06.6 — pgTAP no CI · Should · G · **fora da Sprint 06** (usuário, 2026-11-25: tudo da comunidade fica para depois)
*Como mantenedor da comunidade, quero que os testes de RLS e de limite rodem no CI para que uma migration não abra um buraco sem ninguém ver.*
- [ ] Job `db`: Supabase CLI como binário baixado com `curl` e conferido por `sha256sum -c`, com o hash escrito no workflow. O hash sai do arquivo de checksums oficial do release e só troca por PR que cita esse arquivo; falha do `sha256sum` derruba o job.
- [ ] `supabase db start` (ou `supabase start -x` sem os serviços não usados) + `supabase test db` com todos os `supabase/tests/*.sql`. Falha do pgTAP deixa o CI vermelho.
- [ ] O job roda sempre, em todo PR e push na `main`, sem filtro de caminho. `permissions: contents: read`, `persist-credentials: false`, nenhum secret, nenhum `supabase link` nem token.
- [ ] `supabase/config.toml` mínimo versionado, sem `project_id` real e sem segredo.
- [ ] Teste novo `supabase/tests/0001_community.sql` com `anon` e `authenticated`: RLS, grants por coluna, tentativa de forjar autor e contadores, denúncia oculta (tarefa do Back).
- [ ] Controle positivo: uma política afrouxada de propósito, num branch descartável, faz o job falhar (link do run vermelho no PR). Duração do job registrada.
- [ ] O job vira check obrigatório no ruleset da `main` no primeiro run verde, por ação do usuário (admin) com aprovação explícita, registrada na ata com data. A H06.6 só fecha com esse registro.
- [ ] Corte interno: se passar de G, o `0001_community.sql` vai para a Sprint 07 com o job já rodando a `0002`.

### H06.7 — Outros erros do Claude legíveis · Should · P
*Mesmo classificador e mesmo `redactPatterns` da H06.3, feito junto com ela.*
- [x] `rate_limit` (429): "Limite de uso do Claude atingido. Tente de novo em alguns minutos." · `overloaded` (529): "O Claude está sobrecarregado agora. Tente de novo em instantes." · `billing_error`: "Os créditos da sua chave da API acabaram." · sem rede (`api_retry` com `error_status: null` ou `ENOTFOUND`/`ECONNREFUSED`): "Sem conexão com o Claude. Confira a internet."
- [x] Nenhum desses ganha "tentar de novo" automático.
- [x] Se o spike não confirmar o enum, volta para Could. (Spike T01 confirmou o enum; cards provados no E2E `auth-error`.)

### H06.10 — Lista branca de tools do agente · Must · P+ (entrou em 2026-11-25, achado do fechamento da Sprint 05)
*Como dev, quero que o agente do chat só tenha as tools que o card de aprovação sabe mostrar, para não aprovar às cegas uma ação fora do workspace.*
- [x] `query()` com `tools` = Read, Glob, Grep, Edit, Write, NotebookEdit, Bash, PowerShell, WebSearch, Task; `Monitor` em `disallowedTools`; conectores do claude.ai desligados.
- [x] Hook `PreToolUse` em toda tool (`onFailure: 'block'`): `deny` fora da lista e para MCP de origem diferente de `dynamic`/`project`; `ask` em Bash/PowerShell.
- [x] Subagente herda a lista; Bash pedido por subagente passa pelo `canUseTool`; agente de projeto com `tools: Monitor` não roda Monitor.
- [x] Emenda ao ADR-022, CHANGELOG (Segurança) e READMEs EN/PT.

### Could
- **H06.8** — "Alternar tema" na paleta (Ctrl+K) (P).
- **H06.9** — Histórico das últimas 20 notificações da sessão, num sino na barra de status, guardado no mesmo reducer; "Limpar (só desta sessão)" sem confirmação (M).

### Won't
Assinatura de código · auto-update · hash do `claude.exe` em runtime (riscos aceitos da Sprint 05 mantidos) · DevDeck disparar o login OAuth rodando o `claude.exe` empacotado (execução de processo interativo, só após spike e ADR) · gancho de teste dentro do pacote · preferências de notificação por tipo · temas além de claro e escuro (alto contraste, personalizado) · Tailwind.

**Corte:** H06.9 → H06.8 → H06.5 → `0001_community.sql` da H06.6 → resto da H06.6 → teste de gitlink da H06.4 (o checklist no template fica). A H06.7 sai junto com a H06.3 se o enum não se confirmar. O tema claro não entra pela metade: se a H06.1 não passar contraste e axe em todas as abas, vai inteira para a Sprint 07, sem seletor visível. Não cortáveis: `redactPatterns` nos 4 pontos do `agent.ts`, um card por turno, detalhes técnicos redigidos no main, erro persistente até fechar, `role="alert"`, ação de notificação que nunca aprova, contraste AA nos dois temas, `z.enum` do tema no main, hash da CLI conferido.

**Ordem de execução:** spike das fixtures do SDK (1º dia) → API e fila da H06.2 → H06.3 + H06.7 → H06.1 → H06.4 → H06.6 → H06.5 até o timebox → Could.

## Convocação (PO)
| História | Dono | Envolvidos | Por quê |
|---|---|---|---|
| H06.1 tema claro | Front | TL, UX, Back, Sec, QA | paleta clara e contraste (UX); `nativeTheme`, `backgroundColor` e campo `theme` no settings (Back); campo novo em esquema zod de IPC (Sec); contraste, axe e capturas nos dois temas (QA) |
| H06.2 notificações | Front | TL, UX, Back, Sec, QA | tipos, durações, microcopy e `aria-live` (UX); regra nativa em `achievements.ts`/`agenda.ts` e `errorText` no main (Back); reducer e axe (QA); Sec por acréscimo, só no evento de lembrete main→renderer |
| H06.3 erro de autenticação | Back | TL, Front, UX, Sec, QA | autenticação, segredo em mensagem de erro e campo novo no item de chat enviado por IPC (Sec); card e status bar (Front); microcopy e ações (UX) |
| H06.4 checklist + gitlink | Sec | TL, Back, QA | confiança no workspace e execução de processo (git); teste de integração com marcador (Back, QA) |
| H06.5 migração do legado | Front | TL, QA | CSS sem mudança visual; QA prova com `css-layers` e capturas. Sem UX (visual neutro), sem Sec (sem gatilho) |
| H06.6 pgTAP no CI | DevOps | TL, Back, Sec, QA | CI/build, dependência nova (Supabase CLI), Supabase RLS (Sec); testes SQL (Back) |
| H06.7 outros erros | Back | TL, Front, UX, Sec | mesmo classificador e mesmo `redactPatterns` da H06.3 |
| H06.8 (Could) | Front | TL | paleta, sem gatilho |
| H06.9 (Could) | Front | TL, UX | estado e desenho do histórico |
| H06.10 lista branca de tools | Back | TL, Sec, QA | execução de comando, MCP e confiança no workspace (Sec); prova com SDK real (QA) |

**Não convocados (sem tarefa na história):** H06.2: DevOps · H06.5: UX, Back, Sec, DevOps · H06.1, H06.3, H06.4: DevOps · H06.4, H06.6: UX, Front. DevOps opina só na H06.6 (o release da v0.6.0 é rito, não debate).

## Decisões (resumo da ata)
Debate completo em [`sprint-06/ata.md`](sprint-06/ata.md).
- **pgTAP no CI:** CLI por binário + `sha256sum` com hash do arquivo oficial; job sempre roda, sem secret; obrigatório no ruleset no 1º run verde (bloqueante da Sec atendida).
- **Notificação nativa:** `deveNotificarNativo` em `src/shared/lib`, só aprovação, lembrete e conquista; com foco, lembrete vira toast "Abrir na agenda".
- **E2E:** fluxos reais com fake-api em `127.0.0.1`; nenhum gancho de teste no pacote.
- **`errorText`:** dicionário puro em `src/shared/lib`; o main traduz no handler com contexto.
- **Segredo no erro (bloqueante da Sec):** `redactPatterns` + redact por valor exato nos 4 pontos do `agent.ts`; detalhes redigidos no main.
- **Erro do agente:** um card por turno; classificação pelo enum tipado do SDK 0.3.330 com desempate por `apiKeySource`/status.
- **Autenticação:** "Como entrar de novo" (URL fixa no main) é a ação principal; chave da API é secundária.
- **Fila:** teto de 3, erro só sai por ação, conquista em faixa própria, dedupe "×N".
- **Tema:** Escuro para settings existente, Sistema em instalação nova; `nativeTheme` + `prefers-color-scheme`; accent claro ~`#3d4ed8`. Tema antes do legado (≤ 50%, timebox).
- **H06.10 (2026-11-25):** lista branca de 10 tools + conectores do claude.ai desligados + hook de `deny` em runtime (alta da Sec, aceita); MCP só de origem `dynamic`/`project`; sem `strictMcpConfig` (ADR-013); teste com subagente fica local e opt-in, com evidência no `qa.md`. `AskUserQuestion` com UI → Sprint 07.
- **Fora da sprint:** navegar para sessão não ativa (Sprint 07); `/login` pelo `claude.exe` empacotado (Won't).

## Riscos aceitos
- **Baixa:** com git confiado, o Bash do agente rodando `cd sub && git status` lê `sub/.git` sem a inspeção do DevDeck. Mitigação: Bash sempre pede aprovação (H05.5, nunca recebe "Sempre"), e a linha "processo do agente" do checklist registra o caso.
- **Baixa:** o `redactPatterns` trabalha por padrão e pode não pegar um formato novo de token. Mitigação: redact por valor exato da chave salva, detalhes recolhidos e redigidos no main, original nunca no renderer.
- **Baixa:** a classificação depende do enum do SDK 0.3.330, e uma atualização pode mudar valores. Falha segura: vira `unknown` com texto genérico; as fixtures obrigam a revisar a cada atualização.
- **Baixa:** o checksum da CLI do Supabase vem do mesmo release que o binário. Protege contra troca posterior e adulteração no download, não contra um release comprometido na origem.
- **Baixa:** sem prova automática para OAuth expirada real, pausa com hover e nativa sem foco. Ficam no roteiro manual da sprint.

## Pendências com o usuário
- T26: roteiro manual com a sessão OAuth realmente expirada no app instalado (quando acontecer). Também: diálogos nativos no tema claro e lista branca de tools no app instalado (H06.10).
- Ruleset da `main`: tornar o job `db` obrigatório no primeiro run verde (ação de admin). Até lá a H06.6 fica aberta.
- ~~Aprovar a correção de `.claude/agents/ux-designer.md`~~ e ~~citar `src/shared/lib/` no `CLAUDE.md`~~: aprovados em 2026-11-24 (T49).

## Achados do fechamento da Sprint 05 (2026-11-25) — levar ao PO e à Cybersecurity
- ~~**Revisar o 1º risco aceito acima:** Bash só-leitura sem `canUseTool`~~ → corrigido antes da tag `v0.5.0` no branch `fix/bash-sempre-pede-aprovacao` (`77bb313`, ADR-022): hook `PreToolUse` `ask` para Bash/PowerShell e `Monitor` em `disallowedTools`. A mitigação do risco volta a valer.
- **Pendências não bloqueantes da revisão de Cybersecurity do fix (2026-11-25):**
  - ~~**Média:** trocar a lista negra por lista branca~~ → virou H06.10 (feita em 2026-11-25). (`tools: [...]` só com o que o card sabe mostrar) e conferir o `tools` do `system/init` em teste. `Workflow`, `CronCreate`, `EnterWorktree` e `Agent` com `isolation: "worktree"` executam código e não foram conferidas.
  - **Baixa:** teste de integração com o SDK real contando chamadas do `canUseTool` para `git status` (Bash, PowerShell, Monitor), para pegar atualização do SDK sem hook.
  - **Baixa:** teste do `decide()` recusando "Sempre" para PowerShell no main; `NO_PATH` em `toolpath.ts` cita `Task`, mas o nome atual da tool é `Agent` (mais restritivo, sem risco).
  - **Baixa:** em workspace confiado, hook `PermissionRequest` ou `disableAllHooks` do projeto podem transformar o `ask` em `allow`; ambos só entram com confiança (ADR-013). Registrar como risco aceito.
- **Instância única:** sem `app.requestSingleInstanceLock()`; abrir o DevDeck de novo cria outra instância sobre o mesmo `%APPDATA%\DevDeck` (corrida nos JSON do store). Corrigir com foco na janela existente em `second-instance`.
- ~~**Pilha de notificações cobre ações do cabeçalho (E2E da T25, 2026-11-25):**~~ → corrigido pela trilha rápida (UX escolheu descer a pilha para abaixo do `view-head`, `top: 60px`). a pilha fica fixa no topo à direita do conteúdo; um erro (que não some sozinho) fica por cima de "Importar do Claude"/"Adicionar" na aba MCP até o usuário fechar. O critério da H06.2 só exige não cobrir o composer e o card de aprovação. Levar ao UX: descer a pilha para abaixo do `view-head` ou para o canto inferior.
- **Env restrito não é sandbox:** sem confiança, o agente ofereceu rodar git "sem essa variável". Um `env -u GIT_DIR git …` depende só da aprovação do Bash; o card precisa deixar claro quando o comando mexe em `GIT_*`.
- **Dependabot #1 (média, 2026-11-25):** `minimatch` `>= 7.0.0, < 11.0.1` com DoS por amplificação de `globparts` (correção na 11.0.1). Entra só pelo `electron-builder@26.18.0` → `app-builder-lib`: `minimatch@10.2.6` direto e `9.0.9` via `@electron/universal`; as cópias 3.x e 5.x estão fora da faixa. É dependência de build (escopo `development`), não vai no instalador e os padrões de glob vêm do próprio repo, então o risco real é baixo. Corrigir com `electron-builder` que já traga 11.0.1+ ou `overrides` no `package.json`, conferir com `npm ls minimatch` e rodar o dry run do `release.yml` (DevOps; Cybersecurity revisa o override).

## Backlog para a Sprint 07
- **Comunidade (decisão do usuário, 2026-11-25):** tudo da comunidade fica para depois, inclusive a H06.6 (pgTAP no CI: T40–T43). `supabase/config.toml` (T39) já está pronto para quando voltar.
- "Ver no chat" abrindo a sessão do erro quando ela não é a ativa (`navegar` com `sessionId` UUID): exige TL e Sec.

## Trilha rápida (sem debate, ver `docs/squad.md`)
| Item | Dono | Gatilho de segurança | Status |
|---|---|---|---|
| Instância única: `requestSingleInstanceLock` + foco na janela em `second-instance` | Back | sim (store em disco) | ✅ 2026-11-25. Teste `singleInstance.test.ts`; no `pack:win`, 2ª instância no mesmo userData sai com 0 e outra pasta abre. TL aprovado; Sec sem achados |
| `minimatch` ≥ 11.0.1 (Dependabot #1) | DevOps | sim (dependência de build) | ✅ 2026-11-25. `overrides` só na faixa afetada → 11.0.9; `pack:win` com fuses ok. TL aprovado; Sec sem achados. CI com `npm ci` verde ([run 45652772146](https://github.com/flavsjr/devdeck/actions/runs/45652772146)) e dry run do `release.yml` verde em 6,5 min com artefato `installer` ([run 45652794525](https://github.com/flavsjr/devdeck/actions/runs/45652794525)). Build de mac (`@electron/universal`) não verificado |
| Lista branca de tools do agente (`tools: [...]`) | Back | sim | → virou história H06.10 (emenda ao ADR-022) |
| Pilha de notificações abaixo do `view-head` (achado da T25) | Front + UX | não | ✅ 2026-11-25. E2E: com erro na tela, nenhum cartão cobre "Importar do Claude"/"Adicionar" e o clique funciona; controle com `top: 8px` falha |

## Tarefas (Tech Lead)
Fatos do código que entraram no desenho: `tests/unit/guard.test.ts` só vigia `src/main/lib` e `src/renderer/src/lib` (T03); `agentEnv` repassa `ANTHROPIC_BASE_URL`, então o E2E aponta o SDK para o servidor falso sem mexer no pacote; `api_error_status` existe no resultado do SDK 0.3.330 (`sdk.d.ts:6443`).

| Tarefa | Papel | Status |
|---|---|---|
| T01 · H06.3/H06.7 · **Spike, 1º dia:** capturar mensagens reais do SDK 0.3.330 para OAuth expirada real, chave falsa (401), sem credencial, 429,… | Back | feito (OAuth expirada: fixture sintética, prova real na T26) |
| T02 · todas · ADR-020 e ADR-021 em `docs/decisions.md` | TL | feito |
| T03 · H06.2 · `guard.test.ts` passa a vigiar `src/shared/lib`, proibindo também `window` e `document` | TL | feito |
| T04 · H06.2 · `src/shared/lib/errorText.ts` (tira o prefixo do IPC, traduz `23505`, o limite da `0002`, `ENOENT`, `EACCES`, rede e o genérico) +… | Front | feito |
| T05 · H06.2 · `src/shared/lib/nativeNotify.ts` (`deveNotificarNativo`) + teste. | Front | feito |
| T06 · H06.2 · Reducer `src/renderer/src/lib/notifications.ts` com `now` injetado: teto 3, erro conta e não sai sozinho, "+N erros", "Fechar todos"… | Front | feito |
| T07 · H06.2 · União `AcaoNotificacao` e lista nomeada `RetryOp` mapeada no store. | Front | feito |
| T08 · H06.2 · Inventário das 41 chamadas de `notify` com tipo e microcopy, na seção de tarefas da sprint | UX | feito (`sprint-06/ux-notificacoes.md`) |
| T09 · H06.2 · `components/Notifications.tsx`: ícone lucide, tokens `--notify-*`, `role="alert"` e região `status` montada no boot, pausa com hover… | Front | feito |
| T10 · H06.2 · `store.ts`: `notify({ tipo, texto, acao? })`, sai o `toast: string`, migram as 41 chamadas e saem `errorText` (McpView) e `errMsg`… | Front | feito |
| T11 · H06.2 · Main traduz `ENOENT`, `EACCES` e rede no handler com contexto (`agent.ts` `revertChange`, `agenda.ts`, provedores). | Back | feito |
| T12 · H06.2 · `deveNotificarNativo` em `achievements.ts:52` e `agenda.ts:157`. | Back | feito |
| T13 · H06.2 · Renderer: aprovação passa a usar `!document.hasFocus()` (`store.ts:293`), `FlowCard.tsx` passa pela regra e o lembrete vira toast… | Front | feito |
| T14 · H06.2/H06.3 · Helper `tests/e2e/helpers/fake-api.mjs`: servidor em `127.0.0.1` com 200, 401 (`sk-ant-…`/`Bearer …` falsos), 429, 529 e… | QA | feito |
| T15 · H06.3 · `redactPatterns` em `src/main/lib/secrets.ts` (padrões da ata + apiKey salva) + casos em `secrets.test.ts` | Back | feito |
| T16 · H06.3 · Aplicar redact por padrão e por valor exato em `agent.ts:285`, `:303`, `:320` e `:469`. | Back | feito |
| T17 · H06.3/H06.7 · `src/main/lib/agentErrors.ts` (enum → `AgentErrorCode`, desempate por `hasApiKey`/`apiKeySource` + `api_error_status`, texto… | Back | feito |
| T18 · H06.3 · `ChatItem` de erro ganha `code?: AgentErrorCode` e `detail?` (redigido no main) em `shared/types.ts`. | Back | feito |
| T19 · H06.3 · Canal `help:open` com `z.enum(['claude-login'])` → URL https fixa no main (`ipc.ts`, `validation.ts`) + teste em `validation.test.ts` | Back | feito |
| T20 · H06.3 · Card no `ChatView.tsx`: texto fixo por `code`, as 3 ações por código, "Detalhes técnicos" recolhido com "Copiar detalhes", "Tentar… | Front | feito |
| T21 · H06.3 · `src/renderer/src/lib/authStatus.ts` (deriva o estado dos itens da sessão) + teste. | Front | feito |
| T22 · H06.3 · Microcopy dos cards de autenticação e dos 4 da H06.7, com a URL de "Como entrar" | UX | feito (`sprint-06/ux-notificacoes.md`) |
| T23 · H06.3 · Regressão em `turns.test.ts`: falha de autenticação não conta | Back | feito |
| T24 · H06.3 · `tests/e2e/auth-error.e2e.mjs`: card certo e nenhum valor falso na tela, no stdout/stderr do Electron nem no JSON da sessão no `--user-data-dir`. Dep. T14, T20 | QA | feito |
| T25 · H06.2 · `tests/e2e/notifications.e2e.mjs`: 5 tipos por fluxo real (conquista pelo 1º turno no fake-api) + axe. Entra no `test:e2e` do `package.json`. Dep. T13, T14 | QA | feito |
| T26 · H06.3 · Roteiro manual com a OAuth expirada real no app instalado, prints em `docs/sprints/sprint-06/` | QA | pendência com o usuário, pós-release (exige sessão OAuth expirada real) |
| T27 · H06.1 · Paleta clara: primitivos e semânticos, accent `#3d4ed8`, diff claro, `--viz-heat-*` invertida | UX | feito (paleta validada por contrast.test; revisão da UX) |
| T28 · H06.1 · `src/main/lib/theme.ts` (`resolveTheme(raw, existia)` e mapa `THEME_BG`) + teste. | Back | feito |
| T29 · H06.1 · `theme` em `AppSettings`, `z.enum` no `settingsPatch`, normalização em `store.ts` (inválido → `system`, padrão por instalação) +… | Back | feito |
| T30 · H06.1 · `index.ts`: `nativeTheme.themeSource` antes de criar a janela e a cada troca, `backgroundColor` pelo mapa e `setBackgroundColor` no… | Back | feito |
| T31 · H06.1 · `tokens.css` com `@media (prefers-color-scheme: light)`. `contrast.test.ts` parametrizado: todo semântico existe nos dois temas e o caso do accent é invertido. Dep. T27 | Front | feito |
| T32 · H06.1 · Versões claras de `--hover-tint`, `--shadow`, `--scrim` e `--viz-heat-*`. Regras do legado afetadas saem do legado (catraca no `css-layers.test.ts`). Dep. T31 | Front | feito |
| T33 · H06.1 · Aparência em `SettingsView.tsx`: `radiogroup` e "Sistema (agora: X)" por `matchMedia`. Embed do Spotify segue o tema. Dep. T29 | Front | feito |
| T34 · H06.1 · `DiffView.tsx`: `+`/`-` no texto acessível e contraste AA no claro | Front | feito |
| T35 · H06.1 · `tests/e2e/theme.e2e.mjs`: troca, persistência após reiniciar, `getBackgroundColor()`, axe nos dois temas (8 abas, paleta, ajuda, aprovação, Git pausado) e capturas 1280×720. Diálogo nativo no tema fica no roteiro manual. Dep. T30–T34 | QA | feito |
| T36 · H06.1 · READMEs EN/PT sem "tema escuro apenas", com captura do claro. Emenda ao ADR-014. Dep. T35 | Front + TL | feito |
| T37 · H06.4 · Seção "Checklist de ameaça" em `docs/sprints/_template.md` | Sec | feito (seção já no `_template.md`) |
| T38 · H06.4 · Caso gitlink sem `.git/modules` com filtro malicioso e controle positivo em `tests/integration/git-exec.test.ts` | Back + QA | fora da v0.6.0: em andamento em outra sessão (`git-exec.test.ts` sem commit) |
| T39 · H06.6 · `supabase/config.toml` mínimo (sem `project_id` real) | DevOps | feito (porta 55322: o Windows reserva 53952–54451) |
| T40 · H06.6 · Job `db` no `ci.yml`: `curl` + `sha256sum -c` (hash citado do arquivo oficial), `supabase db start`, `supabase test db`, `contents: read`, `persist-credentials: false`, sem secret. Duração registrada | DevOps | adiada (comunidade depois) |
| T41 · H06.6 · `supabase/tests/0001_community.sql` com `anon` e `authenticated` (é o corte interno). Dep. T40 | Back | adiada (comunidade depois) |
| T42 · H06.6 · Controle positivo num branch descartável com o link do run vermelho no PR. Emenda ao ADR-010. Dep. T40 | DevOps + TL | adiada (comunidade depois) |
| T43 · H06.6 · Usuário torna o `db` obrigatório no ruleset no 1º run verde, com a data registrada na ata. Dep. T40 | Usuário (admin) | adiada (comunidade depois) |
| T44 · H06.5 · Criar a camada `views` em `index.css` (`tokens, legacy, base, shell, views`) e a catraca de linhas do legado no `css-layers.test.ts` | Front | feito |
| T45 · H06.5 · Migrar o `views.css` por área (uma tarefa e um commit por aba), com escopo e sem `!important`, capturas antes e depois nos dois temas e axe. Timebox M. Dep. T44, T35 | Front + QA | feito |
| T46 · H06.5 · ~350 linhas do `app.css` até chegar a ≤ 835. Zerar a camada é extra. Dep. T45 | Front | feito |
| T47 · H06.8 · "Alternar tema" na paleta (`commands.ts`), passando pelo mesmo `settings.set` | Front | → Sprint 07 (Could) |
| T48 · H06.9 · Sino na `StatusBar.tsx` lendo o `historico` do reducer, com "Limpar (só desta sessão)" | Front + UX | → Sprint 07 (Could) |
| T49 · processo · Corrigir o accent em `.claude/agents/ux-designer.md` e citar `src/shared/lib/` no `CLAUDE.md` (aprovados pelo usuário em 2026-11-24) | TL | feito |
| T50 · entrega · `CHANGELOG.md` 0.6.0, versão no `package.json`, QA, security review e retro da sprint | TL + QA + Sec | feito |
| T51 · entrega · `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e` verdes | TL | feito |

Resultado do spike T01 (mensagens reais do SDK por cenário de erro): [`sprint-06/spike-t01.md`](sprint-06/spike-t01.md).

## QA e security review (resumo de [`sprint-06/qa.md`](sprint-06/qa.md))
| História | QA | Security |
|---|---|---|
| H06.5 | ✅ diff de estilo computado zerado + catraca no `css-layers.test` + E2E completos | sem gatilho |
| H06.1 | ✅ contrast.test nos dois temas + E2E `theme.e2e.mjs` (axe e capturas) | sem gatilho novo no renderer; main (T28–T30) já revisado |
| H06.10 | ✅ unit + integração no CI + live local | alta do debate (hook de deny) atendida; média do review (`permissionMode` de agente) mitigada |

## Entregas
- v0.6.0: tema claro (Sistema/Escuro/Claro), notificações tipadas com fila e conquista própria, erros do Claude legíveis (autenticação, limite, sobrecarga, créditos) sem vazar segredo, lista branca de tools do agente com trava em runtime e conectores do claude.ai desligados (H06.10), instância única, pilha de notificações abaixo do cabeçalho, migração do CSS legado (1.634 → 799 linhas, sem mudança visual comprovada).
- E2E novos: tema, erros do Claude, notificações; integração com o SDK real (`agent-tools`); ferramenta de diff de estilo computado (`style-snapshot.mjs`).
- ADR-022 (comando sempre pede aprovação) e emendas ao ADR-014 (tema claro, camada views) e ao ADR-022 (lista branca).
- Processo enxuto: modelo por papel, brief, trilha rápida, sprint em painel + ata + qa.
- Fora: H06.6 e toda a comunidade (decisão do usuário); T38 (outra sessão); T47/T48 (Could) → Sprint 07.

## Retro
- **Funcionou:** E2E e testes com controle positivo acharam bugs reais antes do usuário: `.thinking` ilegível (1,9:1) nos dois temas, rótulo "Sistema" errado, pilha cobrindo o cabeçalho, `.ach.locked` e `.changes-diff` que mudariam com a migração. O diff de estilo computado provou "sem mudança visual" melhor e mais barato que capturas. Trilha rápida e brief: revisões de 12–30 mil tokens por papel (antes, cada papel relia ~45 KB de sprint). Medir antes de decidir (SDK real, init sem login, `mcp_server.source`) evitou debate às cegas.
- **Melhorar:** escape de regex/template literal dentro de `node -e` e heredoc quebrou arquivos 4 vezes nesta sprint (mesma lição da Sprint 05): código com `\`, crase ou `${}` só por Edit/Write ou script em arquivo. Um `sed` amplo demais trocou uma regra que não era alvo (pego no diff). Critérios da H06.2/H06.3 ficaram sem marcar até o fechamento; marcar ao terminar cada tarefa. (2026-11-25, antes do fim da sprint) custo de tokens do processo: os 8 papéis rodavam no modelo da sessão e reliam a sprint inteira (44 KB) e `decisions.md` (20 KB) a cada chamada; achado pequeno passava pelo rito completo.
- **Ações:** Sprint 07: testes de componente para os parciais da H06.2/H06.3; T26 quando a sessão expirar; regra no `squad.md`: "mover CSS de camada exige `style-snapshot` zerado". (Processo, aplicadas em 2026-11-25, aprovadas pelo usuário) `model:` por papel (Opus para TL e Sec, Sonnet para os demais); brief em vez de releitura; trilha rápida; sprint dividida em painel + `ata.md` + `qa.md`; índice de ADRs; parecer ≤ 120 palavras; E2E antes de computer-use; allowlist de comandos de leitura em `.claude/settings.json`. Medir na Sprint 07 se o custo por história caiu.
