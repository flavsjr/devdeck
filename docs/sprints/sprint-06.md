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

## Riscos aceitos
- **Baixa:** com git confiado, o Bash do agente rodando `cd sub && git status` lê `sub/.git` sem a inspeção do DevDeck. Mitigação: Bash sempre pede aprovação (H05.5, nunca recebe "Sempre"), e a linha "processo do agente" do checklist registra o caso.
- **Baixa:** o `redactPatterns` trabalha por padrão e pode não pegar um formato novo de token. Mitigação: redact por valor exato da chave salva, detalhes recolhidos e redigidos no main, original nunca no renderer.
- **Baixa:** a classificação depende do enum do SDK 0.3.330, e uma atualização pode mudar valores. Falha segura: vira `unknown` com texto genérico; as fixtures obrigam a revisar a cada atualização.
- **Baixa:** o checksum da CLI do Supabase vem do mesmo release que o binário. Protege contra troca posterior e adulteração no download, não contra um release comprometido na origem.
- **Baixa:** sem prova automática para OAuth expirada real, pausa com hover e nativa sem foco. Ficam no roteiro manual da sprint.

## Pendências com o usuário
- Ruleset da `main`: tornar o job `db` obrigatório no primeiro run verde (ação de admin). Até lá a H06.6 fica aberta.
- Aprovar a correção de `.claude/agents/ux-designer.md` ("accent terracota" → índigo).
- Decidir se o `CLAUDE.md` passa a citar `src/shared/lib/` como lugar de regra pura usada pelos dois lados (registrado no ADR-020).

## Tarefas (Tech Lead)
| Tarefa | Papel | Status |
|---|---|---|

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
