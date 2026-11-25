// E2E (Playwright + Electron) da H06.3/H06.7 (T24): erro do Claude vira card legível e nenhum segredo vaza.
// Servidor falso da API em 127.0.0.1 (helpers/fake-api.mjs); chaves e tokens são falsos.
// - 401 com chave e Bearer falsos no corpo → card "A chave da API foi recusada", axe sem violações graves;
// - nenhum valor falso na tela (nem em "Detalhes técnicos"), no stdout/stderr do Electron nem nos arquivos do
//   --user-data-dir (JSON da sessão);
// - 429, 529 e 400 de créditos → cards da H06.7.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'
import { SEGREDOS_FALSOS, fakeApiEnv, startFakeApi } from './helpers/fake-api.mjs'

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
/** Arquivos de texto de uma pasta, recursivo (para procurar segredo no disco). */
function arquivos(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...arquivos(p))
    else if (st.size < 5 * 1024 * 1024) out.push(p)
  }
  return out
}
const vazados = (texto) => SEGREDOS_FALSOS.filter((s) => texto.includes(s))

const base = mkdtempSync(join(tmpdir(), 'devdeck-auth-'))
const ws = join(base, 'ws')
const userData = join(base, 'userdata')
const cfg = join(base, 'claude-config')
for (const d of [ws, userData, cfg]) mkdirSync(d)

const api = await startFakeApi({ cenario: 'auth401' })
const limpo = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|CCD)/i.test(k)))
const env = fakeApiEnv(limpo, api.url, cfg)
let saida = ''
let app
try {
  // Workspace sem git nem config de projeto: abre direto, sem diálogo de confiança.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: ws }))
  app = await electron.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${userData}`], env, colorScheme: null })
  app.process().stdout?.on('data', (d) => (saida += d.toString()))
  app.process().stderr?.on('data', (d) => (saida += d.toString()))
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  const axe = async (sel) => {
    if (!(await win.evaluate(() => Boolean(window.axe)))) await win.evaluate(AXE)
    return win.evaluate(async (s) => {
      const r = await window.axe.run(s, { runOnly: ['wcag2a', 'wcag2aa'] })
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`)
    }, sel)
  }
  const enviar = async (texto) => {
    const caixa = win.getByRole('textbox', { name: 'Mensagem para o Claude' })
    await waitFor(async () => (await caixa.isEnabled()) && !(await win.getByText('Claude está trabalhando…').isVisible()))
    await caixa.fill(texto)
    await caixa.press('Enter')
  }
  const ultimoCard = () => win.locator('.agent-error').last()
  const esperarTitulo = (titulo) => waitFor(async () => ((await ultimoCard().locator('.agent-error-title').textContent()) ?? '').includes(titulo))

  // ---------- 401 ----------
  await enviar('oi')
  check(await esperarTitulo('A chave da API foi recusada'), 'chave recusada (401): card "A chave da API foi recusada"')
  check(
    api.hits.some((h) => h.path.startsWith('/v1/messages') && h.status === 401),
    'controle positivo: o servidor falso respondeu 401 com a chave e o Bearer falsos no corpo'
  )
  const v401 = await axe('.agent-error')
  check(v401.length === 0, `card de erro: axe sem serious/critical (${v401.join(', ') || 'nenhuma'})`)
  check((await win.locator('.agent-error').count()) === 1, 'um card por turno (sem balão cru em inglês junto)')
  const toggle = ultimoCard().getByRole('button', { name: 'Detalhes técnicos' })
  if (await toggle.isVisible()) await toggle.click()
  const tela = (await win.locator('body').innerText()) + (await win.content())
  check(vazados(tela).length === 0, `nenhum valor falso na tela nem no HTML, com os detalhes abertos (${vazados(tela).length})`)

  // ---------- H06.7: limite, sobrecarga e créditos ----------
  for (const [cenario, titulo] of [
    ['rate429', 'Limite de uso do Claude atingido'],
    ['overloaded529', 'O Claude está sobrecarregado agora'],
    ['billing400', 'Os créditos da sua chave da API acabaram']
  ]) {
    api.setCenario(cenario)
    await enviar(`de novo (${cenario})`)
    check(await esperarTitulo(titulo), `${cenario}: card "${titulo}"`)
  }

  await app.close()
  app = undefined
  check(vazados(saida).length === 0, `nenhum valor falso no stdout/stderr do Electron (${saida.length} caracteres lidos)`)
  const noDisco = arquivos(userData).filter((p) => vazados(readFileSync(p, 'latin1')).length > 0)
  check(noDisco.length === 0, `nenhum valor falso nos arquivos do --user-data-dir (${noDisco.join(', ') || 'nenhum'})`)
  const sessoes = join(userData, 'sessions')
  check(readdirSync(sessoes).some((f) => f.endsWith('.json')), 'controle: o JSON da sessão foi gravado e lido')
} catch (err) {
  failures++
  console.error(err)
} finally {
  await app?.close().catch(() => {})
  await api.close()
  rmSync(base, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} falha(s)` : '\nErros do Claude: tudo ok')
process.exit(failures ? 1 : 0)
