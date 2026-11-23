# Sprint 04 — Identidade visual e uso diário

**Período:** 2026-11-23 · **Versão alvo:** v0.4.0 · **Branch:** `sprint/04-visual` · **Status:** em andamento

## Objetivo
Dar ao DevDeck uma identidade visual própria, com cara de ferramenta de dev e sem a paleta do Claude, deixar o uso diário mais rápido pelo teclado e cumprir a regra de segredos pendente da Sprint 03.

## Contexto
Pedido do usuário: "aprimoramento visual, está muito igual ao visual do Claude. Usar ferramentas para criar a estilização, de forma moderna, e debater com o UX design para que o sistema fique fácil para o dev utilizar no dia a dia."

Diagnóstico: accent terracota `#d97757` e texto creme `#e6e2da` são a paleta da marca Claude; logo "◆" terracota; fonte do sistema. Painel direito fixo em 420px ocupa ~30% da tela mesmo vazio; nenhum atalho de teclado; inputs com `outline: none`; rail com rótulos de 10px. Capturas de antes em [`sprint-04/antes/`](sprint-04/antes/).

## Debate

> Rodada 1: PO (planning) e UX (direção visual) em paralelo. Rodada 2: Tech Lead, Cybersecurity e QA sobre a proposta combinada. Decisão final do PO.

### UX
- **Identidade:** duas direções avaliadas — "Índigo Noturno" (accent `#7c8cff`) e "Ardósia Ciano" (`#38c6e8`). Recomenda Índigo: matiz longe do vermelho/verde do diff e visível para deuteranopia; o ciano fica a ~50° do verde de sucesso.
- **Paleta:** bg `#0b0d12`, s1 `#11141b`, s2 `#171b24`, s3 `#1f2430`, line `#262c38`, line-2 `#323a49`, fg `#e4e7ee`, fg-2 `#a9b1c1`, muted `#858ea5` (sobe de tom para passar AA em s3), ok `#4ccb8a`, bad `#f2706b`, warn `#e8b54a`. Tokens em duas camadas (primitivos → semânticos) para o tema claro entrar depois.
- **Tipografia:** Inter Variable (13px UI, 14px chat) e JetBrains Mono (12.5px), números tabulares em custo/tokens/horário. Raio 6px controles, 10px cards. Grade de 4px.
- **Top 5 do dia a dia:** painel direito fixo; nada pelo teclado; foco quebrado (`div` com onClick, `outline:none`, ações com `visibility:hidden`); rail com 8 itens de mesmo peso e rótulo 10px; hierarquia fraca (aprovação num banner amarelo, status bar com 8 itens iguais e emojis).
- **Ferramentas:** CSS puro com `@layer` + valores no estilo Radix, fontes `@fontsource-variable`, lucide-react, paleta de comandos, axe-core no QA. Tailwind v4 **não** nesta sprint.

### PO (planning)
- Segredos MCP/ICS em texto puro ferem o CLAUDE.md e foram prometidos como primeiro item → Must.
- Instalador fica para a Sprint 05: o ícone sai desta sprint; fazer antes geraria retrabalho.
- Perguntas levadas ao debate: paleta, densidade, atalhos sem conflito, painel recolhido com aprovação, supply chain das libs, CSP das fontes, atalho que aprova.

### Tech Lead
- **Estilos:** CSS vars + `@layer` (`tokens, base, legacy, components, views, utilities`), `styles/tokens.css` como único arquivo com hex. CSS antigo envolvido em `@layer legacy` e aliases dos nomes antigos: a paleta troca num commit, a migração por área vem depois. Sem Tailwind (reescreveria ~15 componentes sem ganho sobre tokens).
- **Contraste medido:** branco sobre accent = 2,98 → botão primário usa texto escuro (6,5); `line-strong` não serve de anel de foco → anel usa accent.
- **Dependências:** lucide-react sim; fontes sim (woff2 > `assetsInlineLimit`, viram assets `'self'`); **cmdk não** (puxa vários `@radix-ui/*` e traz fuzzy próprio) → paleta própria com `lib/fuzzy` testada e o mesmo focus-trap dos modais.
- **H04.1:** `seal`/`unseal` únicos; renderer recebe máscara; entrada com `null` = manter; lógica pura em `src/main/lib/secrets.ts`.
- **Atalhos:** registro único no renderer (`lib/shortcuts.ts` + hook); conflito real é o menu padrão (Alt sozinho mostra a barra, Ctrl+R recarrega) → `Menu.setApplicationMenu(null)` em produção. Comparar por `e.key`; AltGr (ABNT2) chega como Ctrl+Alt.
- **Estimativas:** H04.1 M · visual G · paleta M · painel M · a11y M · ícones P.

