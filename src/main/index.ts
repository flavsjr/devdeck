import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import type { AppSettings } from '@shared/types'
import {
  bumpStats,
  getAgendaEvents,
  getIcsFeeds,
  getMcpServers,
  getSettings,
  migrateLegacyData,
  migrateSettings,
  saveMcpServers,
  saveProfile,
  setApiKey,
  updateSettings
} from './store'
import { listDir, openWorkspace, readWorkspaceFile } from './workspace'
import { gitDiff, gitRestore, gitStatus } from './git'
import { importFromClaude, testMcpServer } from './mcp'
import { costSummary } from './costs'
import { setEmitter } from './events'
import { achievementsSummary, checkAchievements } from './achievements'
import { getProfileSummary, refreshProfile, setToken, updateProfile } from './profile'
import { handle } from './ipc'
import { isAllowedSubframeUrl, isAppUrl, isPermissionAllowed } from './lib/origin'
import { appLocation } from './appLocation'
import * as v from './lib/validation'
import * as agenda from './agenda'
import * as agent from './agent'

let win: BrowserWindow | null = null
const devUrl = (): string | undefined => appLocation().devUrl

// Antes de qualquer leitura de userData: herda dados da época VibeDeck.
migrateLegacyData()
migrateSettings()
app.setAppUserModelId('com.devdeck.app')

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
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0e1014',
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

  win.webContents.on('preload-error', (_e, path, err) => console.error('[preload-error]', path, err))
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer-gone]', d.reason))

  if (devUrl()) {
    // Em dev, espelha o console do renderer no terminal.
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}]`, e.message))
    void win.loadURL(devUrl()! + (process.env.DEVDECK_VIEW ? `#${process.env.DEVDECK_VIEW}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
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

  // mcp
  handle('mcp:list', [], () => getMcpServers())
  handle('mcp:save', [v.mcpEntry, v.mcpName.optional()], (entry, previousName) => {
    const list = getMcpServers().filter((s) => s.name !== (previousName ?? entry.name) && s.name !== entry.name)
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
  handle('mcp:test', [v.mcpEntry], (entry) => testMcpServer(entry))
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
  handle('agenda:feeds', [], () => getIcsFeeds())
  handle('agenda:saveFeed', [v.icsFeed], (feed) => agenda.saveFeed(feed))
  handle('agenda:removeFeed', [v.uuid], (id) => agenda.removeFeed(id))
  handle('agenda:syncFeeds', [], () => agenda.syncAllFeeds())

  handle('shell:openExternal', [v.externalUrl], (url) => openExternalSafe(url))
}

app.whenReady().then(() => {
  const last = getSettings().lastWorkspace
  if (last) {
    try {
      openWorkspace(last)
    } catch {
      updateSettings({ lastWorkspace: null })
    }
  }
  hardenWebContents()
  registerIpc()
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
