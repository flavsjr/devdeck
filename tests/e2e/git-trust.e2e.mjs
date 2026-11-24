// E2E (Playwright + Electron): fluxo "Git pausado" → "Revisar configurações…" → confiar (H05.1).
// Roda o build (`npm run build`) com dados isolados (--user-data-dir) num repositório de teste com filtro que grava
// um marcador. O diálogo nativo é respondido pelo teste (dialog.showMessageBox interceptado no main).
// Uso: npm run test:e2e
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const fwd = (p) => p.replace(/\\/g, '/')

let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

// ---------- fixture ----------
const base = mkdtempSync(join(tmpdir(), 'devdeck-e2e-'))
const repo = join(base, 'repo')
const markers = join(base, 'markers')
const userData = join(base, 'userdata')
mkdirSync(markers)
mkdirSync(userData)
writeFileSync(join(base, 'hook.js'), "require('fs').writeFileSync(require('path').join(process.argv[3], process.argv[2]), 'x'); process.stdin.on('error', () => {}); process.stdin.pipe(process.stdout)\n")
const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'empty.gitconfig') }
writeFileSync(join(base, 'empty.gitconfig'), '')
const git = (...args) => execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: gitEnv })
mkdirSync(repo)
git('init', '-q', '-b', 'main')
writeFileSync(join(repo, 'a.txt'), 'linha\n')
git('add', 'a.txt')
git('commit', '-q', '-m', 'init')
git('config', 'filter.evil.clean', `"${fwd(process.execPath)}" "${fwd(join(base, 'hook.js'))}" clean "${fwd(markers)}"`)
writeFileSync(join(repo, '.gitattributes'), '* filter=evil\n')
const future = new Date(Date.now() + 3_600_000)
utimesSync(join(repo, 'a.txt'), future, future)
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: repo }))

// ---------- app ----------
const env = { ...process.env }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${userData}`], env })
try {
  await app.evaluate(({ dialog }) => {
    globalThis.__dialogs = []
    // Primeiro diálogo (ao abrir o chat): "Abrir sem git". Os seguintes: "Confiar".
    dialog.showMessageBox = async (...a) => {
      const opts = a.length > 1 ? a[1] : a[0]
      globalThis.__dialogs.push({ title: opts.title, buttons: opts.buttons, detail: opts.detail })
      return { response: globalThis.__dialogs.length === 1 ? 0 : 1, checkboxChecked: false }
    }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  // Sequência do roteiro manual: mandar mensagem no chat e escolher "Abrir sem git" no diálogo.
  await win.locator('textarea').first().fill('teste')
  await win.keyboard.press('Enter')
  check(await waitFor(async () => (await app.evaluate(() => globalThis.__dialogs.length)) === 1), 'chat abre o diálogo de confiança antes da sessão')
  const first = (await app.evaluate(() => globalThis.__dialogs))[0]
  check(first?.buttons?.[0] === 'Abrir sem git', 'diálogo do chat oferece "Abrir sem git" (escolhido)')

  // Caminho do usuário: item "git pausado" da barra de status leva à aba Alterações.
  const sbPaused = win.getByRole('button', { name: /git pausado/ })
  check(await waitFor(() => sbPaused.isVisible()), 'barra de status mostra "git pausado"')
  await sbPaused.click()

  const paused = await waitFor(() => win.getByText('Git pausado neste workspace').isVisible())
  check(paused, 'aba Alterações mostra "Git pausado neste workspace"')
  if (!paused) {
    const shot = join(tmpdir(), 'devdeck-e2e-falha.png')
    await win.screenshot({ path: shot })
    console.log(`  captura: ${shot}`)
    console.log(`  texto: ${(await win.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | ')}`)
    throw new Error('estado pausado não apareceu')
  }
  check(marks().length === 0, 'nenhum comando do repositório rodou antes da confiança')

  const button = win.getByRole('button', { name: 'Revisar configurações…' })
  check(await button.isVisible(), 'botão "Revisar configurações…" visível')
  await button.click()

  const asked = await waitFor(async () => (await app.evaluate(() => globalThis.__dialogs.length)) > 1)
  const dialogs = await app.evaluate(() => globalThis.__dialogs)
  check(asked, `diálogo nativo aberto ao clicar (${dialogs.length})`)
  if (dialogs[1]) check(dialogs[1].buttons?.[1] === 'Confiar e usar git' && /filter\.evil\.clean/.test(dialogs[1].detail ?? ''), 'diálogo lista a chave e oferece "Confiar e usar git"')

  const listed = await waitFor(() => win.getByText('Git pausado neste workspace').isHidden())
  check(listed, 'depois de confiar a aba sai do estado pausado')
  check(await waitFor(() => existsSync(join(userData, 'trusted-git.json'))), 'confiança gravada em trusted-git.json')
  check(await waitFor(() => marks().includes('clean')), 'controle positivo: com confiança, o git do DevDeck roda o filtro do usuário')
} finally {
  await app.close()
  rmSync(base, { recursive: true, force: true })
}

function marks() {
  return existsSync(markers) ? readdirSync(markers) : []
}

console.log(failures ? `\n${failures} falha(s)` : '\nE2E ok')
process.exit(failures ? 1 : 0)