### Cybersecurity
- **[bloqueante] B1 — segredo para destino novo:** com máscara, o renderer poderia mandar o `name` de um MCP existente com outra `url`/`command` e o main entregaria o segredo guardado. Mitigação: "manter" só se `type`, `url`, `command` e `args` forem iguais; máscara nunca gravada como valor; lógica pura com teste.
- **[bloqueante] B2 — texto puro remanescente:** cópia legada em `%APPDATA%/vibedeck` e `importFromClaude` gravam em claro. `safeStorage` indisponível (ou `basic_text` no Linux) → bloquear salvamento, sem modo "texto puro com aviso". Sem apagamento seguro em SSD → regravação atômica e CHANGELOG recomenda trocar os tokens.
- **[bloqueante] B3 — git executa código do repositório:** `core.fsmonitor`, filtros `clean`/`smudge`/`process`, `textconv`, `diff.external` e `hooksPath` vindos de `.git/config` rodam em `status`/`restore`/`show`. `-c core.fsmonitor=false` sozinho não basta.
- **[bloqueante] B4 — aprovação escondida ou às cegas:** com aprovação pendente o painel abre e trava aberto; recolhido fica `inert`; contador no centro; Alt+A/R só com foco no card e para aquele `approvalId`; sem foco automático; ignora `repeat` e 600 ms após o card aparecer; Alt+A nunca liga `alwaysForSession`.
- **Condições:** `font-src 'self'` explícito sem `data:`; dependências com versão exata, publicadas há ≥ 7 dias, sem scripts de instalação, `npm audit` limpo; chaves de UI no zod com `int().min().max()` e clamp no main; máscara do ICS só com host; erros sem valor de segredo; paleta sem "Aprovar" e "Testar MCP" só leva à tela de MCP.

### QA
- Automatizável em `node`: contraste dos tokens (`lib/contrast`), guarda de hex e de `#d97757`/`#d95926` (hoje há 7 hex inline no `ProfileView`), fuzzy (acentos, caixa, vazio, 1000 itens), mapa de atalhos com contexto editável/IME, clamp do painel, migração de segredos com cipher injetado.
- Manual com evidência: capturas antes/depois (`DEVDECK_SNAPSHOT`), roteiro só com teclado, axe-core injetado em dev (`DEVDECK_AXE=1`).
- Bordas: 1280×720 sem rolagem horizontal; painel recolhido com aprovação; atalho dentro de textarea; `safeStorage` indisponível; dado antigo em texto puro; downgrade para 0.3.0 deixa segredo ilegível (documentar).

### DevOps
- Sem parecer separado nesta sprint: fontes e ícones entram como dependências normais de build; nenhum impacto no CI além de `npm ci`. Instalador segue para a Sprint 05.

### Decisão (PO)
- **Paleta e tokens:** "Índigo Noturno" do UX com CSS vars + `@layer` do Tech Lead; `styles/tokens.css` único com hex; aliases dos nomes antigos. Sem Tailwind. Botão primário com texto escuro; anel de foco em accent. ADR-014.
- **Dependências:** lucide-react e fontes Inter/JetBrains Mono locais entram; cmdk fica de fora (paleta própria). Versão exata, ≥ 7 dias, sem `postinstall`, audit limpo. CSP com `font-src 'self'`. ADR-017.
- **Atalhos:** Ctrl+K, Ctrl+1–8, Ctrl+N, Ctrl+L, Ctrl+B, Ctrl+/. Em campo editável só Ctrl+K, Ctrl+/ e Esc. Nada durante IME. Menu nulo em produção. ADR-016.
- **B4:** mitigação aceita na íntegra.
- **B1 e B2:** mitigações aceitas; H04.1 é o primeiro commit. ADR-015.
- **B3:** a correção completa cresceu de P para M–G e não cabe. **Primeiro Must da Sprint 05.** Paliativo só com `fsmonitor=false` não entra (falsa sensação de correção). Registrado em riscos aceitos. Hash de `.claude/**` fica aqui como Should.
- **Fora:** tema claro, instalador, spike e `it.todo` de agenda/ICS → Sprint 05.

## Histórias finais

### Must

