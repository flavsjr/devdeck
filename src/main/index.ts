import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { AgendaEvent, AppSettings, ApprovalDecision, CommunityStats, DevProfile, IcsFeed, McpServerEntry, ProviderId } from '@shared/types'
import {
  bumpStats,
  getAgendaEvents,
  getIcsFeeds,
  getMcpServers,
  getSettings,
  migrateLegacyData,
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
import * as agenda from './agenda'
import * as agent from './agent'

let win: BrowserWindow | null = null

// Antes de qualquer leitura de userData: herda dados da época VibeDeck.
migrateLegacyData()
app.setAppUserModelId('com.devdeck.app')

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
      sandbox: true
    }
  })

  // Links externos abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('preload-error', (_e, path, err) => console.error('[preload-error]', path, err))
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer-gone]', d.reason))

  if (process.env.ELECTRON_RENDERER_URL) {
    // Em dev, espelha o console do renderer no terminal.
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}]`, e.message))
    void win.loadURL(process.env.ELECTRON_RENDERER_URL + (process.env.DEVDECK_VIEW ? `#${process.env.DEVDECK_VIEW}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Captura de tela opcional para depuração: DEVDECK_SNAPSHOT=caminho.png
  const snap = process.env.DEVDECK_SNAPSHOT
  if (snap) {
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
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => {
    const before = getSettings()
    const after = updateSettings(patch)
    const runtimeChanged = ['model', 'effort', 'sessionBudgetUsd', 'loadProjectSettings', 'appendSystemPrompt'].some(
      (k) => before[k as keyof AppSettings] !== after[k as keyof AppSettings]
    )
    if (runtimeChanged) agent.resetIdleSessions()
    return after
  })
  ipcMain.handle('settings:setApiKey', (_e, key: string | null) => {
    const s = setApiKey(key)
    agent.resetIdleSessions()
    return s
  })

  // workspace
  ipcMain.handle('workspace:pick', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'], title: 'Escolher workspace' })
    if (r.canceled || !r.filePaths[0]) return null
    const abs = openWorkspace(r.filePaths[0])
    updateSettings({ lastWorkspace: abs })
    return abs
  })
  ipcMain.handle('workspace:open', (_e, p: string) => {
    const abs = openWorkspace(p)
    updateSettings({ lastWorkspace: abs })
    return abs
  })
  ipcMain.handle('workspace:list', (_e, rel: string) => listDir(rel))
  ipcMain.handle('workspace:read', (_e, rel: string) => readWorkspaceFile(rel))

  // git
  ipcMain.handle('git:status', () => gitStatus())
  ipcMain.handle('git:diff', (_e, rel: string) => gitDiff(rel))
  ipcMain.handle('git:restore', (_e, rel: string) => gitRestore(rel))

  // mcp
  ipcMain.handle('mcp:list', () => getMcpServers())
  ipcMain.handle('mcp:save', (_e, entry: McpServerEntry, previousName?: string) => {
    const list = getMcpServers().filter((s) => s.name !== (previousName ?? entry.name) && s.name !== entry.name)
    const saved = saveMcpServers([...list, entry])
    agent.resetIdleSessions()
    checkAchievements()
    return saved
  })
  ipcMain.handle('mcp:remove', (_e, name: string) => {
    const saved = saveMcpServers(getMcpServers().filter((s) => s.name !== name))
    agent.resetIdleSessions()
    checkAchievements()
    return saved
  })
  ipcMain.handle('mcp:test', (_e, entry: McpServerEntry) => testMcpServer(entry))
  ipcMain.handle('mcp:importClaude', () => importFromClaude())

  // agent
  ipcMain.handle('agent:sessions', () => agent.listAllSessions())
  ipcMain.handle('agent:create', (_e, title?: string) => agent.createSession(title))
  ipcMain.handle('agent:load', (_e, id: string) => agent.getSessionState(id))
  ipcMain.handle('agent:rename', (_e, id: string, title: string) => agent.renameSession(id, title))
  ipcMain.handle('agent:remove', (_e, id: string) => agent.removeSession(id))
  ipcMain.handle('agent:send', (_e, id: string, text: string, context: string[]) => agent.sendMessage(id, text, context))
  ipcMain.handle('agent:interrupt', (_e, id: string) => agent.interrupt(id))
  ipcMain.handle('agent:decide', (_e, approvalId: string, decision: ApprovalDecision) => agent.decide(approvalId, decision))
  ipcMain.handle('agent:revertChange', (_e, sessionId: string, itemId: string) => agent.revertChange(sessionId, itemId))

  // custos
  ipcMain.handle('costs:summary', () => costSummary())

  // perfil
  ipcMain.handle('profile:get', () => getProfileSummary())
  ipcMain.handle('profile:refresh', () => refreshProfile())
  ipcMain.handle('profile:update', (_e, patch: Partial<DevProfile>) => updateProfile(patch))
  ipcMain.handle('profile:setToken', (_e, id: ProviderId, token: string | null, baseUrl?: string) => {
    if (!['github', 'gitlab', 'bitbucket'].includes(id)) throw new Error('Provedor inválido.')
    return setToken(id, token, baseUrl)
  })

  // conquistas
  ipcMain.handle('achievements:get', () => achievementsSummary())
  ipcMain.handle('achievements:reportCommunity', (_e, s: CommunityStats) => {
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
    saveProfile({ community: { articles: n(s?.articles), snippets: n(s?.snippets), likesReceived: n(s?.likesReceived) } })
    checkAchievements()
  })
  ipcMain.handle('achievements:focusCompleted', () => {
    bumpStats({ focusSessions: 1 })
    checkAchievements()
  })

  // agenda
  ipcMain.handle('agenda:occurrences', (_e, from: number, to: number) => agenda.listOccurrences(from, to))
  ipcMain.handle('agenda:events', () => getAgendaEvents())
  ipcMain.handle('agenda:save', (_e, ev: AgendaEvent) => agenda.saveEvent(ev))
  ipcMain.handle('agenda:remove', (_e, id: string) => agenda.removeEvent(id))
  ipcMain.handle('agenda:feeds', () => getIcsFeeds())
  ipcMain.handle('agenda:saveFeed', (_e, feed: IcsFeed) => agenda.saveFeed(feed))
  ipcMain.handle('agenda:removeFeed', (_e, id: string) => agenda.removeFeed(id))
  ipcMain.handle('agenda:syncFeeds', () => agenda.syncAllFeeds())

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })
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
