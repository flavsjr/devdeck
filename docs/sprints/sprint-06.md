# Sprint 06 — Feedback claro: notificações, erros legíveis e tema claro

**Período:** 2026-11-24 → 2026-12-08 · **Versão alvo:** v0.6.0 · **Status:** planejada

## Objetivo
Fazer o DevDeck se comunicar com clareza (erro, aviso, sucesso e conquista distinguíveis e acionáveis, sessão do Claude expirada explicada em português) e funcionar bem também em tema claro.

## Dependências da Sprint 05 (não replanejadas)
- Tag `v0.6.0` só depois da `v0.5.0`, que depende do dry run do `release.yml` e do ruleset de tag `v*` (pendência 3 da Sprint 05).
- H06.3 usa a sessão OAuth expirada real do usuário como caso de teste manual. A pendência "git do SDK com login válido" (passo 4 da H05.7) continua sendo da Sprint 05; a H06.3 só deixa claro o caminho para entrar de novo.
- H06.6, se entrar, gera evidência extra de execução da `0002`. O fechamento da H05.6 não espera por ela.

## Histórias (PO)

### H06.1 — Tema claro · Must · G
*Como dev que trabalha em ambiente claro ou cansa a vista com tema escuro, quero escolher entre Sistema, Escuro e Claro para usar o DevDeck o dia todo com conforto.*
- [ ] Dado Configurações → Aparência, quando escolho "Sistema", "Escuro" ou "Claro", então o tema troca sem recarregar e a escolha persiste após reiniciar. O seletor é um `radiogroup` e "Sistema" mostra o tema efetivo ("Sistema (agora: Escuro)").
- [ ] Dado "Sistema", quando o Windows troca de tema com o app aberto, então o DevDeck acompanha sem reiniciar.
- [ ] Dado settings existente sem `theme`, quando o app abre, então o tema é Escuro; em instalação nova, Sistema.
- [ ] Dado um valor de tema fora da lista vindo do renderer, quando chega ao main, então o `z.enum` recusa e o valor salvo não muda (teste em `validation`).
- [ ] Dado `settings.json` com `theme` inválido, quando o main lê, então usa `system` sem lançar erro (teste).
- [ ] Dado tema salvo, quando a janela é criada, então `getBackgroundColor()` é igual ao `--bg` desse tema (mapa fixo no main, nunca valor do renderer), e os diálogos nativos (confiança, git pausado) seguem `nativeTheme.themeSource`.
- [ ] `styles/tokens.css` continua o único arquivo com cor literal: o tema claro redefine só semânticos (primitivos novos permitidos) e o `style-guard.test.ts` continua verde.
- [ ] Accent índigo escuro (~`#3d4ed8`) com `--on-accent` branco no claro; anel de foco ≥ 3:1 contra `--bg` e `--bg-1`.
- [ ] `contrast.test.ts` roda parametrizado nos dois temas: todo par de texto ≥ 4,5:1, UI e anel de foco ≥ 3:1; o caso "branco sobre accent" é invertido no claro; todo semântico do escuro existe no claro.
- [ ] `--hover-tint`, `--shadow`, `--scrim` e a escala `--viz-heat-*` (invertida) têm versão clara. O embed do Spotify sai de `theme=0` fixo e segue o tema.
- [ ] Diff no tema claro: adição e remoção distinguíveis sem depender de cor (sinal `+`/`-` também no texto acessível, não `aria-hidden`) e com contraste AA.
- [ ] axe sem violações *serious*/*critical* nos dois temas, nas 8 abas, na paleta, na ajuda, no card de aprovação e em "Git pausado". Capturas do tema claro em 1280×720 em `docs/sprints/sprint-06/`.
- [ ] Nenhuma regra nova em `@layer legacy`. Regra do legado que precisar mudar para o tema sai do legado, e a lista de exceções do `css-layers.test.ts` só encolhe.
- [ ] READMEs EN/PT sem "tema escuro apenas nesta versão", com captura do tema claro. ADR-020 + emenda ao ADR-014.

### H06.2 — Sistema de notificações · Must · M
*Como dev, quero distinguir de relance um erro de um aviso, de um sucesso e de uma conquista, e agir sobre eles, para não perder o que importa nem ler mensagem crua.*
- [ ] Dado `notify({ tipo, texto, acao? })` com tipo `erro | aviso | sucesso | info | conquista`, quando a notificação aparece, então tem ícone lucide e cor por token semântico, e o tipo é dito em texto para o leitor de tela ("Erro:", "Aviso:"…), nunca só pela cor.
- [ ] Typecheck sem nenhuma chamada `notify(string)`. Inventário do grep (41 chamadas) com o tipo de cada uma revisado pelo UX antes da migração.
- [ ] `src/shared/lib/errorText.ts` (dicionário puro, sem `electron`/`fs`/DOM, teste em `tests/unit/shared/`): sem o prefixo "Error invoking remote method…", códigos conhecidos em PT-BR e texto genérico para o resto. O main traduz `ENOENT`, `EACCES` e rede no handler, antes do `throw`, com contexto; o renderer traduz o `code` do Supabase (`23505`, limite da `0002`) e tira o prefixo do IPC. Saem os helpers locais da McpView e da CommunityView.
- [ ] Fila (reducer puro em `lib/notifications`, `now` injetado, com teste): no máximo 3 visíveis, e erro conta no teto. Sai primeiro a mais antiga que não é erro; erro nunca sai sem ação do usuário. Com 3 erros, o próximo vira "+N erros"; "Fechar todos" a partir de 2 erros. A mesma mensagem em menos de 5 s não duplica e mostra "×2" ("repetida 2 vezes" para o leitor de tela).
- [ ] Durações: sucesso 4 s, info 5 s, conquista 6 s, aviso 8 s. **Erro fica até ser fechado.** O tempo pausa com mouse ou foco em cima. Fechar tem `aria-label="Fechar notificação"` e alvo ≥ 24 px.
- [ ] Erro em `role="alert"`; os outros tipos numa região `role="status"` `aria-live="polite"` presente no DOM desde o boot. Notificação nunca rouba o foco.
- [ ] Cada notificação tem no máximo uma ação, de uma união fechada: `{ tipo: 'navegar', destino: View } | { tipo: 'repetir', op: RetryOp }`, com `RetryOp` numa lista nomeada. Teste: nenhuma `RetryOp` aprova alteração, liga "Sempre" ou executa comando.
- [ ] Conquista tem visual próprio (ícone, título e XP), separado da pilha de erros.
- [ ] Regra pura `deveNotificarNativo({ focada, visivel })` em `src/shared`, com teste, usada nos 4 caminhos: `achievements.ts` e `agenda.ts` no main, aprovação e Flow no renderer. Nativa só para aprovação, lembrete e conquista, nunca para erro comum. A aprovação troca `document.hidden` por `!document.hasFocus()`.
- [ ] Dado janela em foco, quando um lembrete da agenda dispara, então aparece um toast info com "Abrir na agenda" (navegação). O evento main→renderer leva só id e título, renderizados como texto.
- [ ] Em 1280×720 e a ~900 px, a pilha não cobre o composer nem o card de aprovação. Com `prefers-reduced-motion` não há animação de entrada.
- [ ] E2E dos 5 tipos por fluxo real, sem gancho de teste no pacote: erro (MCP com comando inválido), aviso (nome de MCP inválido), sucesso (salvar chave), info ("Nada novo para importar"), conquista (primeiro turno no servidor local; perfil semeado no `--user-data-dir` descartável como alternativa). axe sem violações com os 5 tipos visíveis.

### H06.3 — Erro de autenticação do Claude legível · Must · M
*Como dev cuja sessão do Claude expirou, quero entender em português o que aconteceu e o que fazer, com um botão, para voltar a usar o chat sem procurar a solução.*
- [ ] Classificador puro `src/main/lib/agentErrors.ts`: usa `SDKAssistantMessage.error` tipado do SDK 0.3.330. O desempate de `authentication_failed` em `auth_expired`, `auth_invalid_key` e `auth_missing` usa `hasApiKey`/`apiKeySource` + `api_error_status` 401, e o texto só como fallback. Enum desconhecido vira `unknown`. Fixtures em `tests/fixtures/agent-errors/`, capturadas do 0.3.330, redigidas e com a origem anotada; atualizar o SDK obriga a regravar as fixtures.
- [ ] Dado sessão OAuth expirada, quando envio uma mensagem, então o chat mostra o card "Sua sessão do Claude expirou" com a explicação e as ações "Usar chave da API" (abre Configurações com foco no campo), "Como entrar de novo" e "Tentar de novo".
- [ ] Dado chave da API salva e recusada, quando o turno falha, então o card é "A chave da API foi recusada", com "Trocar chave", e não fala de OAuth.
- [ ] Dado `auth_missing`, então o card é "Nenhuma conta do Claude conectada", com "Adicionar chave da API" e "Como entrar".
- [ ] Fora de "Detalhes técnicos", o card não contém a mensagem original: o renderer mapeia o código para texto fixo.
- [ ] Um card por turno: a mensagem sintética do assistente (texto cru em inglês) some quando `msg.error` existir, e `result.errors` e o catch do pump não duplicam o card.
- [ ] `redactPatterns` puro em `lib/secrets.ts` (`sk-ant-[\w-]+`, `Bearer\s+\S+`, JWT `eyJ…`, `x-api-key`, query `token`/`key`/`code`/`access_token`, apiKey salva), aplicado junto com o redact por valor exato em `agent.ts:285` (rethrow → IPC), `:303` (stderr → console), `:320` (catch do pump → item de chat em disco) e `:469` (`result.errors`). Teste com espião no `console.error` e leitura do arquivo de sessão em disco: nenhum valor falso aparece.
- [ ] "Detalhes técnicos" recolhido, redigido no main, com "Copiar detalhes" que copia o mesmo texto. O original nunca chega ao renderer. Se o `redactPatterns` não ficar pronto, os detalhes ficam escondidos.
- [ ] "Como entrar de novo" abre só uma URL https fixa, por `openExternal` validado no main; o IPC recebe uma chave de lista fechada, nunca a URL.
- [ ] Dado erro de autenticação, a barra de status mostra "Claude: sessão expirada", "Claude: chave recusada" ou "Claude: sem conta", com ação, até o próximo turno concluído.
- [ ] O erro do turno aparece no card do chat e não vira toast também. Se o usuário estiver em outra aba, aparece a notificação "Erro no chat: …" com a ação "Ver no chat".
- [ ] "Tentar de novo" reenvia a última mensagem só por clique explícito, nunca sozinho, e fica desabilitado durante turno em andamento. O card não apaga o texto do composer.
- [ ] Regressão: turno com falha de autenticação continua sem contar em estatísticas e conquistas (`lib/turns.ts`).
- [ ] E2E com servidor em `127.0.0.1` que devolve 401 com `sk-ant-…` e `Bearer …` falsos no corpo: card certo e nenhum valor falso na tela nem no log.
- [ ] Evidência manual no app instalado com a sessão OAuth expirada real (prints em `docs/sprints/sprint-06/`).

### H06.4 — Checklist de ameaça no template + repositório embutido · Should · P
*Como squad, quero um checklist de ameaça obrigatório nas histórias que tocam git ou processo para que bypass como o do submódulo apareça no debate, não no security review.*
- [ ] `_template.md` ganha a seção "Checklist de ameaça" (texto da Cybersecurity, abaixo). É obrigatória em história que toca git ou execução de processo, com "N/A: <motivo>" nas outras. Cada "sim" cita teste com controle positivo, e o security review confere linha a linha.
- [ ] Dado uma pasta com `.git` próprio dentro do workspace, registrada como gitlink (`update-index --cacheinfo 160000`) sem `.git/modules` e com filtro malicioso, quando o DevDeck roda status e diff, então nenhum marcador aparece. Controle positivo no mesmo teste: `git -C sub diff` puro cria o marcador.

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
- [ ] Meta mínima: legado de 1.668 para ≤ 835 linhas (`views.css` inteiro + ~350 linhas do `app.css`), com catraca no `css-layers.test.ts`. Zerar a camada e tirá-la do `index.css` é extra, com emenda ao ADR-014.
- [ ] Classes migradas com prefixo ou escopo, sem `!important`. A lista de exceções do `css-layers.test.ts` (47 hoje) encolhe a cada área.
- [ ] Capturas do E2E antes e depois de cada área migrada, nos dois temas, comparadas manualmente (sem pixelmatch). axe continua sem violações.

### H06.6 — pgTAP no CI · Should · G
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
- [ ] `rate_limit` (429): "Limite de uso do Claude atingido. Tente de novo em alguns minutos." · `overloaded` (529): "O Claude está sobrecarregado agora. Tente de novo em instantes." · `billing_error`: "Os créditos da sua chave da API acabaram." · sem rede (`api_retry` com `error_status: null` ou `ENOTFOUND`/`ECONNREFUSED`): "Sem conexão com o Claude. Confira a internet."
- [ ] Nenhum desses ganha "tentar de novo" automático.
- [ ] Se o spike não confirmar o enum, volta para Could.

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

**Não convocados (sem tarefa na história):** H06.2: DevOps · H06.5: UX, Back, Sec, DevOps · H06.1, H06.3, H06.4: DevOps · H06.4, H06.6: UX, Front. DevOps opina só na H06.6 (o release da v0.6.0 é rito, não debate).

## Debate

**Convocados:** PO, TL, UX, Front, Back, QA, Cybersecurity, DevOps (DevOps só na H06.6). Pareceres em paralelo, depois réplica com 4 conflitos e 2 bloqueantes de Cybersecurity; decisão do PO.
**Não convocados (sem tarefa na história):** H06.2: DevOps · H06.5: UX, Back, Sec, DevOps · H06.1, H06.3, H06.4: DevOps · H06.4, H06.6: UX, Front.
**Acréscimo aceito:** Sec entra na H06.2 só para o evento novo de lembrete da agenda, que vai do main para o renderer (gatilho IPC). Pedido do Back.

### Tema: pgTAP no CI: como obter a CLI e quando o job vira obrigatório (H06.6)
- **TL / DevOps / Sec / Back:** CLI por binário baixado com `curl` e conferido por `sha256sum`, com o hash escrito no workflow (a `setup-cli` não confere checksum). O job roda sempre, sem filtro de caminho, para não deixar check pendente.
- **Sec:** **[bloqueante]** o hash vem do arquivo de checksums oficial do release e só troca por PR que cita esse arquivo. Falha do `sha256sum` derruba o job. Nada de `supabase link`, token ou secret. O job entra como obrigatório no ruleset já no primeiro run verde.
- **DevOps:** de acordo com a Sec sobre o ruleset.
- **TL:** obrigatório só depois de 2 runs verdes, por medo de instabilidade do Docker no runner.
- **Decisão (PO):** binário + sha256, rodando sempre, com todas as condições da Sec. O job fica obrigatório no ruleset no primeiro run verde, porque a janela em que um PR entra com RLS vermelho é justamente o risco que a história fecha. A mudança no ruleset é ação de admin, feita pelo usuário com aprovação explícita, e a H06.6 só fecha com o registro dela. Para a preocupação do TL: falha de infraestrutura (pull do Docker) se resolve com re-run. Tirar o job do ruleset exige Sec e usuário. Se houver 2 falhas instáveis na sprint, o tema volta na retro. O bloqueante cai com essa mitigação.

### Tema: notificação nativa do SO (H06.2)
- **Back / Front / UX / TL:** regra pura `deveNotificarNativo({ focada, visivel })` em `src/shared`, com teste e sem IPC, aplicada nos 4 caminhos: `achievements.ts:52` e `agenda.ts:157` no main, aprovação e Flow no renderer. Bug: `store.ts:293` usa `document.hidden`; o certo é `!document.hasFocus()`.
- **Back:** com a janela em foco, o lembrete da agenda vira toast info com ação.
- **UX:** nativa só para o que exige ação (aprovação, lembrete, conquista), nunca para erro comum.
- **Decisão (PO):** aceito na íntegra. A ação do toast de lembrete é "Abrir na agenda" (navegação), não `openExternal` do link da reunião, para a lista de ações continuar fechada. O payload do evento novo leva só id e título, renderizados como texto.

### Tema: como provar no E2E o card de autenticação e os 5 tipos de notificação (H06.2, H06.3)
- **Todos:** o card de autenticação é provado por fluxo real, com um servidor em `127.0.0.1` que devolve 401 com `sk-ant-…` e `Bearer …` falsos no corpo. O teste confere que eles não aparecem na tela nem no log.
- **Front / QA:** os 5 tipos também por fluxo real. Erro: MCP com comando inválido. Aviso: nome de MCP inválido. Sucesso: salvar chave. Info: "Nada novo para importar". Conquista: primeiro turno com sucesso no servidor local, ou perfil semeado perto do limiar. Rejeitam gancho de teste no pacote.
- **Sec:** gancho só com gate na compilação (define num build de E2E e um passo no CI que falha se achar `__devdeckTest` no bundle de release). Gate por variável de ambiente em runtime, não.
- **Decisão (PO):** fluxos reais e nenhum gancho no pacote. Assim o risco que a Sec quer controlar nem existe, e o teste prova o caminho que o usuário usa. Conquista pelo primeiro turno no servidor local; perfil semeado no `--user-data-dir` descartável só como alternativa. Ficam manuais: OAuth expirada real, pausa com hover e nativa sem foco. Teto de 3, "×2" e dedupe ficam no teste unitário do reducer.

### Tema: onde mora o `errorText` (H06.2)
- **Todos:** o Supabase roda no renderer (o `code` chega intacto). `ENOENT`, `EACCES` e erro de rede do main são traduzidos no main antes do `throw`.
- **Back:** `src/shared/lib/errorText.ts`, usado pelos dois lados.
- **TL:** no renderer, com o main traduzindo no próprio handler.
- **Decisão (PO):** um dicionário puro em `src/shared/lib/errorText.ts` (sem `electron`, `fs` ou DOM), com teste em `tests/unit/shared/`. O main chama no handler e junta o contexto ("Não foi possível ler <arquivo>: <motivo>"); o renderer chama para o Supabase e para tirar o prefixo do IPC. Um dicionário só evita dois textos para o mesmo código, e o handler continua dando o contexto que o TL quer. Fica coerente com a regra nativa, que também foi para `src/shared`. O ADR-020 registra `src/shared/lib/` como lugar de regra pura usada pelos dois lados.

### Tema: segredo vazando pela mensagem de erro do agente (H06.3)
- **Sec:** **[bloqueante]** a mensagem do SDK pode trazer chave ou token e hoje chega crua a 4 lugares: `agent.ts:285` (rethrow que vira mensagem de IPC), `:303` (stderr no `console.error`), `:320` (catch do pump, item de chat gravado em disco) e `:469` (`result.errors`).
- **Back / TL:** `redactPatterns` puro aplicado nos 4 pontos.
- **Decisão (PO):** mitigação registrada e aceita. `redactPatterns` puro cobre `sk-ant-[\w-]+`, `Bearer\s+\S+`, JWT `eyJ…`, `x-api-key`, query `token`/`key`/`code`/`access_token` e a apiKey salva. Ele roda nos 4 pontos, junto com o redact por valor exato que já existe. Teste com espião no `console.error` e leitura do arquivo de sessão em disco. O bloqueante cai com essa mitigação. Se o `redactPatterns` atrasar, "Detalhes técnicos" fica escondido.

### Tema: mensagem de erro repetida no turno (H06.3)
- **TL:** o erro pode aparecer até 3 vezes no mesmo turno (balão do assistente com a mensagem sintética em inglês, `result.errors` e catch).
- **Decisão (PO):** um card por turno. A mensagem sintética some quando `msg.error` existir. Sem isso, o card em PT-BR conviveria com o texto cru.

### Decisões rápidas
- **Tema padrão:** Escuro para settings existente sem `theme`; Sistema em instalação nova (TL confirmou que dá para fazer).
- **Mecânica do tema:** `nativeTheme.themeSource` no main + `@media (prefers-color-scheme: light)` no `tokens.css`; sem IPC nem listener novo no renderer.
- **Ordem:** tema primeiro. Legado ≤ 50% (`views.css` inteiro + ~350 linhas do `app.css`) com timebox; zerar a camada é extra.
- **Erro na fila:** conta no teto de 3, mas nunca sai sem ação do usuário. Sai primeiro a notificação mais antiga que não é erro. Com 3 erros na tela, o próximo vira "+N erros". "Fechar todos" aparece a partir de 2 erros. Tudo testado no reducer.
- **Entrar de novo:** instruções + chave da API. Rodar o `claude.exe` empacotado com `/login` só com spike e ADR (Won't).
- **Detalhes técnicos:** recolhidos e redigidos no main, com botão "Copiar detalhes" que copia o mesmo texto redigido. O original nunca chega ao renderer.
- **Classificação:** campo tipado `SDKAssistantMessage.error` do SDK 0.3.330. `authentication_failed` não separa expirada, chave recusada e sem credencial, então o desempate usa `hasApiKey`/`apiKeySource` + `api_error_status` 401, e o texto só como fallback. As fixtures viram contrato; enum desconhecido vira `unknown`; atualizar o SDK obriga a regravar as fixtures.
- **Accent no claro:** índigo escuro (~`#3d4ed8`) com `--on-accent` branco; anel de foco ≥ 3:1.
- **H06.7:** sobe para Should e é feita junto com a H06.3, já que o enum tipado confirmado deixa o custo quase zero.
- **Contagem de `notify`:** o grep do Front (41) vale como inventário. O critério de aceite é o typecheck sem `notify(string)`, não a contagem.
- **Achado de processo:** `.claude/agents/ux-designer.md` ainda diz "accent terracota" (ADR-014 é índigo). Corrigir em commit `docs:`, com aprovação do usuário por ser configuração de agente.

### Decisões no build (PO, sobre o inventário e a microcopy do UX — `sprint-06/ux-notificacoes.md`)
- **Não-erro com 3 erros na tela:** entra na tela e o erro mais antigo vai para os recolhidos ("+N erros"); volta quando o não-erro sai, sem reanúncio pelo `role="alert"`. Erro continua só saindo por ação do usuário.
- **Conquista fora do teto de 3:** faixa própria, uma visível por vez, fila própria, região `polite`.
- **Dedupe:** mesma mensagem (tipo + texto) visível ou recolhida soma "×N" e renova o prazo, sem limite de tempo; depois de fechada, abre card novo. O caso "< 5 s" segue no teste.
- **"Fechar todos (N)":** total visível + recolhidos, sem confirmação; ao fechar pelo teclado, o foco vai para a próxima notificação ou volta ao elemento anterior (evidência no E2E ou roteiro de teclado).
- **`auth_expired`:** "Como entrar de novo" é a ação principal; a chave da API vira secundária e o corpo diz que ela é cobrada por uso. Em `auth_invalid_key`, "Trocar chave" segue principal.
- **`auth_missing`** ganha "Tentar de novo"; **"Claude: sem créditos"** na barra de status entra na H06.7 (sai junto se ela sair).
- **Erro de sessão não ativa:** a notificação cita o título da sessão (como texto) e vai sem ação. Navegar com `sessionId` → backlog da Sprint 07 (muda o contrato da ação, exige TL e Sec).
- **Na T10:** "Chave removida." quando o campo vazio remove a chave; códigos do Supabase Auth (`otp_expired`, `over_email_send_rate_limit`…) no dicionário `errorText`, com teste; `recarregarPerfil` chama `profile.refresh()` se ela já existir e só ler (TL confere), senão o perfil fica sem "Tentar de novo". Se a T10 apertar, sai primeiro o `recarregarPerfil`.
- **URL de "Como entrar de novo":** `https://code.claude.com/docs/en/iam` (conferida em 2026-11-24). Textos de expiração da doc ("Login reached its time limit", "Login expired") entram no classificador.

## Riscos aceitos
- **Baixa:** com git confiado, o Bash do agente rodando `cd sub && git status` lê `sub/.git` sem a inspeção do DevDeck. Mitigação: Bash sempre pede aprovação (H05.5, nunca recebe "Sempre"), e a linha "processo do agente" do checklist registra o caso.
- **Baixa:** o `redactPatterns` trabalha por padrão e pode não pegar um formato novo de token. Mitigação: redact por valor exato da chave salva, detalhes recolhidos e redigidos no main, original nunca no renderer.
- **Baixa:** a classificação depende do enum do SDK 0.3.330, e uma atualização pode mudar valores. Falha segura: vira `unknown` com texto genérico; as fixtures obrigam a revisar a cada atualização.
- **Baixa:** o checksum da CLI do Supabase vem do mesmo release que o binário. Protege contra troca posterior e adulteração no download, não contra um release comprometido na origem.
- **Baixa:** sem prova automática para OAuth expirada real, pausa com hover e nativa sem foco. Ficam no roteiro manual da sprint.

## Pendências com o usuário
- Ruleset da `main`: tornar o job `db` obrigatório no primeiro run verde (ação de admin). Até lá a H06.6 fica aberta.
- ~~Aprovar a correção de `.claude/agents/ux-designer.md`~~ e ~~citar `src/shared/lib/` no `CLAUDE.md`~~: aprovados em 2026-11-24 (T49).

## Achados do fechamento da Sprint 05 (2026-11-25) — levar ao PO e à Cybersecurity
- **Revisar o 1º risco aceito acima:** com `permissionMode: 'default'`, o Claude Code libera Bash só-leitura (`git status`, `ls`) sem chamar `canUseTool`. Visto no app instalado: `git status` pelo Bash do agente rodou sem card. A mitigação "Bash sempre pede aprovação" não vale para esses comandos. Caminho provável: hook `PreToolUse` no SDK forçando `ask` para Bash ou regra de permissão explícita.
- **Instância única:** sem `app.requestSingleInstanceLock()`; abrir o DevDeck de novo cria outra instância sobre o mesmo `%APPDATA%\DevDeck` (corrida nos JSON do store). Corrigir com foco na janela existente em `second-instance`.
- **Env restrito não é sandbox:** sem confiança, o agente ofereceu rodar git "sem essa variável". Um `env -u GIT_DIR git …` depende só da aprovação do Bash; o card precisa deixar claro quando o comando mexe em `GIT_*`.

## Backlog para a Sprint 07
- "Ver no chat" abrindo a sessão do erro quando ela não é a ativa (`navegar` com `sessionId` UUID): exige TL e Sec.

## Tarefas (Tech Lead)
Fatos do código que entraram no desenho: `tests/unit/guard.test.ts` só vigia `src/main/lib` e `src/renderer/src/lib` (T03); `agentEnv` repassa `ANTHROPIC_BASE_URL`, então o E2E aponta o SDK para o servidor falso sem mexer no pacote; `api_error_status` existe no resultado do SDK 0.3.330 (`sdk.d.ts:6443`).

| Tarefa | Papel | Status |
|---|---|---|
| T01 · H06.3/H06.7 · **Spike, 1º dia:** capturar mensagens reais do SDK 0.3.330 para OAuth expirada real, chave falsa (401), sem credencial, 429, 529, `billing_error` e sem rede (`api_retry`). Confirmar `SDKAssistantMessage.error`, `api_error_status` e se "sem credencial" chega só por texto. Saída: `tests/fixtures/agent-errors/*.json`, redigidas e com a origem anotada. Decide se a H06.7 continua Should | Back | feito (OAuth expirada: fixture sintética, prova real na T26) |
| T02 · todas · ADR-020 e ADR-021 em `docs/decisions.md` | TL | feito |
| T03 · H06.2 · `guard.test.ts` passa a vigiar `src/shared/lib`, proibindo também `window` e `document` | TL | feito |
| T04 · H06.2 · `src/shared/lib/errorText.ts` (tira o prefixo do IPC, traduz `23505`, o limite da `0002`, `ENOENT`, `EACCES`, rede e o genérico) + `tests/unit/shared/errorText.test.ts`. Dep. T03 | Front | feito |
| T05 · H06.2 · `src/shared/lib/nativeNotify.ts` (`deveNotificarNativo`) + teste. Dep. T03 | Front | feito |
| T06 · H06.2 · Reducer `src/renderer/src/lib/notifications.ts` com `now` injetado: teto 3, erro conta e não sai sozinho, "+N erros", "Fechar todos" a partir de 2 erros, dedupe de 5 s com "×N" e campo `historico` (20). Teste em `tests/unit/renderer/notifications.test.ts` | Front | feito |
| T07 · H06.2 · União `AcaoNotificacao` e lista nomeada `RetryOp` mapeada no store. Teste: nenhuma `RetryOp` aprova, liga "Sempre" ou executa comando. Dep. T06 | Front | feito |
| T08 · H06.2 · Inventário das 41 chamadas de `notify` com tipo e microcopy, na seção de tarefas da sprint | UX | feito (`sprint-06/ux-notificacoes.md`) |
| T09 · H06.2 · `components/Notifications.tsx`: ícone lucide, tokens `--notify-*`, `role="alert"` e região `status` montada no boot, pausa com hover e foco, fechar com `aria-label` e 24 px, conquista com visual próprio, `prefers-reduced-motion`, posição fora do composer e do card. CSS no `shell.css`. Dep. T06 | Front | feito |
| T10 · H06.2 · `store.ts`: `notify({ tipo, texto, acao? })`, sai o `toast: string`, migram as 41 chamadas e saem `errorText` (McpView) e `errMsg` (CommunityView). Dep. T04, T08, T09 | Front | feito |
| T11 · H06.2 · Main traduz `ENOENT`, `EACCES` e rede no handler com contexto (`agent.ts` `revertChange`, `agenda.ts`, provedores). Dep. T04 | Back | feito |
| T12 · H06.2 · `deveNotificarNativo` em `achievements.ts:52` e `agenda.ts:157`. Evento novo de lembrete main→renderer com `{ id, titulo }` em `src/shared/types.ts`. Dep. T05 | Back | feito |
| T13 · H06.2 · Renderer: aprovação passa a usar `!document.hasFocus()` (`store.ts:293`), `FlowCard.tsx` passa pela regra e o lembrete vira toast info "Abrir na agenda". Dep. T10, T12 | Front | feito |
| T14 · H06.2/H06.3 · Helper `tests/e2e/helpers/fake-api.mjs`: servidor em `127.0.0.1` com 200, 401 (`sk-ant-…`/`Bearer …` falsos), 429, 529 e billing, ligado por `ANTHROPIC_BASE_URL` | QA | feito |
| T15 · H06.3 · `redactPatterns` em `src/main/lib/secrets.ts` (padrões da ata + apiKey salva) + casos em `secrets.test.ts` | Back | feito |
| T16 · H06.3 · Aplicar redact por padrão e por valor exato em `agent.ts:285`, `:303`, `:320` e `:469`. Dep. T15 | Back | feito |
| T17 · H06.3/H06.7 · `src/main/lib/agentErrors.ts` (enum → `AgentErrorCode`, desempate por `hasApiKey`/`apiKeySource` + `api_error_status`, texto só como fallback, desconhecido → `unknown`). Teste em `tests/unit/main/agentErrors.test.ts` lendo as fixtures. Dep. T01 | Back | feito |
| T18 · H06.3 · `ChatItem` de erro ganha `code?: AgentErrorCode` e `detail?` (redigido no main) em `shared/types.ts`. `handleMessage` não cria balão quando há `msg.error`. Um card por turno: `result.errors` e o catch do pump só preenchem o mesmo item. Dep. T16, T17 | Back | feito |
| T19 · H06.3 · Canal `help:open` com `z.enum(['claude-login'])` → URL https fixa no main (`ipc.ts`, `validation.ts`) + teste em `validation.test.ts` | Back | feito |
| T20 · H06.3 · Card no `ChatView.tsx`: texto fixo por `code`, as 3 ações por código, "Detalhes técnicos" recolhido com "Copiar detalhes", "Tentar de novo" desabilitado durante o turno e composer preservado. Dep. T18, T19 | Front | feito |
| T21 · H06.3 · `src/renderer/src/lib/authStatus.ts` (deriva o estado dos itens da sessão) + teste. Chip no `StatusBar.tsx` com ação. Toast "Erro no chat" com "Ver no chat" só fora da aba do chat. Dep. T18, T10 | Front | feito |
| T22 · H06.3 · Microcopy dos cards de autenticação e dos 4 da H06.7, com a URL de "Como entrar" | UX | feito (`sprint-06/ux-notificacoes.md`) |
| T23 · H06.3 · Regressão em `turns.test.ts`: falha de autenticação não conta | Back | feito |
| T24 · H06.3 · `tests/e2e/auth-error.e2e.mjs`: card certo e nenhum valor falso na tela, no stdout/stderr do Electron nem no JSON da sessão no `--user-data-dir`. Dep. T14, T20 | QA | a fazer |
| T25 · H06.2 · `tests/e2e/notifications.e2e.mjs`: 5 tipos por fluxo real (conquista pelo 1º turno no fake-api) + axe. Entra no `test:e2e` do `package.json`. Dep. T13, T14 | QA | a fazer |
| T26 · H06.3 · Roteiro manual com a OAuth expirada real no app instalado, prints em `docs/sprints/sprint-06/` | QA | a fazer |
| T27 · H06.1 · Paleta clara: primitivos e semânticos, accent `#3d4ed8`, diff claro, `--viz-heat-*` invertida | UX | a fazer |
| T28 · H06.1 · `src/main/lib/theme.ts` (`resolveTheme(raw, existia)` e mapa `THEME_BG`) + teste. Inclui teste que compara o `THEME_BG` com o `--bg` de cada tema no `tokens.css` | Back | feito |
| T29 · H06.1 · `theme` em `AppSettings`, `z.enum` no `settingsPatch`, normalização em `store.ts` (inválido → `system`, padrão por instalação) + testes em `validation.test.ts`. Dep. T28 | Back | feito |
| T30 · H06.1 · `index.ts`: `nativeTheme.themeSource` antes de criar a janela e a cada troca, `backgroundColor` pelo mapa e `setBackgroundColor` no `nativeTheme.on('updated')`. Dep. T29 | Back | feito |
| T31 · H06.1 · `tokens.css` com `@media (prefers-color-scheme: light)`. `contrast.test.ts` parametrizado: todo semântico existe nos dois temas e o caso do accent é invertido. Dep. T27 | Front | a fazer |
| T32 · H06.1 · Versões claras de `--hover-tint`, `--shadow`, `--scrim` e `--viz-heat-*`. Regras do legado afetadas saem do legado (catraca no `css-layers.test.ts`). Dep. T31 | Front | a fazer |
| T33 · H06.1 · Aparência em `SettingsView.tsx`: `radiogroup` e "Sistema (agora: X)" por `matchMedia`. Embed do Spotify segue o tema. Dep. T29 | Front | a fazer |
| T34 · H06.1 · `DiffView.tsx`: `+`/`-` no texto acessível e contraste AA no claro | Front | a fazer |
| T35 · H06.1 · `tests/e2e/theme.e2e.mjs`: troca, persistência após reiniciar, `getBackgroundColor()`, axe nos dois temas (8 abas, paleta, ajuda, aprovação, Git pausado) e capturas 1280×720. Diálogo nativo no tema fica no roteiro manual. Dep. T30–T34 | QA | a fazer |
| T36 · H06.1 · READMEs EN/PT sem "tema escuro apenas", com captura do claro. Emenda ao ADR-014. Dep. T35 | Front + TL | a fazer |
| T37 · H06.4 · Seção "Checklist de ameaça" em `docs/sprints/_template.md` | Sec | a fazer |
| T38 · H06.4 · Caso gitlink sem `.git/modules` com filtro malicioso e controle positivo em `tests/integration/git-exec.test.ts` | Back + QA | a fazer |
| T39 · H06.6 · `supabase/config.toml` mínimo (sem `project_id` real) | DevOps | feito (porta 55322: o Windows reserva 53952–54451) |
| T40 · H06.6 · Job `db` no `ci.yml`: `curl` + `sha256sum -c` (hash citado do arquivo oficial), `supabase db start`, `supabase test db`, `contents: read`, `persist-credentials: false`, sem secret. Duração registrada | DevOps | a fazer |
| T41 · H06.6 · `supabase/tests/0001_community.sql` com `anon` e `authenticated` (é o corte interno). Dep. T40 | Back | a fazer |
| T42 · H06.6 · Controle positivo num branch descartável com o link do run vermelho no PR. Emenda ao ADR-010. Dep. T40 | DevOps + TL | a fazer |
| T43 · H06.6 · Usuário torna o `db` obrigatório no ruleset no 1º run verde, com a data registrada na ata. Dep. T40 | Usuário (admin) | a fazer |
| T44 · H06.5 · Criar a camada `views` em `index.css` (`tokens, legacy, base, shell, views`) e a catraca de linhas do legado no `css-layers.test.ts` | Front | a fazer |
| T45 · H06.5 · Migrar o `views.css` por área (uma tarefa e um commit por aba), com escopo e sem `!important`, capturas antes e depois nos dois temas e axe. Timebox M. Dep. T44, T35 | Front + QA | a fazer |
| T46 · H06.5 · ~350 linhas do `app.css` até chegar a ≤ 835. Zerar a camada é extra. Dep. T45 | Front | a fazer |
| T47 · H06.8 · "Alternar tema" na paleta (`commands.ts`), passando pelo mesmo `settings.set` | Front | a fazer |
| T48 · H06.9 · Sino na `StatusBar.tsx` lendo o `historico` do reducer, com "Limpar (só desta sessão)" | Front + UX | a fazer |
| T49 · processo · Corrigir o accent em `.claude/agents/ux-designer.md` e citar `src/shared/lib/` no `CLAUDE.md` (aprovados pelo usuário em 2026-11-24) | TL | feito |
| T50 · entrega · `CHANGELOG.md` 0.6.0, versão no `package.json`, QA, security review e retro da sprint | TL + QA + Sec | a fazer |
| T51 · entrega · `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e` verdes | TL | a fazer |

### Resultado do spike T01 (2026-11-24)
Capturado com `CLAUDE_CONFIG_DIR` vazio e chave falsa contra servidor local (sem tocar a conta real). Fixtures em `tests/fixtures/agent-errors/`.

| Cenário | `init.apiKeySource` | `assistant.error` | `result.api_error_status` | Texto do SDK |
|---|---|---|---|---|
| chave recusada | `ANTHROPIC_API_KEY` | `authentication_failed` | 401 | "Invalid API key · Fix external API key" |
| sem credencial | `none` | `authentication_failed` | `null` | "Not logged in · Please run /login" |
| limite (429) | `ANTHROPIC_API_KEY` | `rate_limit` | 429 | "API Error: Request rejected (429) · …" |
| sobrecarga (529) | `ANTHROPIC_API_KEY` | **`server_error`** | 529 | "API Error: 529 Overloaded. …" |
| créditos | `ANTHROPIC_API_KEY` | `billing_error` | 400 | "Credit balance is too low" |
| sem rede | `ANTHROPIC_API_KEY` | `server_error` | `null` | "API Error: Connection refused … (ECONNREFUSED)" |
| OAuth expirada | `none` (OAuth válido também vem `none`) | — | — | não capturável: sessão do usuário estava válida em 2026-11-24 (rodou com autorização; turno normal). Texto conhecido da Sprint 05: "OAuth session expired and could not be refreshed" |

- O enum tipado existe e cobre os casos da H06.7 → **H06.7 continua Should**.
- `apiKeySource: 'none'` vale tanto para "sem credencial" quanto para login OAuth. Logo `auth_missing` × `auth_expired` só se separam pelo texto ("Not logged in" × "OAuth … expired"); sem casar nenhum dos dois, `authentication_failed` sem chave vira `auth_expired` com o texto genérico "Sua sessão do Claude não é válida" (falha segura: as duas ações servem). A fixture `oauth-expired.json` é sintética, com o texto da Sprint 05, e anotada como tal; a prova real fica no roteiro manual (T26).
- 529 chega como `server_error`, não `overloaded`: o classificador usa o status 529. Sem rede = `server_error` + status `null` + `ECONNREFUSED`/`ENOTFOUND` no texto.
- Em todos os casos o `result` vem com `subtype: 'success'` + `is_error: true` **e** a iteração da query lança "Claude Code returned an error result: …". É a origem do erro triplicado (T18).
- O corpo do 401 levava `sk-ant-…` e `Bearer …` falsos e eles não apareceram em nenhuma mensagem: o SDK reescreve o texto. O `redactPatterns` continua obrigatório (stderr, OAuth e rethrow).

Emendas a anexar no fim da sprint (T36, T42, T16): ADR-014 (tema claro e camada `views`), ADR-015 (`redactPatterns`), ADR-010 (job `db`).

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
