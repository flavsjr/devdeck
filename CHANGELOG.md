# Changelog

Todas as mudanças relevantes do DevDeck. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões em [SemVer](https://semver.org/lang/pt-BR/). Cada versão corresponde a uma sprint em [`docs/sprints/`](docs/sprints/).

## [Unreleased]

## [0.4.0] — 2026-11-23 · Sprint 04

### Adicionado
- **Identidade visual própria "Índigo Noturno"**: neutros frios com accent índigo (no lugar da paleta terracota/creme, que era a da marca Claude), logo novo (duas cartas empilhadas com um prompt), fontes Inter e JetBrains Mono empacotadas no app e ícones lucide.
- **Paleta de comandos** (`Ctrl+K`) com busca aproximada sem acento: abas, chats do workspace e ações.
- **Atalhos de teclado**: `Ctrl+1–8` (abas), `Ctrl+N` (novo chat), `Ctrl+L` (escrever mensagem), `Ctrl+B` (barra lateral), `Ctrl+Alt+B` (painel direito), `Ctrl+/` ou `F1` (lista de atalhos), `Alt+A` / `Alt+R` para aprovar ou rejeitar a alteração focada.
- **Painel direito recolhível e redimensionável** (320–640 px, por mouse ou setas), com largura e estado lembrados. Em janela estreita ele vira sobreposição sob demanda.
- Barra lateral recolhível; árvore de arquivos navegável por teclado (setas, Enter, `@` anexa ao contexto).
- Barra de status reorganizada: workspace e modelo à esquerda; contexto e gasto do dia com medidor e porcentagem à direita; atalho para a paleta.
- Tela inicial do chat com os atalhos principais e aviso de aprovação com botão "Revisar" que leva o foco ao cartão.

### Alterado
- CSS reorganizado em camadas (`tokens`, `legacy`, `base`, `shell`) com todas as cores em `styles/tokens.css`; testes garantem que não há cor fora dos tokens e que os pares de texto passam no contraste AA.
- Botão primário com texto escuro sobre o accent (branco não passava no contraste).
- Painel direito começa com 360 px (antes 420 px fixos).
- Sem menu da aplicação no app empacotado: `Alt` não abre barra de menu e `Ctrl+R` não recarrega a interface.

### Corrigido
- Foco de teclado visível em todo o app (antes os campos tinham `outline: none`); botões só com ícone têm rótulo acessível; modais prendem e devolvem o foco; `prefers-reduced-motion` respeitado. Auditoria axe-core sem violações em todas as abas.
- Conquistas bloqueadas tinham texto abaixo do contraste mínimo.

### Segurança
- **Variáveis de ambiente e headers de MCP e o link de calendário ICS passam a ser cifrados no cofre do sistema** e migrados automaticamente na primeira execução (inclusive a cópia antiga em `%APPDATA%/vibedeck`). A interface recebe só uma máscara. Sem cofre disponível, o DevDeck recusa salvar em vez de gravar em claro. **Recomendado: troque os tokens que estavam nesses campos**, porque cópias antigas em disco podem não ter sido apagadas fisicamente. Voltar para a v0.3.0 deixa esses valores ilegíveis.
- Um segredo guardado só é reaproveitado se transporte, URL, comando e argumentos do servidor MCP não mudaram e nenhuma variável sensível (`NODE_OPTIONS`, `*_PROXY`…) foi acrescentada; caso contrário é preciso digitar de novo.
- Erros de sincronização de calendário e de teste de MCP não ecoam valores secretos.
- Confiar num workspace passa a cobrir os arquivos de `.claude/` (skills, comandos, agentes); links ou pastas grandes demais fazem o DevDeck perguntar sempre.
- Aprovação pendente mantém o painel aberto; atalhos não aprovam nada fora do cartão focado e ignoram teclas nos primeiros 600 ms.
- CSP com `font-src 'self'`; fontes nunca embutidas como `data:`. Dependências novas com versão exata.

## [0.3.0] — 2026-11-23 · Sprint 03

### Adicionado
- Testes automatizados com Vitest (250 testes) para sequência de commits, agenda/ICS, edit/revert, conquistas, diff, validação de IPC, origens e confiança em workspace, rodando nos fusos de São Paulo e Nova York.
- CI no GitHub Actions: typecheck, testes e build em Windows e Ubuntu, mais varredura de segredos com gitleaks. Dependabot para as actions.
- Diálogo "Confiar neste workspace?" listando hooks, permissões, variáveis, helpers e servidores MCP do repositório antes de carregá-los.
- Modal próprio para denunciar posts na Comunidade.
- Licença MIT, `SECURITY.md` (reporte privado de vulnerabilidades), `CONTRIBUTING.md`, templates de issue e de PR.

### Corrigido
- **Denunciar nunca enviava** (o Electron não implementa `window.prompt`).
- Agenda: evento de dia inteiro de ontem ou de amanhã aparecia em "Hoje"; lembretes acima de 3 h disparavam atrasados; evento sem início podia ser salvo; série recorrente mantém a hora local após mudança de horário de verão.
- Conquistas: `levelFromXp` entrava em loop com valores infinitos; linguagens duplicadas por maiúsculas inflavam "Poliglota"; feed ICS com erro contava para "Sincronizado"; reverter alteração vazia somava revert.
- Revert com erro de leitura/gravação não derruba mais o processo principal; diff exibe "1 linha".

### Segurança
- IPC aceita apenas o frame principal da UI do DevDeck e valida todos os argumentos com zod; ids precisam ser UUID antes de virar caminho de arquivo; `settings:update` só aceita chaves conhecidas.
- Navegação, redirecionamento, frames, janelas novas e `<webview>` fora da origem do app são bloqueados; permissões do Chromium negadas por padrão; iframe do Spotify em sandbox; CSP com `object-src`, `base-uri` e `form-action` restritos e sem `ws://localhost` em produção.
- Configurações do projeto vêm desligadas por padrão e só carregam com confiança explícita (reconfirmada se os arquivos mudarem).
- "Aprovar todas da sessão" não vale fora do workspace nem em `.git`, `.claude`, `.vscode`, `.github` e afins, resolvendo symlinks e junctions.
- Prévia de arquivos recusa links simbólicos que saem do workspace e lê no máximo 512 KB.
- Build falha se a chave do Supabase for `service_role`/`sb_secret_`.

### Removido
- Canal IPC `workspace:open` (exposto e sem uso).

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

## 0.1.0 — 2026-11-23 · Sprint 01

> Sem tag própria: a Sprint 01 foi entregue junto com a 0.2.0 no commit inicial.

### Adicionado
- Chat por workspace com Claude Agent SDK (streaming, histórico, retomada, interrupção).
- Aprovação de `Edit`/`Write`/`Bash`/tools MCP com diff unificado ou lado a lado, pedido de ajuste com comentário e "aprovar todas da sessão".
- Rollback de alteração aplicada por patch reverso; aba Alterações com `git status`/diff e descarte por arquivo.
- Painel de MCPs (stdio/HTTP/SSE): ligar/desligar, testar, política auto/pedir por tool, importação do Claude Desktop/Code.
- Custos e métricas: por turno, sessão, dia, mês e modelo; teto diário e por sessão; uso de contexto.
- Modo Flow: embed do Spotify e timer de foco 25/5.

[Unreleased]: https://github.com/flavsjr/devdeck/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/flavsjr/devdeck/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/flavsjr/devdeck/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/flavsjr/devdeck/releases/tag/v0.2.0
