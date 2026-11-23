# Sprint 04 — Identidade visual e uso diário

**Período:** 2026-11-23 · **Versão alvo:** v0.4.0 · **Branch:** `sprint/04-visual` · **Status:** concluída (pendências manuais listadas em QA)

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

## Tarefas executadas
| Passo | Commit | História |
|---|---|---|
| Planejamento e debate | `da93709` | — |
| Segredos de MCP/ICS cifrados, máscara, migração, `lib/secrets` + testes | `1717896` | H04.1 |
| Dependências (lucide, fontes, axe-core) com versão exata, `font-src 'self'`, fontes nunca `data:` | `8cd009e` | H04.2, H04.3 |
| Tokens em camadas, CSS legado migrado, logo, lucide, rail, status bar, guarda de cor e teste de contraste | `919e81b` | H04.2, H04.3 |
| Layout persistido (zod + clamp), painel recolhível/redimensionável, paleta, atalhos, `Modal` com focus-trap, menu nulo, árvore por teclado, correções do axe | `30d17b3` | H04.4, H04.5, H04.6, H04.8, H04.9 |
| Confiança cobre `.claude/**` | `7a9b7f8` | H04.7 |
| Painel em janela estreita só sob demanda; achados do security review (links em `.claude/`, env sensível, `redact` do webcal) | `8243665` | H04.5, H04.1, H04.7 |
| Correções do QA (`.meter` escopado, blob ICS preservado, IME na paleta, `lib/secretInput` + teste) e fechamento | este commit | — |

Could (`it.todo` de diff) **não executado**: capacidade usada na H04.7 e nos achados de QA/segurança.

## QA — resultado
Executado pelo agente `qa` no HEAD `8243665` e reconferido após as correções.

| Caso | Resultado | Evidência |
|---|---|---|
| `npm run typecheck` (node, web, test) | ✅ | sem erros |
| `npm test` | ✅ | 750 testes, 16 `it.todo`, dois fusos |
| Cobertura de `lib/` | ✅ | linhas 98,8% |
| `npm run build` | ✅ | JS do renderer 799 kB (v0.3.0: 741 kB; +58 kB, +7,9% — ícones e paleta) + ~300 kB de fontes em `.woff2` |
| `npm audit --omit=dev` | ✅ | 0 vulnerabilidades |
| CSP `font-src 'self'`, nenhum `data:font` | ✅ | `out/renderer/index.html`, `grep` no CSS do build |
| Guarda de cor literal e da paleta antiga | ✅ | `tests/unit/renderer/style-guard.test.ts` |
| Contraste AA dos tokens | ✅ | `tests/unit/renderer/contrast.test.ts` (texto ≥ 4,5; foco e borda ≥ 3) |
| axe-core em 8 abas + paleta, ajuda e painel recolhido | ✅ | [`sprint-04/axe/`](sprint-04/axe/): 11 arquivos com 0 violações de qualquer impacto (1ª rodada achou 4 tipos, corrigidos) |
| Capturas antes/depois | ✅ | [`antes/`](sprint-04/antes/) (6 abas) e [`depois/`](sprint-04/depois/) (8 abas, paleta, ajuda, painel recolhido e 8 abas em 1280×720) |
| 1280×720 sem rolagem horizontal | ✅ | `depois/*-1280x720.png`; bug encontrado na captura (painel cobria o chat) corrigido em `8243665` |
| Atalho em textarea, IME, AltGr | ✅ | `lib/shortcuts` + testes |
| Painel recolhido com aprovação pendente | ✅ | `rightPanelVisible` (teste), botão desabilitado, conteúdo fora do DOM |
| Alt+A/R: foco no card, repeat, 600 ms, nunca "sempre" | ✅ | `matchApprovalKey` + testes; não age de dentro do campo de comentário |
| Esc devolve o foco | ✅ | `components/Modal.tsx` |
| Cofre indisponível / dado antigo em claro / máscara nunca gravada | ✅ | `tests/unit/main/secrets.test.ts` |
| `prefers-reduced-motion` | ✅ | `styles/base.css` |
| Varredura de conflitos entre camadas | ✅ | QA achou `.meter` do shell atingindo barras do legado (Custos, Perfil) — corrigido; demais conflitos cosméticos resolvidos |
| Ctrl+Alt+B e Ctrl+/ em teclado ABNT2 real | ⏳ | manual. No Windows o Chromium pode marcar Ctrl+Alt como AltGraph; a paleta e o botão da faixa cobrem o caso |
| Aprovação real com painel recolhido e em janela estreita | ⏳ | manual — exige chamada paga ao agente |
| Leitor de tela (NVDA) no rail e na paleta | ⏳ | manual |
| MCP e ICS reais (token e link) conferindo máscara e arquivo em disco | ⏳ | manual |
| Linux com `basic_text` | ⏳ | manual |

