// E2E (Playwright + Electron) do tema claro (H06.1, T35):
// - troca Escuro ↔ Claro pela Aparência sem recarregar; getBackgroundColor() igual ao --bg do tema;
// - persistência após reiniciar; "Sistema (agora: X)" segue o nativeTheme;
// - axe sem violações serious/critical nos dois temas: 8 abas, paleta, ajuda, card de aprovação e "Git pausado";
// - capturas do tema claro em 1280×720 em docs/sprints/sprint-06/tema-claro/.
// O agente aponta para um endereço inalcançável: nenhuma chamada real à API.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const SHOTS = resolve('docs/sprints/sprint-06/tema-claro')

let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await fn()) return true
    } catch {
      // elemento ainda não existe
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

// ---------- workspace com config de git que pausa (H05.1) ----------
const base = mkdtempSync(join(tmpdir(), 'devdeck-tema-'))
const repo = join(base, 'repo')
const userData = join(base, 'userdata')
mkdirSync(repo)
mkdirSync(userData)
const fwd = (p) => p.replace(/\\/g, '/')
const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'empty.gitconfig') }
writeFileSync(join(base, 'empty.gitconfig'), '')
const git = (...args) => execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: gitEnv })
writeFileSync(join(repo, 'a.txt'), 'oi\n')
git('init', '-q', '-b', 'main')
git('add', 'a.txt')
git('commit', '-q', '-m', 'init')
git('config', 'filter.evil.clean', `"${fwd(process.execPath)}" -e ""`)
writeFileSync(join(repo, '.gitattributes'), '* filter=evil\n')
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: repo, theme: 'light' }))

const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|CCD)/i.test(k)))
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9'

