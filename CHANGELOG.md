# Changelog

Todas as mudanças relevantes do DevDeck. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões em [SemVer](https://semver.org/lang/pt-BR/). Cada versão corresponde a uma sprint em [`docs/sprints/`](docs/sprints/).

## [Unreleased]

## [0.2.0] — 2026-11-23 · Sprint 02

### Adicionado
- **Perfil do dev** com métricas de GitHub (GraphQL), GitLab (gitlab.com ou self-hosted) e Bitbucket Cloud via token pessoal de leitura: commits, PRs, reviews, sequência, dias ativos, heatmap de 26 semanas, linguagens e repositórios mais ativos.
- **Conquistas**: 31 conquistas em 5 categorias (IA, Git, Foco, Agenda, Comunidade), XP, níveis, notificação de desbloqueio e até 3 destaques no perfil.
- **Agenda**: eventos com recorrência (dias úteis, diária, dias da semana), atalho de Daily, lembretes com notificação e botão Entrar, assinatura de calendários ICS (Outlook/Google) somente leitura, "Hoje" no painel direito e próximo evento na barra de status.
- **Comunidade** (Supabase): feed público de artigos e snippets, login por código de e-mail, @username com nível e badges, curtidas, comentários, denúncias e exclusão do próprio conteúdo. Migration com RLS, grants por coluna, triggers de contadores, rate limit e ocultação após 3 denúncias.
- Pomodoro concluído conta para conquistas.
- Processo de squad: agentes `po`, `tech-lead`, `ux-designer`, `frontend`, `backend`, `qa`, `cybersecurity`, `devops`; `docs/squad.md`, sprints, ADRs.
- README em inglês e português.

### Alterado
- Projeto renomeado de **VibeDeck** para **DevDeck** (`productName`, janela, API `window.deck`). Dados de `%APPDATA%/vibedeck` são migrados automaticamente.
- Eventos main → renderer centralizados em `src/main/events.ts`.

### Segurança
- Tokens de provedores git criptografados com `safeStorage` e nunca expostos ao renderer.
- CSP liberando apenas `*.supabase.co` além do próprio app.
- Link ICS tratado como segredo (campo mascarado).

## [0.1.0] — 2026-11-23 · Sprint 01

### Adicionado
- Chat por workspace com Claude Agent SDK (streaming, histórico, retomada, interrupção).
- Aprovação de `Edit`/`Write`/`Bash`/tools MCP com diff unificado ou lado a lado, pedido de ajuste com comentário e "aprovar todas da sessão".
- Rollback de alteração aplicada por patch reverso; aba Alterações com `git status`/diff e descarte por arquivo.
- Painel de MCPs (stdio/HTTP/SSE): ligar/desligar, testar, política auto/pedir por tool, importação do Claude Desktop/Code.
- Custos e métricas: por turno, sessão, dia, mês e modelo; teto diário e por sessão; uso de contexto.
- Modo Flow: embed do Spotify e timer de foco 25/5.

[Unreleased]: https://github.com/flavsjr/devdeck/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/flavsjr/devdeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/flavsjr/devdeck/releases/tag/v0.1.0