## Security review
Revalidação pelo agente `cybersecurity` no HEAD `7a9b7f8`.

| Bloqueante | Fechamento | Evidência |
|---|---|---|
| B1 — segredo para destino novo | ✅ fechado | `sameTarget` + `mergeSecrets`; `mcp:test` com a mesma regra; testes de URL, comando, transporte e servidor novo |
| B2 — texto puro remanescente | ✅ fechado | `systemCipher` (`basic_text` = indisponível), migração da cópia legada, gravação atômica, `importFromClaude` pelo mesmo caminho, `icsFeedInput` sem estado do renderer, `redact` |
| B4 — aprovação escondida ou às cegas | ✅ fechado | `rightPanelVisible`, toggle recusado, faixa sem card no DOM, `matchApprovalKey`, paleta sem aprovar |
| B3 — git config | ↪ Sprint 05 | confirmado: nenhuma operação git nova nesta sprint |

| Severidade | Onde | Achado | Mitigação |
|---|---|---|---|
| média | `src/main/trust.ts` | Link em `.claude/` entrava no hash só pelo alvo | ✅ corrigido: link faz perguntar sempre (`8243665`) |
| média | `lib/secrets.ts` | Mesmo comando + `NODE_OPTIONS`/`*_PROXY` novos mantinham o segredo | ✅ corrigido: `changesRiskyEnv` exige redigitar (`8243665`) |
| baixa | `src/main/agenda.ts` | `redact` não cobria a forma `https://` de um link `webcal://` | ✅ corrigido (`8243665`) |
| baixa | `lib/secrets.ts` (`maskValue`) | Mostra 4 últimos caracteres de valores ≥ 16 | Aceito (mesma prática do GitHub); registrado no ADR-015 |
| baixa | URL de MCP | Token na query da URL fica em claro e aparece na tela | Sprint 05: avaliar cifrar a URL; documentar "token vai em header" |

- **Condições de fechamento:** atendidas (CSP, versão exata, sem scripts de instalação, zod + clamp, menu nulo, hooks de dev só com `devUrl()`).
- **Veredito:** ✅ Sprint 04 pode fechar pela segurança.

## Entregas
- v0.4.0: identidade "Índigo Noturno", paleta de comandos, atalhos, painéis recolhíveis, acessibilidade (axe sem violações), segredos de MCP/ICS cifrados, confiança cobrindo `.claude/**`.
- ADRs 014 (tokens em camadas), 015 (segredos cifrados), 016 (atalhos e menu nulo), 017 (dependências de UI).
- `CHANGELOG.md` 0.4.0, READMEs EN/PT com captura nova.

## Riscos aceitos
- **Alta → Sprint 05 (Must):** B3 — git executa filtros/`textconv`/`fsmonitor`/`hooksPath` de `.git/config`. Só afeta repositório recebido com `.git/` pronto (zip, pasta copiada); `git clone` não traz `.git/config` de terceiros. Esta sprint não cria operação git nova.

- **Baixa → Sprint 05:** token na query de URL de MCP fica em claro.
- **Baixa:** `maskValue` mostra os 4 últimos caracteres (decisão registrada).

## Movido para a Sprint 05
1. Confiança em `.git/config` (B3 completo).
2. Instalador NSIS completo (H03.4) com o ícone novo.
3. Tema claro.
4. Riscos baixos da Sprint 03 e migration `0002`.
5. `it.todo` de agenda, ICS e diff.
6. URL de MCP cifrada (token em query).
7. Roteiro manual da Sprint 04 (ABNT2, NVDA, aprovação real com painel recolhido, MCP/ICS reais, Linux).

## Retro
- **Funcionou:** o debate mudou o rumo de três decisões antes do código: Tech Lead trocou `cmdk` por paleta própria testada, Cybersecurity transformou "painel recolhível" num requisito de segurança (B4) e PO cortou o B3 quando ele cresceu de P para M–G. Envolver o CSS antigo em `@layer legacy` e trocar só os tokens mudou a identidade inteira em um commit, sem big bang. Capturas automáticas (`DEVDECK_SNAPSHOT` + `DEVDECK_SIZE`) e axe injetado em dev pegaram bugs que teste unitário não pega: botão primário ilegível, painel cobrindo o chat em 1280×720 e barra de custo encolhida.
- **Melhorar:** regra nova numa camada superior que reutiliza um seletor do legado (`.btn`, `.meter`) sobrescreve variantes sem avisar — dois bugs vieram daí. Escapes `\uXXXX` e `\\` em heredoc/ferramentas de escrita viraram caracteres crus (de novo, como na Sprint 03).
- **Ações:** classes novas do `shell` com prefixo ou escopo (`.statusbar .meter`) em vez de reusar nomes do legado; migrar o legado por área até o `@layer legacy` sumir; nada de escapes em heredoc — usar `String.raw`, `\p{M}` ou arquivo de script; rodar a varredura de camadas do QA no CI.
