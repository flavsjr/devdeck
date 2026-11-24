# Sprint 06 — Inventário de notificações e microcopy (UX, T08 e T22)

Fonte para a T10 (migração do `notify`), a T13 (lembrete), a T20 (card de erro) e a T21 (barra de status).

## Notação
- **errorText(err):** helper de `@shared/lib/errorText` (substitui `errorText` da McpView e `errMsg` da CommunityView).
- **motivoConhecido(err) ?? '…':** leitura em segundo plano, onde o genérico sem contexto não ajuda.
- Prefixo para leitor de tela: "Erro:", "Aviso:", "Sucesso:", "Info:", "Conquista:".

Rótulo do botão de ação (fixo, derivado pelo componente):

| Ação | Rótulo |
|---|---|
| repetir (qualquer op) | Tentar de novo |
| navegar chat | Ver no chat |
| navegar changes | Abrir Alterações |
| navegar mcp | Abrir MCP |
| navegar profile | Ver no perfil |
| navegar agenda | Abrir na agenda |
| navegar community | Abrir Comunidade |
| navegar costs | Abrir Custos |
| navegar settings | Abrir Configurações |

## T08 — Inventário (43 chamadas)

| # | arquivo:linha | Texto atual | Tipo | Texto novo | Ação |
|---|---|---|---|---|---|
| 1 | commands.ts:40 | Abra uma pasta de projeto antes de criar um chat. | aviso | (mantém) | — |
| 2 | commands.ts:51 | Há aprovação pendente: o painel fica aberto até você decidir. | aviso | Há uma aprovação pendente. O painel fica aberto até você decidir. | — |
| 3 | store.ts:127 | err.message (refreshGit) | erro | errorText(err) | repetir `recarregarGit` |
| 4 | store.ts:135 | err.message (reviewGitTrust) | erro | errorText(err) | — (confiança não entra em RetryOp) |
| 5 | store.ts:205 | err.message (newSession) | erro | errorText(err) | — |
| 6 | store.ts:230 | err.message (send) | erro | errorText(err) | — |
| 7 | store.ts:262 | errorText(err) (falha do `repetir`) | erro | errorText(err) | — (sem ação, evita laço) |
| 8 | store.ts:338 | Conquista desbloqueada: {icon} {title} (+{xp} XP) | conquista | `{title} (+{xp} XP)` (sem emoji no texto) | navegar `profile` |
| 9 | ChangesView.tsx:50 | e.message (git diff) | erro | errorText(err) | — |
| 10 | ChangesView.tsx:63 | e.message (restore) | erro | errorText(err) | — (destrutivo, nunca repetir) |
| 11 | AgendaView.tsx:74 | Dê um título ao evento. | aviso | (mantém) | — |
| 12 | AgendaView.tsx:75 | O link precisa começar com https:// | aviso | O link da reunião precisa começar com https://. | — |
| 13 | AgendaView.tsx:197 | e.message (saveFeed, editar) | erro | errorText(err) | — |
| 14 | AgendaView.tsx:201 | Cole um link https:// ou webcal:// de calendário ICS. | aviso | Cole um link https:// ou webcal:// de um calendário ICS. | — |
| 15 | AgendaView.tsx:208 | e.message (saveFeed, novo) | erro | errorText(err) | — |
| 16 | AgendaView.tsx:214 | Falha ao sincronizar: {added.error} | aviso | Calendário adicionado, mas a sincronização falhou: {errorText(added.error)} | — |
| 17 | ChatView.tsx:48 | r.error ?? 'Falha ao reverter.' | erro | r.error ? errorText(r.error) : `Não foi possível reverter a alteração em {arquivo}.` | — |
| 18 | CommunityView.tsx:83 | error.message (signInWithOtp, cru em inglês) | erro | `over_email_send_rate_limit`: "Muitos pedidos de código. Espere alguns minutos e tente de novo." Outros: motivoConhecido(err) ?? "Não foi possível enviar o código. Confira o e-mail e tente de novo." | — |
| 19 | CommunityView.tsx:91 | error.message (verifyOtp, cru) | erro | `otp_expired`: "Código inválido ou expirado. Confira os 6 dígitos ou peça um novo código." Outros: motivoConhecido(err) ?? "Não foi possível verificar o código. Tente de novo." | — |
| 20 | CommunityView.tsx:134 | 23505 → 'Esse username já existe.' / error.message | 23505: aviso; resto: erro | 23505: "Esse @username já está em uso. Escolha outro." Resto: errorText(err) | — |
| 21 | CommunityView.tsx:175 | error.message (publicar) | erro | errorText(err) | — |
| 22 | CommunityView.tsx:176 | Publicado. | sucesso | Post publicado. | — |
| 23 | CommunityView.tsx:253 | error.message (carregar comentários) | erro | motivoConhecido(err) ?? "Não foi possível carregar os comentários." | — |
| 24 | CommunityView.tsx:263 | error.message (comentar) | erro | errorText(err) | — |
| 25 | CommunityView.tsx:274 | Entre na comunidade para denunciar um post. | aviso | (mantém) | — |
| 26 | CommunityView.tsx:281 | Descreva o motivo (mínimo 3 caracteres). | aviso | (mantém) | — |
| 27 | CommunityView.tsx:285 | 23505 → 'Você já denunciou este post.' / error.message | 23505: info; resto: erro | 23505: (mantém). Resto: errorText(err) (cobre o limite de denúncias) | — |
| 28 | CommunityView.tsx:287 | Denúncia registrada. Obrigado por ajudar a comunidade! | sucesso | Denúncia enviada. Obrigado por ajudar a comunidade. | — |
| 29 | CommunityView.tsx:293 | error.message (excluir post) | erro | errorText(err) | — |
| 30 | CommunityView.tsx:329 | Código copiado. | sucesso | (mantém); falha do clipboard: erro "Não foi possível copiar." | — |
| 31 | CommunityView.tsx:433 | error.message (carregar feed) | erro | motivoConhecido(err) ?? "Não foi possível carregar o feed." | — |
| 32 | CommunityView.tsx:475 | errMsg(error) (curtir) | erro | errorText(err) (cobre o limite de curtidas) | — |
| 33 | McpView.tsx:75 | Nome: use só letras, números, - e _. | aviso | Nome do servidor: use só letras, números, - e _. | — |
| 34 | McpView.tsx:76 | Informe o comando. | aviso | Informe o comando do servidor. | — |
| 35 | McpView.tsx:77 | Informe a URL. | aviso | Informe a URL do servidor. | — |
| 36 | McpView.tsx:82 | errorText local (salvar) | erro | errorText(err) | — |
| 37 | McpView.tsx:90 | errorText local (ligar/política) | erro | errorText(err) | — |
| 38 | McpView.tsx:116 | errorText local (importar) | erro | errorText(err) | — |
| 39 | McpView.tsx:119 | Importados (desligados): … / Nada novo para importar. | com itens: sucesso; sem itens: info | Com itens: "Importados {n}, desligados: {nomes}. Ligue cada um quando quiser usar." Sem itens: "Nada novo para importar." (mantém: o E2E usa) | — |
| 40 | ProfileView.tsx:129 | e.message (conectar token) | erro | errorText(err) | — |
| 41 | ProfileView.tsx:256 | e.message (atualizar perfil) | erro | errorText(err) | — (`recarregarPerfil` não roda `profile.refresh()`) |
| 42 | SettingsView.tsx:29 | Chave salva (criptografada pelo sistema). | sucesso | Com chave: (mantém). Campo vazio: "Chave removida." | — |
| 43 | SettingsView.tsx:31 | e.message (salvar chave) | erro | errorText(err) | — |