const VIEWS = ['chat', 'changes', 'mcp', 'profile', 'agenda', 'community', 'costs', 'settings']
const BG = { light: '#ffffff', dark: '#0b0d12' }

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${userData}`], env, colorScheme: null })
  await app.evaluate(({ dialog }) => {
    // Diálogo de confiança: "Abrir sem git" (deixa o workspace em "Git pausado").
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
  return { app, win }
}

const winBg = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase())
const cssBg = (win) => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase())
const blur = (win) => win.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
const axe = async (win, selector) => {
  if (!(await win.evaluate(() => Boolean(window.axe)))) await win.evaluate(AXE)
  return win.evaluate(async (sel) => {
    const r = await window.axe.run(sel, { runOnly: ['wcag2a', 'wcag2aa'] })
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} [${(n.any[0]?.message ?? '').slice(0, 140)}]`).join(' | ')}`)
  }, selector)
}
const goView = async (win, i) => {
  await blur(win)
  await win.keyboard.press(`Control+${i + 1}`)
  await win.waitForTimeout(250)
}
async function setTheme(win, nome) {
  await goView(win, VIEWS.indexOf('settings'))
  await (nome === 'Sistema' ? win.getByRole('radio', { name: /^Sistema/ }) : win.getByRole('radio', { name: nome, exact: true })).check()
}

let app
try {
  // ---------- 1ª abertura: tema salvo "light" ----------
  let w = await launch()
  app = w.app
  let win = w.win
  check((await winBg(app)) === BG.light, `janela abre com o fundo do claro (${await winBg(app)})`)
  check((await cssBg(win)) === BG.light, 'CSS pinta --bg do claro')
  await win.evaluate(() => (window.__semRecarga = true))

  // Chat (abre o diálogo de confiança → "Abrir sem git") e sessão para o card de aprovação.
  await win.locator('textarea').first().fill('teste')
  await win.keyboard.press('Enter')
  const sessionsDir = join(userData, 'sessions')
  await waitFor(() => existsSync(sessionsDir) && readdirSync(sessionsDir).some((f) => f.endsWith('.json')))
  const sessionId = readdirSync(sessionsDir).find((f) => f.endsWith('.json'))?.replace('.json', '')
  check(Boolean(sessionId), 'chat criado')

  mkdirSync(SHOTS, { recursive: true })
  for (const tema of ['light', 'dark']) {
    const nome = tema === 'light' ? 'Claro' : 'Escuro'
    await setTheme(win, nome)
    check(await waitFor(async () => (await winBg(app)) === BG[tema]), `${nome}: fundo da janela troca sem reiniciar`)
    check(await waitFor(async () => (await cssBg(win)) === BG[tema]), `${nome}: --bg do CSS troca (${await cssBg(win)})`)
    check(await win.evaluate(() => window.__semRecarga === true), `${nome}: sem recarregar a página`)

    for (const [i, view] of VIEWS.entries()) {
      await goView(win, i)
      const v = await axe(win, 'body')
      check(v.length === 0, `${nome} · aba ${view}: axe sem serious/critical (${v.join(', ') || 'nenhuma'})`)
      if (tema === 'light') await win.screenshot({ path: join(SHOTS, `${String(i + 1).padStart(2, '0')}-${view}.png`) })
    }

    await goView(win, 0)
    await win.keyboard.press('Control+K')
    const pal = win.getByRole('dialog').first()
    if (await waitFor(() => pal.isVisible())) {
      const v = await axe(win, 'body')
      check(v.length === 0, `${nome} · paleta: axe sem serious/critical (${v.join(', ') || 'nenhuma'})`)
      if (tema === 'light') await win.screenshot({ path: join(SHOTS, '09-paleta.png') })
    } else check(false, `${nome} · paleta abriu`)
    await win.keyboard.press('Escape')

    await blur(win)
    await win.keyboard.press('F1')
    const help = win.getByRole('dialog').first()
    if (await waitFor(() => help.isVisible())) {
      const v = await axe(win, 'body')
      check(v.length === 0, `${nome} · ajuda: axe sem serious/critical (${v.join(', ') || 'nenhuma'})`)
      if (tema === 'light') await win.screenshot({ path: join(SHOTS, '10-ajuda.png') })
    } else check(false, `${nome} · ajuda abriu`)
    await win.keyboard.press('Escape')

    // Card de aprovação injetado pelo canal de eventos do main (mesmo formato que o agente emite).
    await goView(win, 0)
    const id = crypto.randomUUID()
    const emit = (e) => app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', ev), e)
    await emit({
      type: 'approval',
      approval: { id, sessionId, kind: 'edit', toolName: 'Edit', title: 'Edit a.txt', filePath: join(repo, 'a.txt'), relPath: 'a.txt', before: 'oi\n', after: 'olá\n', ts: Date.now() }
    })
    const card = win.locator(`[data-approval="${id}"]`)
    if (await waitFor(() => card.isVisible())) {
      const v = await axe(win, `[data-approval="${id}"]`)
      check(v.length === 0, `${nome} · card de aprovação: axe sem serious/critical (${v.join(', ') || 'nenhuma'})`)
      if (tema === 'light') await win.screenshot({ path: join(SHOTS, '11-aprovacao.png') })
    } else check(false, `${nome} · card de aprovação apareceu`)
    await emit({ type: 'approval-resolved', id, sessionId, approved: false })

    await goView(win, VIEWS.indexOf('changes'))
    const paused = win.locator('.git-paused')
    if (await waitFor(() => paused.isVisible())) {
      const v = await axe(win, '.git-paused')
      check(v.length === 0, `${nome} · Git pausado: axe sem serious/critical (${v.join(', ') || 'nenhuma'})`)
      if (tema === 'light') await win.screenshot({ path: join(SHOTS, '12-git-pausado.png') })
    } else check(false, `${nome} · "Git pausado" apareceu`)
  }

  // ---------- "Sistema" mostra o tema efetivo ----------
  await setTheme(win, 'Sistema')
  await waitFor(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource === 'system'))
  await win.waitForTimeout(300)
  const escuroSO = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
  const rotulo = `Sistema (agora: ${escuroSO ? 'Escuro' : 'Claro'})`
  check(await waitFor(() => win.getByRole('radio', { name: rotulo }).isVisible()), `rótulo "${rotulo}"`)
  check(await waitFor(async () => (await winBg(app)) === (escuroSO ? BG.dark : BG.light)), 'Sistema: fundo segue o Windows')

  // ---------- persistência ----------
  await setTheme(win, 'Claro')
  await waitFor(async () => (await winBg(app)) === BG.light)
  await app.close()
  w = await launch()
  app = w.app
  win = w.win
  check((await winBg(app)) === BG.light, 'depois de reiniciar: janela abre no claro')
  await goView(win, VIEWS.indexOf('settings'))
  check(await win.getByRole('radio', { name: 'Claro', exact: true }).isChecked(), 'depois de reiniciar: "Claro" marcado')
} catch (err) {
  failures++
  console.error(err)
} finally {
  await app?.close().catch(() => {})
  rmSync(base, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} falha(s)` : '\nTema claro: tudo ok')
process.exit(failures ? 1 : 0)
