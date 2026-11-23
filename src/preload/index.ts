import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentEvent, DeckApi } from '@shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: DeckApi = {
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
    setApiKey: (key) => invoke('settings:setApiKey', key)
  },
  workspace: {
    pick: () => invoke('workspace:pick'),
    open: (p) => invoke('workspace:open', p),
    list: (rel) => invoke('workspace:list', rel),
    read: (rel) => invoke('workspace:read', rel)
  },
  git: {
    status: () => invoke('git:status'),
    diff: (rel) => invoke('git:diff', rel),
    restore: (rel) => invoke('git:restore', rel)
  },
  mcp: {
    list: () => invoke('mcp:list'),
    save: (entry, previousName) => invoke('mcp:save', entry, previousName),
    remove: (name) => invoke('mcp:remove', name),
    test: (entry) => invoke('mcp:test', entry),
    importClaude: () => invoke('mcp:importClaude')
  },
  agent: {
    sessions: () => invoke('agent:sessions'),
    create: (title) => invoke('agent:create', title),
    load: (id) => invoke('agent:load', id),
    rename: (id, title) => invoke('agent:rename', id, title),
    remove: (id) => invoke('agent:remove', id),
    send: (id, text, context) => invoke('agent:send', id, text, context),
    interrupt: (id) => invoke('agent:interrupt', id),
    decide: (approvalId, decision) => invoke('agent:decide', approvalId, decision),
    revertChange: (sessionId, itemId) => invoke('agent:revertChange', sessionId, itemId),
    onEvent: (cb) => {
      const listener = (_e: IpcRendererEvent, ev: AgentEvent): void => cb(ev)
      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
    }
  },
  costs: {
    summary: () => invoke('costs:summary')
  },
  profile: {
    get: () => invoke('profile:get'),
    refresh: () => invoke('profile:refresh'),
    update: (patch) => invoke('profile:update', patch),
    setToken: (id, token, baseUrl) => invoke('profile:setToken', id, token, baseUrl)
  },
  achievements: {
    get: () => invoke('achievements:get'),
    reportCommunity: (stats) => invoke('achievements:reportCommunity', stats),
    focusCompleted: () => invoke('achievements:focusCompleted')
  },
  agenda: {
    occurrences: (from, to) => invoke('agenda:occurrences', from, to),
    events: () => invoke('agenda:events'),
    save: (ev) => invoke('agenda:save', ev),
    remove: (id) => invoke('agenda:remove', id),
    feeds: () => invoke('agenda:feeds'),
    saveFeed: (feed) => invoke('agenda:saveFeed', feed),
    removeFeed: (id) => invoke('agenda:removeFeed', id),
    syncFeeds: () => invoke('agenda:syncFeeds')
  },
  openExternal: (url) => invoke('shell:openExternal', url)
}

contextBridge.exposeInMainWorld('deck', api)
