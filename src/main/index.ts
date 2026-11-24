import { app, BrowserWindow, Menu, dialog, nativeTheme, protocol, session, shell } from 'electron'
import { join, relative, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { AppSettings } from '@shared/types'
import {
  bumpStats,
  getAgendaEvents,
  getMcpServers,
  getSettings,
  listIcsFeedViews,
  listMcpServerViews,
  migrateLegacyData,
  migrateSecrets,
  migrateSettings,
  saveMcpServers,
  saveProfile,
  setApiKey,
  updateSettings
} from './store'
import { listDir, openWorkspace, readWorkspaceFile } from './workspace'
import { gitDiff, gitRestore, gitStatus, gitTrust } from './git'
import { importFromClaude, testMcpServer } from './mcp'
import { costSummary } from './costs'
import { setEmitter } from './events'
import { achievementsSummary, checkAchievements } from './achievements'
import { getProfileSummary, refreshProfile, setToken, updateProfile } from './profile'
import { handle } from './ipc'
import { APP_INDEX, APP_SCHEME, isAllowedSubframeUrl, isAppUrl, isPermissionAllowed, resolveAppAsset } from './lib/origin'
import { appLocation } from './appLocation'
import * as v from './lib/validation'
import { resolveMcpInput } from './lib/secrets'
import { helpUrl } from './lib/help'
import { setMainWindow } from './mainWindow'
import { DEBUG_SWITCHES, hasDebugSwitch } from './lib/cli'
import { themeBg, type ThemePref } from './lib/theme'
import * as agenda from './agenda'
import * as agent from './agent'

let win: BrowserWindow | null = null
const devUrl = (): string | undefined => appLocation().devUrl

// App instalado: depurador remoto e inspetor não abrem (a fuse cobre --inspect do Node, não o switch do Chromium).
if (app.isPackaged && (hasDebugSwitch(process.argv) || DEBUG_SWITCHES.some((s) => app.commandLine.hasSwitch(s)))) app.exit(1)

// UI empacotada por app://devdeck: com a fuse GrantFileProtocolExtraPrivileges desligada, file:// não lê o asar (H05.2).
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

/** Serve só arquivos da pasta do renderer; qualquer outra coisa é 404. */
function registerAppProtocol(): void {
  const rendererDir = join(__dirname, '../renderer')
  protocol.handle(APP_SCHEME, async (req) => {
    const asset = resolveAppAsset(req.url)
    if (!asset) return new Response('Não encontrado', { status: 404 })
    const file = join(rendererDir, ...asset.rel.split('/'))
    const rel = relative(rendererDir, file)
    if (rel.startsWith('..') || isAbsolute(rel)) return new Response('Não encontrado', { status: 404 })
    try {
      return new Response(await readFile(file), { headers: { 'content-type': asset.mime, 'x-content-type-options': 'nosniff' } })
    } catch {
      return new Response('Não encontrado', { status: 404 })
    }
  })
}

// Só em dev (QA e capturas): dados isolados numa pasta descartável, sem tocar nos dados reais do usuário.
if (devUrl() && process.env.DEVDECK_USER_DATA) app.setPath('userData', process.env.DEVDECK_USER_DATA)

// Antes de qualquer leitura de userData: herda dados da época VibeDeck.
migrateLegacyData()
migrateSettings()
app.setAppUserModelId('com.devdeck.app')

/**
 * Tema (H06.1, ADR-020): o main é a fonte única. `themeSource` muda o `prefers-color-scheme` do
 * Chromium (o tokens.css troca sozinho) e o tema dos diálogos nativos. O fundo da janela vem do
 * mapa fixo THEME_BG, nunca do renderer.
 */
function applyTheme(pref: ThemePref): void {
  nativeTheme.themeSource = pref
  win?.setBackgroundColor(themeBg(nativeTheme.shouldUseDarkColors))
}

function openExternalSafe(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

/** Navegação, janelas novas e permissões: nega tudo que não for a UI do app (ou o embed do Spotify). */
function hardenWebContents(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url)
      return { action: 'deny' }
    })
    contents.on('will-attach-webview', (e) => e.preventDefault())
    contents.on('will-navigate', (e, url) => {
      if (!isAppUrl(url, appLocation())) {
        e.preventDefault()
        openExternalSafe(url)
      }
    })
    contents.on('will-redirect', (e) => {
      const ok = e.isMainFrame ? isAppUrl(e.url, appLocation()) : isAllowedSubframeUrl(e.url)
      if (!ok) e.preventDefault()
    })
    contents.on('will-frame-navigate', (e) => {
      const ok = e.isMainFrame ? isAppUrl(e.url, appLocation()) : isAllowedSubframeUrl(e.url)
      if (!ok) e.preventDefault()
    })
  })

  // Em produção a origem de file:// é só 'file://': usa a URL completa do frame que pediu.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl || wc.getURL(), appLocation()))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) =>
    isPermissionAllowed(permission, details.requestingUrl || wc?.getURL() || requestingOrigin, appLocation())
  )
}