Chamadas novas da sprint:
- **Lembrete (T13):** info, "Lembrete da agenda: {título}", navegar `agenda`.
- **"Erro no chat" (T21):** ver abaixo.
- **"Copiar detalhes" (T20):** sucesso, "Detalhes copiados."; falha: erro, "Não foi possível copiar."

Achados:
1. `SettingsView.tsx:29` diz "Chave salva" quando o campo vazio remove a chave (`setApiKey(null)`).
2. Erros do Supabase Auth (`otp_expired`, `over_email_send_rate_limit`, minúsculos) não casam com o dicionário: texto fixo nas linhas 18/19 ou mapear no `errorText`.
3. `recarregarPerfil` só incrementa `achievementsVersion`; sem `profile.refresh()`, "Tentar de novo" no perfil enganaria.
4. `store.ts:230` não é erro de turno (só o rethrow do `decideWorkspace`); o toast não duplica o card da H06.3.
5. Validação vira toast; o certo seria mensagem ao lado do campo (`aria-invalid` + `aria-describedby`). Fica para depois.

## T22 — Cards de erro do Claude

Regras gerais:
- "Tentar de novo" só por clique; durante turno fica desabilitado, com `aria-describedby`: "Aguarde a resposta atual terminar."
- "Como entrar" / "Como entrar de novo": ícone de link externo e `aria-label` com "(abre no navegador)".
- "Detalhes técnicos" (todos os cards): botão com `aria-expanded`; dentro, texto redigido em monoespaçada e "Copiar detalhes".
- Ícone + título em todo card, nunca só cor. Autenticação, créditos e desconhecido: `--bad`. Limite, sobrecarga e rede: `--warn`.

