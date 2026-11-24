// E2E (Playwright + Electron) do roteiro manual da Sprint 05 que dá para automatizar:
// - passo 10: aprovação pendente com o painel direito recolhido e em janela estreita (1280×720 e ~900 px);
// - selo "fora do workspace", "Sempre" escondido e prévia parcial desabilitando "Aprovar todas";
// - passo 11 (parte): segredo de MCP não vai em claro para o disco e URL com ?token= é recusada;
// - passo 9 (parte): axe-core sem violações no card de aprovação e no estado "Git pausado" não entra aqui.
// O pedido de aprovação é injetado pelo canal de eventos do main (mesmo formato que o agente emite).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

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

const base = mkdtempSync(join(tmpdir(), 'devdeck-e2e-'))
const ws = join(base, 'ws')
const userData = join(base, 'userdata')
mkdirSync(ws)
mkdirSync(userData)
writeFileSync(join(ws, 'a.txt'), 'oi\n')
// Painel direito recolhido de propósito: a aprovação tem que abri-lo.
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ lastWorkspace: ws, ui: { rightPanelOpen: false, sidebarOpen: true, rightPanelWidth: 360 } }))

const env = { ...process.env }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${userData}`], env })

const FAKE_TOKEN = ['FAKE', 'e2e', 'x'.repeat(24), 'TOKEN'].join('-')

try {
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  const setSize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h])
  const emit = (event) => app.evaluate(({ BrowserWindow }, e) => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', e), event)
  const axe = async (selector) => {
    await win.evaluate(AXE)
    return win.evaluate(async (sel) => {
      const r = await window.axe.run(sel, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })
      return r.violations.map((v) => `${v.id}: ${v.nodes.length}`)
    }, selector)
  }

  // Chat ativo (sem falar com o agente): o pedido injetado pertence a ele.
  await win.getByRole('button', { name: 'Novo chat' }).click()
  const sessionsDir = join(userData, 'sessions')
  await waitFor(() => existsSync(sessionsDir) && readdirSync(sessionsDir).some((f) => f.endsWith('.json')))
  const sessionId = readdirSync(sessionsDir).find((f) => f.endsWith('.json'))?.replace('.json', '')
  check(Boolean(sessionId), 'chat criado')

  const approval = (over) => ({
    type: 'approval',
    approval: {
      id: crypto.randomUUID(),
      sessionId,
      kind: 'edit',
      toolName: 'Edit',
      title: 'Edit a.txt',
      filePath: join(ws, 'a.txt'),
      relPath: 'a.txt',
      before: 'oi\n',
      after: 'olá\n',
      ts: Date.now(),
      ...over
    }
  })

  for (const [w, h, label] of [
    [1600, 900, 'janela larga com painel recolhido'],
    [1280, 720, '1280×720'],
    [900, 700, '~900 px (sobreposição)']
  ]) {
    await setSize(w, h)
    const ap = approval({})
    await emit(ap)
    const card = win.locator(`[data-approval="${ap.approval.id}"]`)
    check(await waitFor(() => card.isVisible()), `${label}: card de aprovação aparece mesmo com o painel recolhido`)
    check(await win.getByRole('button', { name: /Aprovar/ }).first().isVisible(), `${label}: botão Aprovar visível`)
    await emit({ type: 'approval-resolved', id: ap.approval.id, sessionId, approved: false })
    await waitFor(() => card.isHidden())
  }
  await setSize(1600, 900)

  // Caminho fora do workspace: selo e "Sempre" escondido.
  const outside = approval({ scope: 'outside', allowAlways: false, filePath: 'C:\\fora\\b.txt', relPath: 'C:\\fora\\b.txt' })
  await emit(outside)
  const outCard = win.locator(`[data-approval="${outside.approval.id}"]`)
  await waitFor(() => outCard.isVisible())
  check(await outCard.getByText('fora do workspace').isVisible(), 'selo "fora do workspace" no card')
  check((await outCard.getByRole('button', { name: /Aprovar todas da sessão/ }).count()) === 0, '"Aprovar todas da sessão" escondido fora do workspace')
  const violations = await axe(`[data-approval="${outside.approval.id}"]`)
  check(violations.length === 0, `axe sem violações no card (${violations.join(', ') || 'nenhuma'})`)
  await emit({ type: 'approval-resolved', id: outside.approval.id, sessionId, approved: false })
  await waitFor(() => outCard.isHidden())

  // Prévia parcial (arquivo grande cortado no main): "Aprovar todas" desabilitado e aviso visível.
  const partial = approval({ previewPartial: true })
  await emit(partial)
  const pCard = win.locator(`[data-approval="${partial.approval.id}"]`)
  await waitFor(() => pCard.isVisible())
  check(await pCard.getByText(/Prévia parcial/).first().isVisible(), 'aviso "Prévia parcial" no card')
  check(await pCard.getByRole('button', { name: /Aprovar todas da sessão/ }).isDisabled(), '"Aprovar todas da sessão" desabilitado com prévia parcial')
  await emit({ type: 'approval-resolved', id: partial.approval.id, sessionId, approved: false })

  // Edit que vai falhar: aviso no card.
  const failing = approval({ previewError: 'old_string não encontrado no arquivo: o Edit vai falhar.', after: 'oi\n' })
  await emit(failing)
  const fCard = win.locator(`[data-approval="${failing.approval.id}"]`)
  await waitFor(() => fCard.isVisible())
  check(await fCard.getByText(/o Edit vai falhar/).isVisible(), 'aviso de Edit que vai falhar no card')
  await emit({ type: 'approval-resolved', id: failing.approval.id, sessionId, approved: false })

  // Passo 11 (parte): segredo de MCP cifrado no disco; URL com token recusada.
  const saved = await win.evaluate(
    (token) => window.deck.mcp.save({ name: 'e2e', enabled: false, type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: `Bearer ${token}` } }).then(
      (list) => list.find((s) => s.name === 'e2e')?.headersMasked?.Authorization ?? 'sem máscara',
      (e) => `erro: ${e.message}`
    ),
    FAKE_TOKEN
  )
  check(!saved.includes(FAKE_TOKEN) && !saved.startsWith('erro'), `renderer recebe só a máscara (${saved})`)
  const leaked = []
  let locked = 0
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (st.size < 5_000_000) {
        try {
          if (readFileSync(p).includes(FAKE_TOKEN)) leaked.push(p.slice(userData.length))
        } catch {
          locked++ // arquivos do Chromium abertos com trava exclusiva (cookies, leveldb)
        }
      }
    }
  }
  walk(userData)
  check(leaked.length === 0, `token não aparece em claro em nenhum arquivo de dados (${leaked.join(', ') || 'nenhum'}; ${locked} travado(s) pelo Chromium)`)
  check(existsSync(join(userData, 'mcp-servers.json')) && !readFileSync(join(userData, 'mcp-servers.json'), 'utf8').includes('Bearer'), 'mcp-servers.json guarda o header cifrado')
  const refused = await win.evaluate(() =>
    window.deck.mcp.save({ name: 'e2e2', enabled: false, type: 'http', url: 'https://mcp.example.com/mcp?token=abc123' }).then(
      () => 'aceito',
      (e) => e.message
    )
  )
  check(/header/i.test(refused), `URL com ?token= recusada ("${refused.slice(0, 80)}…")`)
} finally {
  await app.close()
  rmSync(base, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} falha(s)` : '\nE2E ok')
process.exit(failures ? 1 : 0)
