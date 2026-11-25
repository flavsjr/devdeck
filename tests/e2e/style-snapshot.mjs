// Foto do estilo computado (H06.5): prova que mover CSS de camada não muda a tela.
// Uso:
//   node tests/e2e/style-snapshot.mjs <saida.json>            → grava a foto (8 abas × 2 temas + paleta e ajuda)
//   node tests/e2e/style-snapshot.mjs --diff <a.json> <b.json> → lista as diferenças (sai com 1 se houver)
// Precisa do build (electron-vite build). Dados isolados num --user-data-dir descartável; sem rede.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)

if (args[0] === '--diff') {
  const a = JSON.parse(readFileSync(args[1], 'utf8'))
  const b = JSON.parse(readFileSync(args[2], 'utf8'))
  let n = 0
  for (const tela of Object.keys({ ...a, ...b })) {
    const ea = a[tela] ?? {}
    const eb = b[tela] ?? {}
    for (const k of Object.keys({ ...ea, ...eb })) {
      if (!(k in ea) || !(k in eb)) {
        if (n++ < 200) console.log(`${tela} :: ${k} :: ${k in ea ? 'sumiu' : 'novo'}`)
        continue
      }
      for (const p of Object.keys({ ...ea[k], ...eb[k] })) {
        if (ea[k][p] !== eb[k][p] && n++ < 200) console.log(`${tela} :: ${k} :: ${p}: ${ea[k][p]} → ${eb[k][p]}`)
      }
    }
  }
  console.log(n ? `\n${n} diferença(s)` : 'Sem diferenças de estilo computado.')
  process.exit(n ? 1 : 0)
}

const saida = args[0]
if (!saida) throw new Error('uso: node tests/e2e/style-snapshot.mjs <saida.json>')
const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright-core')

const PROPS = [
  'display', 'position', 'visibility', 'opacity', 'color', 'background-color', 'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style',
  'border-top-left-radius', 'outline-style', 'box-shadow',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'text-transform',
  'text-decoration-line', 'white-space', 'letter-spacing',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'flex-grow', 'flex-shrink',
  'grid-template-columns', 'overflow-x', 'overflow-y', 'cursor', 'z-index', 'user-select'
]

const base = mkdtempSync(join(tmpdir(), 'devdeck-style-'))
const repo = join(base, 'repo')
const userData = join(base, 'userdata')
mkdirSync(repo)
mkdirSync(userData)
const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'empty.gitconfig') }
writeFileSync(join(base, 'empty.gitconfig'), '')
const git = (...a) => execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, env: gitEnv })
writeFileSync(join(repo, 'a.txt'), 'um\ndois\ntrês\n')
git('init', '-q', '-b', 'main')
git('add', 'a.txt')
git('commit', '-q', '-m', 'init')
writeFileSync(join(repo, 'a.txt'), 'um\nDOIS\ntrês\nquatro\n')
// Data fixa nas configurações não existe; a foto roda duas vezes no mesmo dia (antes e depois).
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: repo, theme: 'dark' }))

// Chat com resposta real do servidor falso da API (markdown do assistente na foto).
const { TEXTO_OK, fakeApiEnv, startFakeApi } = await import(new URL('./helpers/fake-api.mjs', import.meta.url).href)
const api = await startFakeApi({ cenario: 'ok', texto: `${TEXTO_OK}\n\n- item com \`código\`\n\n\`\`\`ts\nconst x = 1\n\`\`\`` })
const cfg = join(base, 'claude-config')
mkdirSync(cfg)
const limpo = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC|CCD)/i.test(k)))
const env = fakeApiEnv(limpo, api.url, cfg)

const app = await electron.launch({ executablePath: require('electron'), args: ['.', `--user-data-dir=${userData}`], env, colorScheme: null })
const foto = {}
try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
  // Sem animação: a foto pega o estado final.
  await win.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })

  // Conteúdo para cobrir as regras do chat, do painel direito e do diff.
  const caixa = win.getByRole('textbox', { name: 'Mensagem para o Claude' })
  await caixa.fill('oi')
  await caixa.press('Enter')
  await win.getByText(TEXTO_OK).waitFor({ timeout: 30000 })
  const { readdirSync } = await import('node:fs')
  const sessionId = readdirSync(join(userData, 'sessions')).find((f) => f.endsWith('.json'))?.replace('.json', '')
  await app.evaluate(
    ({ BrowserWindow }, e) => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', e),
    {
      type: 'approval',
      approval: { id: '00000000-0000-4000-8000-000000000001', sessionId, kind: 'edit', toolName: 'Edit', title: 'Edit a.txt', filePath: join(repo, 'a.txt'), relPath: 'a.txt', before: 'um\ndois\n', after: 'um\nDOIS\n', ts: 0 }
    }
  )
  await win.locator('[data-approval]').first().waitFor({ timeout: 10000 })
  // Toast da conquista do 1º turno: fecha para não entrar na foto (o tempo dele varia entre rodadas).
  await win.waitForTimeout(500)
  await win.evaluate(() => document.querySelectorAll('.notify-card button[aria-label="Fechar notificação"]').forEach((b) => b.click()))
  await win.locator('.notify-card').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})

  const capturar = (nome) =>
    win.evaluate(
      ([props]) => {
        const out = {}
        const chave = (el) => {
          const partes = []
          for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
            const irmaos = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : []
            const cls = [...e.classList].sort().join('.')
            partes.unshift(`${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}${irmaos.length > 1 ? `:${irmaos.indexOf(e)}` : ''}`)
          }
          return partes.join('>')
        }
        for (const el of document.body.querySelectorAll('*')) {
          if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          const o = { rect: `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` }
          for (const p of props) o[p] = cs.getPropertyValue(p)
          for (const pseudo of ['::before', '::after']) {
            const ps = getComputedStyle(el, pseudo)
            if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
              o[`${pseudo}content`] = ps.content
              o[`${pseudo}bg`] = ps.backgroundColor
              o[`${pseudo}color`] = ps.color
            }
          }
          out[chave(el)] = o
        }
        return out
      },
      [PROPS]
    ).then((o) => (foto[nome] = o))

  const blur = () => win.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  for (const tema of ['dark', 'light']) {
    await app.evaluate(({ nativeTheme }, t) => (nativeTheme.themeSource = t), tema)
    await win.waitForTimeout(300)
    for (let i = 1; i <= 8; i++) {
      await blur()
      await win.keyboard.press(`Control+${i}`)
      await win.waitForTimeout(500)
      // Alterações: abre o diff do arquivo modificado.
      if (i === 2) {
        await win.locator('.change-row').first().click()
        await win.waitForTimeout(500)
      }
      await capturar(`${tema}/aba-${i}`)
    }
    await blur()
    await win.keyboard.press('Control+1')
    await win.keyboard.press('Control+K')
    await win.waitForTimeout(400)
    await capturar(`${tema}/paleta`)
    await win.keyboard.press('Escape')
    await blur()
    await win.keyboard.press('F1')
    await win.waitForTimeout(400)
    await capturar(`${tema}/ajuda`)
    await win.keyboard.press('Escape')
  }
} finally {
  await app.close().catch(() => {})
  await api.close()
  rmSync(base, { recursive: true, force: true })
}
writeFileSync(saida, JSON.stringify(foto))
console.log(`Foto gravada: ${saida} (${Object.values(foto).reduce((n, t) => n + Object.keys(t).length, 0)} elementos em ${Object.keys(foto).length} telas)`)
