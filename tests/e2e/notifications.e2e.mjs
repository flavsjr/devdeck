// E2E (Playwright + Electron) da H06.2 (T25): os 5 tipos de notificação por fluxo real, com axe.
// - conquista: primeiro turno com sucesso no servidor falso da API ("Hello, Claude");
// - sucesso: salvar a chave da API (valor falso, cifrado num --user-data-dir descartável);
// - aviso: servidor MCP com nome inválido;
// - erro: servidor MCP HTTP com ?token= na URL (o main recusa);
// - info: "Importar do Claude" sem nada novo (HOME, USERPROFILE e APPDATA apontam para pastas vazias).
// H07.2 (T57/T58), parciais da Sprint 06:
// - fechar: alvo ≥ 24 px, role/nome, foco visível pelo teclado e recuperado ao fechar; notificação não rouba o foco;
// - prefers-reduced-motion: nenhuma animação na pilha (controle: sem ele, o cartão anima);
// - lembrete real da agenda (evento salvo pelo window.deck) → toast "Abrir na agenda" → aba Agenda;
// - erro do chat (401 do servidor falso): só o card com o chat na tela; "Copiar detalhes" copia o mesmo texto;
//   "Tentar de novo" só por clique, indisponível durante o turno, composer intacto; em outra aba, um único toast.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'
import { FAKE_API_KEY, TEXTO_OK, fakeApiEnv, startFakeApi } from './helpers/fake-api.mjs'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const waitFor = async (fn, ms = 20000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await fn()) return true
    } catch {
      // ainda não
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

const base = mkdtempSync(join(tmpdir(), 'devdeck-notify-'))
const ws = join(base, 'ws')
const userData = join(base, 'userdata')
const cfg = join(base, 'claude-config')
const home = join(base, 'home')
const appData = join(home, 'AppData', 'Roaming')
for (const d of [ws, userData, cfg, appData]) mkdirSync(d, { recursive: true })
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: ws }))