function createWindow(): void {
  // DEVDECK_SIZE=1280x720 (só em dev) para capturas de QA em janela estreita.
  const size = devUrl() ? /^(\d{3,4})x(\d{3,4})$/.exec(process.env.DEVDECK_SIZE ?? '') : null
  win = new BrowserWindow({
    width: size ? Number(size[1]) : 1480,
    height: size ? Number(size[2]) : 920,
    minWidth: 1100,
    minHeight: 680,
    // Mesmo tom de --bg do tema efetivo (styles/tokens.css): evita clarão antes do CSS carregar.
    backgroundColor: themeBg(nativeTheme.shouldUseDarkColors),
    title: 'DevDeck',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  setMainWindow(win)
  win.on('closed', () => {
    setMainWindow(null)
    win = null
  })

  win.webContents.on('preload-error', (_e, path, err) => console.error('[preload-error]', path, err))
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer-gone]', d.reason))

  if (devUrl()) {
    // Em dev, espelha o console do renderer no terminal.
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}]`, e.message))
    void win.loadURL(devUrl()! + (process.env.DEVDECK_VIEW ? `#${process.env.DEVDECK_VIEW}` : ''))
  } else {
    void win.loadURL(APP_INDEX)
  }

  // Captura de tela para depuração (DEVDECK_SNAPSHOT=caminho.png) — só fora do app empacotado.
  const snap = process.env.DEVDECK_SNAPSHOT
  if (snap && !app.isPackaged) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await win?.webContents.capturePage()
        if (img) writeFileSync(snap, img.toPNG())
        console.log('[snapshot]', snap)
      }, 3000)
    })
  }

  // Auditoria de acessibilidade (DEVDECK_AXE=resultado.json) — só em dev: injeta o axe-core (devDependency)
  // e grava as violações. Usado pelo QA da Sprint 04 (H04.4).
  const axeOut = process.env.DEVDECK_AXE
  if (axeOut && devUrl()) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const axeSrc = readFileSync(join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
          const result = await win?.webContents.executeJavaScript(
            `${axeSrc}; axe.run(document, { resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 8) })))`
          )
          writeFileSync(axeOut, JSON.stringify(result, null, 2))
          console.log('[axe]', axeOut)
        } catch (err) {
          writeFileSync(axeOut, JSON.stringify({ error: String(err) }))
        }
      }, 2500)
    })
  }
}

