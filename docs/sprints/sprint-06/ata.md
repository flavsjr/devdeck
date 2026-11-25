# Sprint 06 — ata do debate

Movida da `sprint-06.md` em 2026-11-25 (processo novo, ver `docs/squad.md` → "Economia de contexto"). Resumo das decisões no painel da sprint.

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

### Tema: lista branca de tools do agente (H06.10, 2026-11-25)
**Convocados:** PO, TL, Back (dono, pelo orquestrador), Sec, QA · brief único com fatos medidos no SDK 0.3.330 (31 tools por padrão; conectores do claude.ai carregam depois do `init`; com `tools` + `disableClaudeAiConnectors` o subagente fica só com a lista).
- **TL:** de acordo; `askHook.ts` → `agentPolicy.ts`; manter Task; sem `strictMcpConfig` (quebraria ADR-013). P, Must.
- **Sec:** sem bloqueante; manter Task e WebSearch. **[alta]** trava em runtime: hook em toda tool negando fora da lista e MCP de origem não aceita. **[média]** teste com subagente rodando `git status` e agente de projeto com `tools: Monitor`.
- **QA:** unit extraindo as opções do `query()` para função pura; integração lendo `init.tools` (sai sem login → roda no CI, comparar como subconjunto); subagente só com turno do modelo → local.
- **Decisão (PO):** hook de deny aceito agora (única trava se o SDK mudar). Teste com subagente local e opt-in, com evidência no `qa.md`; sem ele a história não fecha. Must, P+. `AskUserQuestion` com UI fica para a Sprint 07.
- **Security review (2026-11-25):** média sobre `permissionMode` declarado por agente de projeto. Medido sem brecha; mitigação com variação (acceptEdits → ask, demais → deny) registrada no `qa.md`. Code review do TL: aprovado; risco do `ToolSearch` descartado por teste.
