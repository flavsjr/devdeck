# Sprint 02 — DevDeck: perfil, conquistas, agenda e comunidade

**Período:** 2026-11-23 · **Versão:** v0.2.0 · **Status:** concluída (pendências de QA manual listadas abaixo)

## Objetivo
Transformar o hub de vibe coding em **DevDeck**: o cockpit do dev, com identidade (perfil + métricas git + conquistas), rotina (agenda/dailies) e comunidade (artigos e snippets).

## Histórias (PO)

### H02.1 — Renomear para DevDeck sem perder dados
- [x] Nome, janela, pacote e textos viram DevDeck.
- [x] Dados de `%APPDATA%/vibedeck` são copiados na primeira execução.

### H02.2 — Perfil com métricas de GitHub, GitLab e Bitbucket
*Como dev, quero ver minha atividade de todas as plataformas num lugar só.*
- [x] Conectar cada provedor com token pessoal de leitura (GitLab aceita URL self-hosted).
- [x] Commits, PRs, reviews, sequência atual/recorde, dias ativos nos últimos 6 meses.
- [x] Heatmap de 26 semanas, linguagens, repositórios mais ativos.
- [x] Erro de um provedor não derruba os outros e aparece no cartão dele.

### H02.3 — Conquistas
- [x] 31 conquistas em 5 categorias, com progresso, XP e nível.
- [x] Desbloqueio notifica (toast + notificação do sistema).
- [x] Até 3 conquistas em destaque no perfil (e no perfil público da comunidade).

### H02.4 — Agenda com dailies e lembretes
- [x] Eventos locais com recorrência (dias úteis, diária, dias da semana), duração, link e notas.
- [x] Atalho "Daily seg–sex 9h30".
- [x] Lembrete N minutos antes (notificação + banner com **Entrar**).
- [x] Assinar calendário ICS (Outlook/Google) somente leitura, com sync a cada 30 min.
- [x] "Hoje" no painel direito e próximo evento na barra de status.

### H02.5 — Comunidade de artigos e snippets
- [x] Feed público (Supabase) com filtro por tipo, busca no título e tag.
- [x] Login por código de e-mail; @username público com nível e destaques.
- [x] Publicar artigo (Markdown) ou snippet (código + linguagem), curtir, comentar, denunciar, excluir o próprio.

## Debate

> Ata desta sprint conduzida pelo Claude assumindo cada papel. A partir da Sprint 03 os papéis rodam como subagentes de `.claude/agents/`.

### Tema: Como conectar GitHub/GitLab/Bitbucket
- **PO:** precisa funcionar hoje, sem depender de registrar apps OAuth em três provedores.
- **UX:** um cartão por provedor, com texto dizendo exatamente qual escopo criar.
- **Tech Lead:** token pessoal (PAT / API token) com leitura; GitHub via GraphQL (1 chamada traz calendário + totais), GitLab via eventos, Bitbucket via commits dos repositórios recentes.
- **Back:** Bitbucket não tem feed de atividade por usuário → limitar a 15 repositórios × 3 páginas para não estourar rate limit.
- **QA:** testar token inválido, sem escopo de PR, GitLab self-hosted.
- **Cybersecurity:** tokens só no main, criptografados com `safeStorage`, nunca devolvidos ao renderer; recomendar escopos mínimos de leitura.
- **DevOps:** `net.fetch` do Electron para respeitar proxy corporativo.
- **Decisão (PO):** tokens pessoais agora; OAuth fica no backlog.

### Tema: Backend da comunidade
- **PO:** comunidade real entre usuários do DevDeck → Supabase.
- **Tech Lead:** cliente Supabase no renderer, protegido por RLS; sem servidor próprio.
- **Cybersecurity [bloqueante resolvido]:** chave anon/publishable é pública → segurança 100% em RLS. Exigido: RLS em todas as tabelas; grants **por coluna** (cliente não altera `like_count`, `author_id`, `hidden`); contadores e ocultação por triggers `SECURITY DEFINER` com `search_path` vazio; rate limit (10 posts/h, 60 comentários/h); 3 denúncias ocultam o post; `service_role` nunca no app. Nível e badges do perfil público são autodeclarados — risco aceito (baixo impacto), registrar.
- **UX:** feed legível sem login; ações pedem login no topo; aviso para não publicar segredos/código proprietário.
- **QA:** testar com Supabase real (pendente: depende do projeto criado pelo usuário).
- **Decisão (PO):** Supabase com migration versionada em `supabase/migrations/0001_community.sql`.