const api = await startFakeApi({ cenario: 'ok' })
const limpo = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|CCD)/i.test(k)))
// Importar do Claude lê ~/.claude.json e %APPDATA%\Claude: aponta para pastas vazias (não toca na máquina de quem roda).
const env = { ...fakeApiEnv(limpo, api.url, cfg), HOME: home, USERPROFILE: home, APPDATA: appData }
let app
try {
  app = await electron.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${userData}`], env, colorScheme: null })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  const axe = async (sel) => {
    if (!(await win.evaluate(() => Boolean(window.axe)))) await win.evaluate(AXE)
    return win.evaluate(async (s) => {
      const r = await window.axe.run(s, { runOnly: ['wcag2a', 'wcag2aa'] })
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} [${(n.any[0]?.message ?? "").slice(0, 160)}]`).join(" | ")}`)
    }, sel)
  }
  const goView = async (i) => {
    await win.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
    await win.keyboard.press(`Control+${i}`)
    await win.waitForTimeout(250)
  }
  const cartao = (tipo) => win.locator(`.notify-card.notify-${tipo}`).last()
  const conferir = async (tipo, texto, rotulo) => {
    const c = cartao(tipo)
    const apareceu = await waitFor(async () => (await c.isVisible()) && ((await c.textContent()) ?? '').includes(texto))
    check(apareceu, `${rotulo}: notificação "${tipo}" com "${texto}"`)
    if (apareceu) {
      // Espera a animação de entrada (opacidade) acabar: no meio dela o contraste medido é falso.
      await win.waitForFunction(
        () => (document.querySelector('.notify-stack')?.getAnimations({ subtree: true }) ?? []).every((a) => a.playState !== 'running'),
        null,
        { timeout: 5000 }
      )
      const v = await axe('.notify-stack')
      check(v.length === 0, `${rotulo}: axe sem serious/critical na pilha (${v.join(', ') || 'nenhuma'})`)
    }
  }

  // ---------- conquista: primeiro turno com sucesso ----------
  const caixa = win.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await caixa.fill('oi')
  await caixa.press('Enter')
  check(await waitFor(() => win.getByText(TEXTO_OK).isVisible()), 'turno com sucesso no servidor falso')
  await conferir('conquista', 'Hello, Claude', 'primeiro turno')

  // ---------- sucesso: salvar chave ----------
  await goView(8)
  await win.getByLabel('Chave da API Anthropic').fill(FAKE_API_KEY)
  await win.getByRole('button', { name: 'Salvar chave' }).click()
  await conferir('sucesso', 'Chave salva', 'salvar chave')

  // ---------- aviso e erro: MCP ----------
  await goView(3)
  await win.getByRole('button', { name: 'Adicionar' }).click()
  const form = win.locator('.view-pad.mcp')
  await form.getByPlaceholder('ex.: github').fill('nome inválido!')
  await form.getByPlaceholder('ex.: npx').fill('node')
  await form.getByRole('button', { name: 'Salvar' }).click()
  await conferir('aviso', 'Nome do servidor', 'MCP com nome inválido')

  await form.getByPlaceholder('ex.: github').fill('remoto')
  await form.locator('select').first().selectOption('http')
  await form.getByPlaceholder('https://exemplo.com/mcp').fill('https://exemplo.com/mcp?token=abc')
  await form.getByRole('button', { name: 'Salvar' }).click()
  await conferir('erro', 'token', 'MCP com token na URL')

  // ---------- info: importar sem nada novo, COM o erro na tela ----------
  // A pilha fica abaixo do view-head: as ações do cabeçalho continuam clicáveis (achado da T25).
  const sobrepoe = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  const importar = win.getByRole('button', { name: 'Importar do Claude' })
  for (const nome of ['Importar do Claude', 'Adicionar']) {
    const caixaBotao = await win.getByRole('button', { name: nome }).first().boundingBox()
    const cartoes = await win.locator('.notify-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    check(!cartoes.some((c) => sobrepoe(c, caixaBotao)), `com erro na tela, nenhum cartão cobre "${nome}"`)
  }
  await importar.click({ timeout: 5000 })
  await conferir('info', 'Nada novo para importar.', 'importar do Claude com erro na tela')

  // Erro não some sozinho (os outros tipos somem no prazo).
  await win.waitForTimeout(9000)
  check(await cartao('erro').isVisible(), 'erro continua na tela depois de 9 s, até o usuário fechar')

  // ================= H07.2 (T57/T58): parciais da H06.2/H06.3 =================
  const pilha = win.locator('.notify-stack')
  const focoFora = () =>
    win.evaluate(() => {
      const a = document.activeElement
      return Boolean(a && a !== document.body && !document.querySelector('.notify-stack')?.contains(a))
    })

  // ---------- fechar: role, nome, alvo ≥ 24 px, foco visível e recuperado ----------
  const caixaFechar = await cartao('erro').getByTestId('notify-close').boundingBox()
  check(
    Boolean(caixaFechar && caixaFechar.width >= 24 && caixaFechar.height >= 24),
    `fechar: alvo ≥ 24 × 24 px (${caixaFechar ? `${caixaFechar.width} × ${caixaFechar.height}` : 'sem caixa'})`
  )
  check(
    (await pilha.getByRole('button', { name: 'Fechar notificação' }).count()) === (await pilha.getByTestId('notify-close').count()),
    'fechar: role="button" com nome "Fechar notificação" em todos os cartões'
  )
  check(await focoFora(), 'notificação nova não rouba o foco (ficou fora da pilha, sem cair no <body>)')
  // Entra na pilha pelo teclado (Tab). A origem é o último elemento focado FORA da pilha antes de
  // entrar nela (o relatedTarget que o componente guarda), gravada só enquanto o foco está fora.
  await importar.focus()
  let noFechar = false
  for (let i = 0; i < 120 && !noFechar; i++) {
    await win.evaluate(() => {
      const a = document.activeElement
      if (!document.querySelector('.notify-stack')?.contains(a)) window.__focoAntes = a
    })
    await win.keyboard.press('Tab')
    noFechar = await win.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'notify-close')
  }
  check(noFechar, 'fechar: alcançável pelo Tab')
  if (noFechar) {
    const visivel = await win.evaluate(() => {
      const el = document.activeElement
      const st = getComputedStyle(el)
      return el.matches(':focus-visible') && st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0
    })
    check(visivel, 'fechar: foco visível (:focus-visible com contorno) vindo do teclado')
    const antes = await pilha.getByTestId('notify-close').count()
    await win.keyboard.press('Enter')
    await waitFor(async () => (await pilha.getByTestId('notify-close').count()) < antes, 5000)
    const volta = await win.evaluate(() => {
      const a = document.activeElement
      const pilhaEl = document.querySelector('.notify-stack')
      if (pilhaEl?.querySelector('[data-testid="notify-close"]')) return pilhaEl.contains(a) ? 'vizinha' : 'fora'
      return a === window.__focoAntes && a !== document.body ? 'origem' : 'perdido'
    })
    check(volta === 'origem' || volta === 'vizinha', `fechar pelo teclado: foco vai para a vizinha ou volta para a origem, nunca para o <body> (${volta})`)
  }
  // Limpa a pilha para os próximos blocos.
  for (let i = 0; i < 10 && (await pilha.getByTestId('notify-close').count()) > 0; i++) await pilha.getByTestId('notify-close').first().click()

  // ---------- prefers-reduced-motion: sem animação na pilha ----------
  const animacaoDoInfo = async () => {
    await importar.click()
    const c = cartao('info')
    await c.waitFor({ state: 'visible', timeout: 5000 })
    const r = await c.evaluate((el) => ({
      nome: getComputedStyle(el).animationName,
      rodando: (document.querySelector('.notify-stack')?.getAnimations({ subtree: true }) ?? []).length
    }))
    await c.getByTestId('notify-close').click()
    await win.locator('.notify-card.notify-info').waitFor({ state: 'detached', timeout: 5000 })
    return r
  }
  const comMovimento = await animacaoDoInfo()
  check(comMovimento.nome === 'notify-entrada', `controle: sem reduced-motion o cartão anima a entrada (${comMovimento.nome})`)
  await win.emulateMedia({ reducedMotion: 'reduce' })
  const semMovimento = await animacaoDoInfo()
  check(
    semMovimento.nome === 'none' && semMovimento.rodando === 0,
    `reduced-motion: nenhuma animação na pilha (${semMovimento.nome}, ${semMovimento.rodando} rodando)`
  )
  await win.emulateMedia({ reducedMotion: null })

  // ---------- lembrete da agenda: toast info com "Abrir na agenda" ----------
  // O main só manda o toast com a janela em foco (senão vai a notificação nativa). A janela do E2E pode
  // não ter foco no SO: força isFocused() desta instância, só no processo de teste.
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.isFocused = () => true
  })
  const tituloLembrete = 'Daily <img src=x onerror=alert(1)>'
  await win.evaluate(async (title) => {
    const d = new Date(Date.now() + 3 * 60_000)
    const p = (n) => String(n).padStart(2, '0')
    const start = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    await window.deck.agenda.save({ id: '', title, start, durationMin: 15, recurrence: { kind: 'none' }, remindMin: 10, kind: 'meeting' })
  }, tituloLembrete)
  const lembrete = cartao('info')
  // O agendador confere a cada 30 s.
  const chegou = await waitFor(async () => ((await lembrete.textContent()) ?? '').includes(`Lembrete da agenda: ${tituloLembrete}`), 45000)
  check(chegou, 'lembrete com a janela em foco: toast info "Lembrete da agenda: …"')
  if (chegou) {
    check((await lembrete.locator('img').count()) === 0, 'título do lembrete renderizado como texto (sem <img> no cartão)')
    const abrir = lembrete.getByTestId('notify-action')
    check(((await abrir.textContent()) ?? '').trim() === 'Abrir na agenda', 'lembrete: ação "Abrir na agenda"')
    await abrir.click()
    check(await waitFor(() => win.locator('.view-pad.agenda').isVisible(), 5000), '"Abrir na agenda" abre a aba Agenda')
    check(await waitFor(async () => (await win.locator('.notify-card.notify-info').count()) === 0, 5000), 'o toast fecha depois da ação')
  }

  // ---------- erro do chat: card sem toast, "Copiar detalhes", "Tentar de novo" ----------
  await goView(1)
  const caixaChat = win.getByRole('textbox', { name: 'Mensagem para o Claude' })
  const livre = () => waitFor(async () => (await caixaChat.isEnabled()) && !(await win.getByText('Claude está trabalhando…').isVisible()))
  const toastsDoChat = () => win.locator('.notify-card.notify-erro', { hasText: 'Erro no chat' })
  const ultimoErro = () => win.locator('.agent-error').last()
  const pedidos = () => api.hits.filter((h) => h.path === '/v1/messages').length
  api.setCenario('auth401')
  await livre()
  const cardsAntes = await win.locator('.agent-error').count()
  await caixaChat.fill('falha no chat')
  await caixaChat.press('Enter')
  check(await waitFor(async () => (await win.locator('.agent-error').count()) > cardsAntes), 'erro no chat: card do turno aparece')
  await livre()
  await win.waitForTimeout(1500)
  check((await toastsDoChat().count()) === 0, 'erro com o chat na tela: só o card, nenhum toast "Erro no chat"')

  // Copiar detalhes: o mesmo texto do <pre>. Guarda e devolve a área de transferência de quem roda o teste.
  const CONTROLE_CLIP = 'controle-e2e-h07.2'
  const lerClip = () => app.evaluate(({ clipboard }) => clipboard.readText())
  const clipOriginal = await lerClip()
  try {
    await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), CONTROLE_CLIP)
    await ultimoErro().getByRole('button', { name: 'Detalhes técnicos' }).click()
    const detalhe = ((await ultimoErro().locator('pre.agent-error-detail').textContent()) ?? '').trim()
    await ultimoErro().getByRole('button', { name: 'Copiar detalhes' }).click()
    const copiado = await waitFor(async () => (await lerClip()) !== CONTROLE_CLIP, 5000)
    // O clipboard do Windows guarda quebra de linha como CRLF: compara só depois de normalizar.
    const clip = (await lerClip()).replace(/\r\n/g, '\n').trim()
    check(copiado && detalhe.length > 0 && clip === detalhe, `"Copiar detalhes" copia o mesmo texto de "Detalhes técnicos" (${clip.length} = ${detalhe.length} caracteres)`)
    check(await waitFor(() => cartao('sucesso').filter({ hasText: 'Detalhes copiados.' }).isVisible(), 5000), '"Copiar detalhes": toast "Detalhes copiados."')
  } finally {
    await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), clipOriginal)
  }

  // Tentar de novo: nunca sozinho; durante o turno não fica disponível; o rascunho do composer fica.
  const RASCUNHO = 'rascunho que não pode sumir'
  await caixaChat.fill(RASCUNHO)
  const p0 = pedidos()
  await win.waitForTimeout(3000)
  check(pedidos() === p0, '"Tentar de novo" não reenvia sozinho (nenhum pedido em 3 s)')
  api.setAtraso(4000)
  await ultimoErro().getByRole('button', { name: 'Tentar de novo' }).click()
  check(await waitFor(() => win.getByText('Claude está trabalhando…').isVisible(), 5000), 'controle: o clique em "Tentar de novo" começou um turno')
  // No fluxo real o main grava a mensagem reenviada antes do busy: o card antigo deixa de ser do último
  // turno e o botão sai (o aria-disabled do componente é defesa extra, não alcançável por aqui).
  const disponiveis = await win
    .locator('.agent-error')
    .getByRole('button', { name: 'Tentar de novo' })
    .evaluateAll((els) => els.filter((el) => el.getAttribute('aria-disabled') !== 'true').length)
  const cardsNoTurno = await win.locator('.agent-error').count()
  check(cardsNoTurno > 0 && disponiveis === 0, `durante o turno, ${cardsNoTurno} card(s) de erro na tela e nenhum "Tentar de novo" disponível (${disponiveis})`)
  check((await caixaChat.inputValue()) === RASCUNHO, 'durante o turno, o rascunho do composer fica intacto')
  await livre()
  check(pedidos() > p0, 'controle: "Tentar de novo" reenviou a mensagem ao servidor falso')
  check(
    await waitFor(async () => (await ultimoErro().getByRole('button', { name: 'Tentar de novo' }).getAttribute('aria-disabled')) === null, 20000),
    'controle: terminado o turno, o card novo volta a oferecer "Tentar de novo" disponível'
  )
  check((await caixaChat.inputValue()) === RASCUNHO, 'depois do turno, o rascunho do composer continua intacto')

  // Em outra aba: um único toast "Erro no chat" com "Ver no chat", mesmo com o fim do turno chegando duas vezes.
  await caixaChat.fill('erro em outra aba')
  await caixaChat.press('Enter')
  await goView(5)
  check(await waitFor(() => toastsDoChat().first().isVisible(), 20000), 'erro em outra aba: toast "Erro no chat: …"')
  await win.waitForTimeout(2500)
  check((await toastsDoChat().count()) === 1, `erro em outra aba: um único toast (${await toastsDoChat().count()})`)
  const verNoChat = toastsDoChat().first().getByTestId('notify-action')
  check(((await verNoChat.textContent()) ?? '').trim() === 'Ver no chat', 'toast do erro: ação "Ver no chat"')
  await verNoChat.click()
  check(await waitFor(() => caixaChat.isVisible(), 5000), '"Ver no chat" volta para o chat')
  await goView(5)
  await win.waitForTimeout(1500)
  check((await toastsDoChat().count()) === 0, 'erro já visto não vira toast de novo ao trocar de aba')
  api.setAtraso(0)
} catch (err) {
  failures++
  console.error(err)
} finally {
  await app?.close().catch(() => {})
  await api.close()
  rmSync(base, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} falha(s)` : '\nNotificações: tudo ok')
process.exit(failures ? 1 : 0)