function registerIpc(): void {
  setEmitter((e) => win?.webContents.send('agent:event', e))

  // settings
  handle('settings:get', [], () => getSettings())
  handle('settings:update', [v.settingsPatch], (patch) => {
    const before = getSettings()
    const after = updateSettings(patch)
    const runtimeChanged = (['model', 'effort', 'sessionBudgetUsd', 'loadProjectSettings', 'appendSystemPrompt'] as (keyof AppSettings)[]).some(
      (k) => before[k] !== after[k]
    )
    if (runtimeChanged) agent.resetIdleSessions()
    if (before.theme !== after.theme) applyTheme(after.theme)
    return after
  })
  handle('settings:setApiKey', [v.apiKey], (key) => {
    const s = setApiKey(key)
    agent.resetIdleSessions()
    return s
  })

  // workspace
  handle('workspace:pick', [], async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Escolher workspace' })
    if (r.canceled || !r.filePaths[0]) return null
    const abs = openWorkspace(r.filePaths[0])
    updateSettings({ lastWorkspace: abs })
    return abs
  })
  handle('workspace:list', [v.relPath], (rel) => listDir(rel))
  handle('workspace:read', [v.relPath], (rel) => readWorkspaceFile(rel))

  // git
  handle('git:status', [], () => gitStatus())
  handle('git:diff', [v.relPath], (rel) => gitDiff(rel))
  handle('git:restore', [v.relPath], (rel) => gitRestore(rel))
  handle('git:trust', [], () => gitTrust())

  // mcp
  handle('mcp:list', [], () => listMcpServerViews())
  handle('mcp:save', [v.mcpInput, v.mcpName.optional()], (input, previousName) => {
    const all = getMcpServers()
    // Segredos mantidos (null) vêm do servidor guardado, e só se o destino não mudou (lib/secrets).
    const entry = resolveMcpInput(input, all.find((s) => s.name === (previousName ?? input.name)))
    const list = all.filter((s) => s.name !== (previousName ?? entry.name) && s.name !== entry.name)
    const saved = saveMcpServers([...list, entry])
    agent.resetIdleSessions()
    checkAchievements()
    return saved
  })
  handle('mcp:remove', [v.mcpName], (name) => {
    const saved = saveMcpServers(getMcpServers().filter((s) => s.name !== name))
    agent.resetIdleSessions()
    checkAchievements()
    return saved
  })
  handle('mcp:test', [v.mcpInput, v.mcpName.optional()], (input, previousName) =>
    testMcpServer(resolveMcpInput(input, getMcpServers().find((s) => s.name === (previousName ?? input.name))))
  )
  handle('mcp:importClaude', [], () => importFromClaude())

  // agent
  handle('agent:sessions', [], () => agent.listAllSessions())
  handle('agent:create', [v.sessionTitle.optional()], (title) => agent.createSession(title))
  handle('agent:load', [v.uuid], (id) => agent.getSessionState(id))
  handle('agent:rename', [v.uuid, v.sessionTitle], (id, title) => agent.renameSession(id, title))
  handle('agent:remove', [v.uuid], (id) => agent.removeSession(id))
  handle('agent:send', [v.uuid, v.chatText, v.chatContext], (id, text, context) => agent.sendMessage(id, text, context))
  handle('agent:interrupt', [v.uuid], (id) => agent.interrupt(id))
  handle('agent:decide', [v.uuid, v.approvalDecision], (approvalId, decision) => agent.decide(approvalId, decision))
  handle('agent:revertChange', [v.uuid, v.uuid], (sessionId, itemId) => agent.revertChange(sessionId, itemId))

  // custos
  handle('costs:summary', [], () => costSummary())

  // perfil
  handle('profile:get', [], () => getProfileSummary())
  handle('profile:refresh', [], () => refreshProfile())
  handle('profile:update', [v.devProfilePatch], (patch) => updateProfile(patch))
  handle('profile:setToken', [v.providerId, v.providerToken, z.string().max(2000).optional()], (id, token, baseUrl) => setToken(id, token, baseUrl))

  // conquistas
  handle('achievements:get', [], () => achievementsSummary())
  handle('achievements:reportCommunity', [v.communityStats], (s) => {
    saveProfile({ community: s })
    checkAchievements()
  })
  handle('achievements:focusCompleted', [], () => {
    bumpStats({ focusSessions: 1 })
    checkAchievements()
  })

  // agenda
  handle('agenda:occurrences', [v.timestamp, v.timestamp], (from, to) => agenda.listOccurrences(from, to))
  handle('agenda:events', [], () => getAgendaEvents())
  handle('agenda:save', [v.agendaEvent], (ev) => agenda.saveEvent(ev))
  handle('agenda:remove', [v.uuid], (id) => agenda.removeEvent(id))
  handle('agenda:feeds', [], () => listIcsFeedViews())
  handle('agenda:saveFeed', [v.icsFeedInput], (feed) => agenda.saveFeed(feed))
  handle('agenda:removeFeed', [v.uuid], (id) => agenda.removeFeed(id))
  handle('agenda:syncFeeds', [], () => agenda.syncAllFeeds())

  handle('shell:openExternal', [v.externalUrl], (url) => openExternalSafe(url))
  // Ajuda (H06.3): o renderer manda só o tópico; a URL https sai do mapa fixo do main.
  handle('help:open', [v.helpTopic], async (topic) => {
    await shell.openExternal(helpUrl(topic))
  })
}

app.whenReady().then(() => {
  if (!devUrl()) registerAppProtocol()
  // safeStorage só funciona depois do ready: cifra segredos antigos em texto puro (v0.4.0).
  migrateSecrets()
  const last = getSettings().lastWorkspace
  if (last) {
    try {
      openWorkspace(last)
    } catch {
      updateSettings({ lastWorkspace: null })
    }
  }
  // Em produção não há menu: Alt sozinho não abre barra, Ctrl+R não recarrega a UI, Ctrl+Shift+I não abre DevTools
  // (ADR-016). Em dev o menu padrão fica para depuração.
  if (!devUrl()) Menu.setApplicationMenu(null)
  hardenWebContents()
  registerIpc()
  // Antes da janela: o backgroundColor inicial e a primeira pintura já saem no tema salvo.
  applyTheme(getSettings().theme)
  // Windows trocou de tema (com 'system') ou o themeSource mudou: o fundo nativo acompanha.
  nativeTheme.on('updated', () => win?.setBackgroundColor(themeBg(nativeTheme.shouldUseDarkColors)))
  createWindow()
  agenda.startAgendaScheduler()
  checkAchievements()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => agent.shutdownAll())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