### Tema: Agenda e integração com Outlook
- **PO:** dailies e lembretes são o essencial; integração completa pode esperar.
- **Tech Lead:** agenda local + assinatura ICS somente leitura (`ical.js` com VTIMEZONE e exceções). Microsoft Graph exigiria app no Azure AD.
- **Cybersecurity:** link ICS publicado é um segredo (quem tem o link lê a agenda) → campo mascarado e aviso na tela; só `https`/`webcal`.
- **QA:** validar fuso do Windows ("E. South America Standard Time"), RRULE e exceção — feito (ver QA).
- **Decisão (PO):** local + ICS agora; Graph no backlog.

### Tema: Conquistas sem trapaça trivial
- **Tech Lead:** avaliação no main a partir de contadores locais, cache dos provedores e estatísticas da comunidade.
- **Cybersecurity:** estatísticas da comunidade chegam do renderer → main sanitiza (inteiros ≥ 0). App é local; trapaça local não afeta ninguém além do próprio usuário. Badges públicos são autodeclarados (ver tema anterior).
- **Decisão (PO):** seguir assim; validar badges no servidor é backlog.

## Entregas
- Renomeação DevDeck + migração de dados (`src/main/store.ts` → `migrateLegacyData`).
- Perfil e provedores: `src/main/providers.ts`, `src/main/profile.ts`, `ProfileView.tsx`.
- Conquistas: `src/shared/achievements.ts`, `src/main/achievements.ts`.
- Agenda: `src/main/agenda.ts`, `AgendaView.tsx`, "Hoje" no painel direito, próximo evento na status bar.
- Comunidade: `supabase/migrations/0001_community.sql`, `src/renderer/src/supabase.ts`, `CommunityView.tsx`.
- Processo: squad em `.claude/agents/`, `docs/squad.md`, sprints, ADRs, `CHANGELOG.md`, README EN/PT.

## QA
| Caso | Resultado | Evidência |
|---|---|---|
| Typecheck main/preload/renderer | ✅ | `npm run typecheck` sem erros |
| Build de produção | ✅ | main 71 kB, renderer 740 kB |
| Telas Perfil, Agenda e Comunidade abrem sem erro de console | ✅ | capturas em dev, console limpo |
| Migração de dados VibeDeck → DevDeck | ✅ | workspace anterior reaberto em `%APPDATA%/DevDeck` |
| ICS estilo Outlook (fuso Windows + RRULE + exceção) | ✅ | 09:30 -03 → 12:30Z; exceção movida para 11:00 |
| Conectar GitHub/GitLab/Bitbucket com token real | ⏳ | manual — depende dos tokens do usuário |
| Comunidade ponta a ponta (login, post, like, comentário, denúncia) | ⏳ | manual — depende do projeto Supabase |
| Lembrete dispara notificação no horário | ⏳ | manual |

## Security review
| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| Média | `profiles.level/badges` | Autodeclarados pelo cliente | Aceito; validação server-side no backlog |
| Baixa | `achievements:reportCommunity` | Renderer informa estatísticas | Sanitização no main; impacto só local |
| Info | Bitbucket | API token com escopo amplo daria escrita | Texto da UI pede só escopos `read:*` |

## Retro
- **Funcionou:** separar emissor de eventos (`events.ts`) evitou dependência circular entre agente, agenda e conquistas.
- **Melhorar:** QA ainda manual para integrações externas; falta suíte automatizada.
- **Ações (Sprint 03):** testes unitários (vitest) para `providers.mergeDays`, expansão de recorrência e conquistas; CI no GitHub Actions; review real do squad (agentes `cybersecurity` e `qa`).

## Backlog
- OAuth para provedores git; Microsoft Graph para Outlook/Teams.
- Validação de badges/nível no servidor (Edge Function).
- Aprovação por hunk, autocomplete `@arquivo`, Spotify Web API.
- Empacotamento com electron-builder (desempacotar binário nativo do Agent SDK).
