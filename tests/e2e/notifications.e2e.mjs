// E2E (Playwright + Electron) da H06.2 (T25): os 5 tipos de notificação por fluxo real, com axe.
// - conquista: primeiro turno com sucesso no servidor falso da API ("Hello, Claude");
// - sucesso: salvar a chave da API (valor falso, cifrado num --user-data-dir descartável);
// - aviso: servidor MCP com nome inválido;
// - erro: servidor MCP HTTP com ?token= na URL (o main recusa);
// - info: "Importar do Claude" sem nada novo (HOME, USERPROFILE e APPDATA apontam para pastas vazias).
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