#### H04.1 — Segredos de MCP e ICS criptografados (M)
*Como dev, quero que tokens de MCP e o link ICS fiquem criptografados para que não vazem pelo disco nem pelo renderer.*
- [ ] No disco não fica `env`/`headers` de MCP nem URL de ICS em texto puro, inclusive na cópia legada e no que vem de "Importar do Claude".
- [ ] O renderer recebe só máscara; no ICS a máscara mostra só o host.
- [ ] Valor guardado só é mantido se `type`, `url`, `command` e `args` forem iguais; senão o main recusa e pede para redigitar (regra pura com teste).
- [ ] `safeStorage` indisponível ou `basic_text` → salvamento bloqueado com mensagem.
- [ ] Migração no boot testada com cipher injetado; CHANGELOG recomenda trocar os tokens.

#### H04.2 — Identidade visual "Índigo Noturno" (G)
*Como dev, quero um visual próprio e consistente para reconhecer o DevDeck e trabalhar o dia todo sem cansar a vista.*
- [ ] Teste-guarda: nenhum hex fora de `styles/tokens.css`; nenhum `#d97757`/`#d95926` no repositório de código.
- [ ] `lib/contrast` testada: texto ≥ 4,5:1 e UI ≥ 3:1 em todos os pares usados.
- [ ] Logo novo; status bar sem emojis.
- [ ] Capturas antes/depois de cada aba; em 1280×720 sem rolagem horizontal.

#### H04.3 — Ícones lucide e rail (P)
- [ ] `Icons.tsx` sem SVG feito à mão; rail de 48px com barra ativa e tooltip com atalho.
- [ ] Tamanho do bundle registrado.

#### H04.4 — Foco e acessibilidade (M)
- [ ] `:focus-visible` em todo interativo; botão só com ícone tem `aria-label`.
- [ ] Modais prendem e devolvem o foco; `prefers-reduced-motion` respeitado.
- [ ] `DEVDECK_AXE=1` sem violações *serious*/*critical* nas abas principais.

#### H04.5 — Painel direito recolhível (M)
- [ ] Largura 320–640px, validada no zod (`int` min/max) e com clamp no main (teste); persiste após reiniciar.
- [ ] Aprovação pendente abre e trava o painel; recolhido fica `inert`; contador no centro.
- [ ] Sem foco automático no card; Alt+A/R só com o card focado, ignora repeat e 600 ms; Alt+A nunca liga `alwaysForSession`.

#### H04.6 — Paleta de comandos e atalhos (M)
- [ ] Ctrl+K abre de qualquer aba; Enter executa; Esc fecha e devolve o foco.
- [ ] `lib/fuzzy` e `lib/shortcuts` testadas (campo editável e IME incluídos).
- [ ] Paleta sem "Aprovar"; "Testar MCP" só leva à tela de MCP; Ctrl+/ lista os atalhos.

### Should
- **H04.7** Hash de confiança cobre `.claude/**`, com teste.
- **H04.8** Sidebar recolhível e árvore navegável por teclado.
- **H04.9** Estados vazios e de erro revistos com microcopy do UX.

### Could
- `it.todo` de diff até ~10% da capacidade.

## Ordem de execução
1. H04.1 (`fix:`).
2. Dependências e CSP (`chore:`).
3. `@layer` + `tokens.css` com aliases + teste-guarda (`refactor:`).
4. Paleta, logo, lucide e rail (H04.2, H04.3).
5. H04.4 foco e acessibilidade.
6. H04.5 painel com as regras do B4.
7. H04.6 paleta, atalhos e menu nulo.
8. Shoulds até o teto.
9. QA: axe, capturas, 1280×720, aprovação com painel recolhido, atalho em textarea.
10. Security review revalidando B1, B2 e B4.
11. `docs:` ADRs, CHANGELOG 0.4.0, sprint, READMEs.
12. Push, PR e tag só com aprovação do usuário.

## Riscos aceitos
- **Alta → Sprint 05 (Must):** B3 — git executa filtros/`textconv`/`fsmonitor`/`hooksPath` de `.git/config`. Só afeta repositório recebido com `.git/` pronto (zip, pasta copiada); `git clone` não traz `.git/config` de terceiros. Esta sprint não cria operação git nova.

## Movido para a Sprint 05
1. Confiança em `.git/config` (B3 completo).
2. Instalador NSIS completo (H03.4) com o ícone novo.
3. Tema claro.
4. Riscos baixos da Sprint 03 e migration `0002`.
5. `it.todo` de agenda, ICS e diff.