| Código | Título | Corpo | Ações (primária primeiro) | Barra de status |
|---|---|---|---|---|
| auth_expired | Sua sessão do Claude expirou | O login do Claude Code usado pelo DevDeck não vale mais, e o Claude não recebeu sua última mensagem. Entre de novo pelo terminal (rode `claude` e digite `/login`) ou use uma chave da API, que é cobrada por uso. Depois, clique em Tentar de novo. | **Como entrar de novo** · Usar chave da API · Tentar de novo | Claude: sessão expirada |
| auth_expired (fallback, texto não reconhecido) | Sua sessão do Claude não é válida | O login do Claude Code usado pelo DevDeck não foi aceito, e o Claude não recebeu sua última mensagem. Entre de novo pelo terminal (rode `claude` e digite `/login`) ou use uma chave da API, que é cobrada por uso. Depois, clique em Tentar de novo. | as mesmas | Claude: sessão expirada |
| auth_invalid_key | A chave da API foi recusada | A Anthropic não aceitou a chave da API salva no DevDeck. Ela pode ter sido revogada, digitada errada ou ser de outra organização. Troque a chave em Configurações e clique em Tentar de novo. | **Trocar chave** · Tentar de novo | Claude: chave recusada |
| auth_missing | Nenhuma conta do Claude conectada | O DevDeck não encontrou login do Claude Code nem chave da API, então o Claude não recebeu sua mensagem. Entre pelo terminal (rode `claude` e digite `/login`) ou adicione uma chave da API. | **Como entrar** · Adicionar chave da API · Tentar de novo | Claude: sem conta |
| rate_limit | Limite de uso do Claude atingido | O Claude não processou sua última mensagem. Espere alguns minutos e clique em Tentar de novo. | **Tentar de novo** | — |
| overloaded | O Claude está sobrecarregado agora | O problema é do lado da Anthropic, não da sua conta. Espere alguns instantes e clique em Tentar de novo. | **Tentar de novo** | — |
| billing | Os créditos da sua chave da API acabaram | A Anthropic recusou a mensagem por falta de saldo. Adicione créditos no Console da Anthropic ou troque por outra chave. | **Trocar chave** · Tentar de novo | Claude: sem créditos |
| network | Sem conexão com o Claude | Confira a internet, a VPN ou o proxy e clique em Tentar de novo. | **Tentar de novo** | — |
| unknown | O Claude não conseguiu responder | Aconteceu um erro que o DevDeck não reconhece. Tente de novo. Se continuar, abra Detalhes técnicos e copie o texto para relatar o problema. | **Tentar de novo** · Detalhes técnicos | — |

"Usar chave da API", "Trocar chave" e "Adicionar chave da API" abrem Configurações com foco no campo da chave.

Chip da barra de status: ícone + texto; ação navegar `chat` (`aria-label` "Claude: sessão expirada. Ver no chat"); some no próximo turno concluído.

Notificação em outra aba: erro, "Erro no chat: " + título do card com inicial minúscula (ex.: "Erro no chat: sua sessão do Claude expirou."), ação navegar `chat`. Nunca leva a mensagem original. Erro de sessão que não é a ativa: o texto cita a sessão e a notificação vai sem ação.

URL de "Como entrar de novo" (`claude-login`): `https://code.claude.com/docs/en/iam` (conferida em 2026-11-24: 200 OK, "Authentication"; traz "Run `/login` to renew" e o local das credenciais, `%USERPROFILE%\.claude\.credentials.json` no Windows). Textos de sessão expirada citados na doc: "Login reached its time limit", "Login expired".
