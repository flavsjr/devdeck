# Changelog

Todas as mudanças relevantes do DevDeck. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões em [SemVer](https://semver.org/lang/pt-BR/). Cada versão corresponde a uma sprint em [`docs/sprints/`](docs/sprints/).

## [Unreleased]

## [0.6.1] — 2026-11-25 · hotfix (Sprint 07, H07.1)

### Segurança
- **Submódulo com `ignore=none` não executa mais código ao abrir o chat.** Um repositório recebido pronto (zip, pasta copiada) com um submódulo marcado `ignore = none` no `.gitmodules` e um filtro na configuração do submódulo fazia o `git status` do Claude Code rodar esse filtro sem nenhum diálogo, nas v0.5.0 e v0.6.0. Agora o DevDeck lê o `.gitmodules` antes de liberar o git: `ignore` diferente de `all` deixa o git pausado até você confiar, e o git do agente nunca entra nos submódulos conhecidos, nem com o repositório confiado (ADR-018, emenda). Repositórios sem submódulo continuam confiados como antes.

## [0.6.0] — 2026-11-25 · Sprint 06

### Adicionado
- **Tema claro**: em *Configurações → Aparência*, escolha Sistema, Escuro ou Claro. Troca na hora, sem recarregar, fica salva e, em "Sistema", acompanha o Windows com o app aberto. Contraste AA conferido por teste nos dois temas.

### Alterado
- No tema claro, a caixa de mensagem do chat fica branca, destacada do fundo.
- Processo do squad: modelo por papel, brief em vez de releitura, trilha rápida para achados pequenos, sprint dividida em painel, ata e QA (`docs/squad.md`).
- CSS antigo migrado para camadas novas (perfil, conquistas, agenda, chat, painel direito, diff e flow), sem mudança visual comprovada por comparação do estilo computado de cada elemento nos dois temas.

### Corrigido
- Uma notificação de erro (que fica até ser fechada) cobria os botões do topo das abas, como "Importar do Claude"; a pilha agora começa abaixo do cabeçalho.
- "Claude está trabalhando…" piscava o texto até ficar ilegível (contraste abaixo de 3:1); agora o texto fica fixo e quem pulsa é um ponto ao lado.
- No diff lado a lado, as linhas adicionadas e removidas não tinham o sinal `+`/`−`, só a cor; agora têm nos dois modos.
- Abrir o DevDeck de novo criava uma segunda instância sobre os mesmos dados (risco de corromper chats e configurações); agora a janela que já está aberta vem para a frente.

### Segurança
- Mensagens de erro de servidor MCP e do GitHub passam pela redação por padrão (tokens Bearer, Basic, chaves, JWT), além dos valores exatos já mascarados.
- **O agente do chat só tem as ferramentas que o card de aprovação sabe mostrar**: ler, buscar, editar, escrever, rodar comando (Bash/PowerShell), busca na web e subagente. Saíram ferramentas como agendamento, gatilho remoto e publicação de plugin, e os conectores da sua conta do claude.ai deixam de aparecer no chat do DevDeck. Ferramenta fora da lista é negada mesmo que o Claude Code a ofereça (ADR-022, emenda).
- `minimatch` das ferramentas de empacotamento atualizado para 11.x (GHSA-g3hv-75wg-m249, negação de serviço por padrão de glob). Não muda o app instalado.

## [0.5.0] — 2026-11-25 · Sprint 05

### Adicionado
- **Instalador para Windows** (`DevDeck-Setup-0.5.0.exe`): por usuário, sem pedir admin nem UAC, com o ícone novo, atalhos no Menu Iniciar e na área de trabalho. Atualizar por cima e desinstalar mantêm `%APPDATA%\DevDeck`. Sem atualização automática.
- **Release em rascunho pelo CI** com `SHA256SUMS.txt` e attestation de build; o README ensina a conferir o hash e a procedência antes de instalar.
- Aba Alterações e barra de status mostram **"Git pausado"** quando o repositório tem configuração do git que executa programas, com o botão "Revisar configurações…"; a branch atual aparece na barra de status.
- Card de aprovação avisa quando o Edit vai falhar (`old_string` vazio, ausente ou repetido) e quando a prévia do diff é parcial; mostra o selo "fora do workspace" ou "pasta sensível".
- Teste ponta a ponta com Playwright no app Electron (`npm run test:e2e`): "Git pausado" → "Revisar configurações…" → confiar, com o controle positivo do filtro; roda no job de empacotamento do CI.
- Limite na comunidade: 120 curtidas por hora e 10 denúncias por dia por usuário (migration `0002`).

### Alterado
- O debate do squad só convoca quem trabalha na história ou tem veto sobre o risco dela (matriz de convocação no planning, réplica só nos conflitos).
- Git do app agora roda por um wrapper próprio (o `simple-git` saiu); o conteúdo do HEAD vem por `cat-file`, sem textconv.
- Diff grande não trava a tela: arquivos acima de 1 MB ou 20 mil linhas, ou que passem de 300 ms, aparecem como prévia parcial.
- UI do app empacotado servida por `app://devdeck` em vez de `file://`.

### Corrigido
- Agenda: eventos com `STATUS:CANCELLED` sumiam só quando o título começava com "Cancelado"; dois eventos sem UID viravam um só; exceção sem a série mestre não aparecia; série diária ou semanal iniciada há mais de 13 anos parava de aparecer.
- Links de reunião aceitavam domínios parecidos (ex.: `evilzoom.us`); agora só o host exato de Teams, Meet e Zoom.
- Prévia de Edit em arquivo com quebra de linha CRLF saía vazia; o patch gravado no chat passa a vir do conteúdo real do disco (reverter continua funcionando).
- Corrida ao trocar rápido de arquivo na aba Alterações e erro de diff que sumia em silêncio.
- Turno do chat que falhou (ex.: sessão do Claude expirada) desbloqueava a conquista "Hello, Claude" e contava nas estatísticas; agora só turno concluído conta.
- "Descartar arquivo" com colchetes ou asterisco no nome descartava outros arquivos (o caminho era lido como padrão).

### Segurança
- **Abrir um repositório não executa mais código configurado nele (B3).** Antes de rodar o git, o DevDeck lê o `.git/config` sem executar nada; fsmonitor, filtros, textconv, `diff.external`, hooks, includes, worktrees ou `.git` apontando para fora pausam o git até você confiar. Mesmo confiado, o git roda por caminho absoluto (um `git.exe` plantado no repositório não é usado), sem variáveis `GIT_*` herdadas, com fsmonitor e hooks desligados. Sem confiança, o git que o agente rodar também não encontra o repositório.
- Variáveis e headers de servidores MCP vão para o Claude Code pelo stdin, não mais pela linha de comando (que outros usuários da máquina conseguiam ler).
- URL de servidor MCP com token na query ou usuário e senha é recusada; use um header.
- `settings.json` do projeto com chave desconhecida pede confiança; "Sempre nesta sessão" só vale para caminhos dentro do workspace e só para ferramentas que o DevDeck sabe onde agem: **Bash, WebFetch e ferramentas MCP passam a perguntar sempre** (o "Sempre" de MCP continua pela política "auto" de cada ferramenta). Prévia parcial desabilita "Aprovar todas da sessão", e o main recusa esses pedidos mesmo se chegarem.
- O git do DevDeck e do agente nunca entram em submódulos (a config do submódulo não é conferida) e nunca sobem acima da pasta aberta: abrir uma subpasta de um repositório não usa o git do pai.
- App instalado com fuses do Electron (sem `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` e `--inspect`; integridade do asar; só carrega do asar), SDK do Claude conferido por SHA-256 no build e switches de depuração remota recusados.
- Denúncia de conta com menos de 72 h é registrada mas não oculta post.
- **Todo comando do agente pede aprovação**, inclusive os que o Claude Code considera só-leitura (`git status`, `ls`): antes esses rodavam sem card. Vale para Bash e PowerShell; a ferramenta Monitor (comando em segundo plano) saiu do chat (ADR-022).

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

[Unreleased]: https://github.com/flavsjr/devdeck/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/flavsjr/devdeck/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/flavsjr/devdeck/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/flavsjr/devdeck/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/flavsjr/devdeck/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/flavsjr/devdeck/releases/tag/v0.2.0
