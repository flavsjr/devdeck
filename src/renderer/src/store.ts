import { create } from 'zustand'
import type { AgentEvent, AppSettings, ApprovalRequest, ChatItem, CostSummary, Occurrence, SessionInfo, SessionMeta } from '@shared/types'
import { DEFAULT_UI, sanitizeUi, type UiPrefs } from '@shared/layout'

export type View = 'chat' | 'changes' | 'mcp' | 'profile' | 'agenda' | 'community' | 'costs' | 'settings'

interface State {
  settings: AppSettings | null
  workspace: string | null
  sessions: SessionMeta[]
  activeId: string | null
  items: Record<string, ChatItem[]>
  streaming: Record<string, string>
  busy: Record<string, boolean>
  info: Record<string, SessionInfo>
  context: Record<string, { used: number; window: number }>
  approvals: ApprovalRequest[]
  contextFiles: string[]
  view: View
  previewPath: string | null
  costs: CostSummary | null
  treeVersion: number
  toast: string | null
  /** Incrementa quando agenda/conquistas mudam, para as views recarregarem. */
  agendaVersion: number
  achievementsVersion: number
  reminder: { occurrence: Occurrence; minutesLeft: number } | null
  /** Paleta de comandos (Ctrl+K) e ajuda de atalhos (Ctrl+/). */
  paletteOpen: boolean
  helpOpen: boolean
  /** Painel direito aberto como sobreposição em janela estreita (não persiste). */
  overlayOpen: boolean
  /** Layout atual (espelha settings.ui; gravado com debounce). */
  ui: UiPrefs

  init(): Promise<void>
  setView(v: View): void
  setSettings(s: AppSettings): void
  setUi(patch: Partial<UiPrefs>): void
  setPalette(open: boolean): void
  setHelp(open: boolean): void
  setOverlay(open: boolean): void
  pickWorkspace(): Promise<void>
  refreshSessions(): Promise<void>
  openSession(id: string, focus?: boolean): Promise<void>
  newSession(): Promise<void>
  removeSession(id: string): Promise<void>
  send(text: string): Promise<void>
  toggleContextFile(path: string): void
  clearContext(): void
  preview(path: string | null): void
  refreshCosts(): Promise<void>
  notify(msg: string): void
  handleEvent(e: AgentEvent): void
}

const api = (): Window['deck'] => window.deck

let uiTimer: ReturnType<typeof setTimeout> | undefined

const VIEWS: View[] = ['chat', 'changes', 'mcp', 'profile', 'agenda', 'community', 'costs', 'settings']

/** Permite abrir direto numa aba via #view (útil para depuração e capturas). */
function initialView(): View {
  const h = location.hash.slice(1).split(':')[0] as View
  return VIEWS.includes(h) ? h : 'chat'
}

/** Só para capturas de QA (#chat:palette, #chat:help): abre a paleta ou a ajuda ao carregar. */
const hashFlag = (flag: string): boolean => location.hash.split(':').slice(1).includes(flag)

export const useStore = create<State>((set, get) => ({
  settings: null,
  workspace: null,
  sessions: [],
  activeId: null,
  items: {},
  streaming: {},
  busy: {},
  info: {},
  context: {},
  approvals: [],
  contextFiles: [],
  view: initialView(),
  previewPath: null,
  costs: null,
  treeVersion: 0,
  toast: null,
  agendaVersion: 0,
  achievementsVersion: 0,
  reminder: null,
  paletteOpen: hashFlag('palette'),
  helpOpen: hashFlag('help'),
  overlayOpen: false,
  ui: DEFAULT_UI,

  async init() {
    const settings = await api().settings.get()
    const ui = sanitizeUi(settings.ui)
    set({ settings, workspace: settings.lastWorkspace, ui: hashFlag('collapsed') ? { ...ui, rightPanelOpen: false } : ui })
    await get().refreshSessions()
    await get().refreshCosts()
    const first = get().sessions.find((s) => s.cwd === settings.lastWorkspace)
    if (first) await get().openSession(first.id, false)
  },

  setView(view) {
    set({ view })
    if (view === 'costs') void get().refreshCosts()
  },

  setSettings(settings) {
    set({ settings })
  },

  setUi(patch) {
    const ui = sanitizeUi({ ...get().ui, ...patch })
    set({ ui })
    // Arrastar o divisor gera muitos eventos: grava só quando parar.
    clearTimeout(uiTimer)
    uiTimer = setTimeout(() => {
      api()
        .settings.update({ ui })
        .then((settings) => set({ settings }))
        .catch(() => undefined)
    }, 400)
  },

  setPalette(paletteOpen) {
    set({ paletteOpen, ...(paletteOpen ? { helpOpen: false } : {}) })
  },

  setOverlay(overlayOpen) {
    set({ overlayOpen })
  },

  setHelp(helpOpen) {
    set({ helpOpen, ...(helpOpen ? { paletteOpen: false } : {}) })
  },

  async pickWorkspace() {
    const ws = await api().workspace.pick()
    if (!ws) return
    set({ workspace: ws, previewPath: null, contextFiles: [], treeVersion: get().treeVersion + 1 })
    await get().refreshSessions()
    const first = get().sessions.find((s) => s.cwd === ws)
    set({ activeId: null })
    if (first) await get().openSession(first.id, false)
  },

  async refreshSessions() {
    const sessions = await api().agent.sessions()
    set({ sessions })
  },

  async openSession(id, focus = true) {
    const st = await api().agent.load(id)
    set((s) => ({
      activeId: id,
      ...(focus ? { view: 'chat' as View } : {}),
      items: { ...s.items, [id]: st.items },
      busy: { ...s.busy, [id]: st.busy },
      approvals: [...s.approvals.filter((a) => a.sessionId !== id), ...st.approvals]
    }))
  },

  async newSession() {
    try {
      const meta = await api().agent.create()
      set((s) => ({ sessions: [meta, ...s.sessions] }))
      await get().openSession(meta.id)
    } catch (err) {
      get().notify(err instanceof Error ? err.message : String(err))
    }
  },

  async removeSession(id) {
    await api().agent.remove(id)
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      approvals: s.approvals.filter((a) => a.sessionId !== id)
    }))
  },

  async send(text) {
    let id = get().activeId
    if (!id) {
      await get().newSession()
      id = get().activeId
    }
    if (!id) return
    const ctx = get().contextFiles
    set({ contextFiles: [] })
    try {
      await api().agent.send(id, text, ctx)
    } catch (err) {
      get().notify(err instanceof Error ? err.message : String(err))
    }
  },

  toggleContextFile(path) {
    set((s) => ({
      contextFiles: s.contextFiles.includes(path) ? s.contextFiles.filter((p) => p !== path) : [...s.contextFiles, path]
    }))
  },

  clearContext() {
    set({ contextFiles: [] })
  },

  preview(previewPath) {
    set({ previewPath })
  },

  async refreshCosts() {
    set({ costs: await api().costs.summary() })
  },

  notify(msg) {
    set({ toast: msg })
    setTimeout(() => {
      if (get().toast === msg) set({ toast: null })
    }, 5000)
  },

  handleEvent(e) {
    switch (e.type) {
      case 'item':
        set((s) => {
          const list = s.items[e.sessionId] ?? []
          if (list.some((i) => i.id === e.item.id)) return {}
          const streaming = e.item.kind === 'assistant' ? { ...s.streaming, [e.sessionId]: '' } : s.streaming
          return { items: { ...s.items, [e.sessionId]: [...list, e.item] }, streaming }
        })
        break
      case 'item-update':
        set((s) => ({
          items: {
            ...s.items,
            [e.sessionId]: (s.items[e.sessionId] ?? []).map((i) => (i.id === e.item.id ? e.item : i))
          }
        }))
        break
      case 'delta':
        set((s) => ({ streaming: { ...s.streaming, [e.sessionId]: (s.streaming[e.sessionId] ?? '') + e.text } }))
        break
      case 'busy':
        set((s) => ({
          busy: { ...s.busy, [e.sessionId]: e.busy },
          streaming: e.busy ? s.streaming : { ...s.streaming, [e.sessionId]: '' }
        }))
        break
      case 'info':
        set((s) => ({ info: { ...s.info, [e.sessionId]: e.info } }))
        break
      case 'context':
        set((s) => ({ context: { ...s.context, [e.sessionId]: { used: e.used, window: e.window } } }))
        break
      case 'approval':
        set((s) => ({ approvals: [...s.approvals, e.approval] }))
        if (document.hidden) new Notification('DevDeck', { body: `Aprovação pendente: ${e.approval.title}` })
        break
      case 'approval-resolved':
        set((s) => ({ approvals: s.approvals.filter((a) => a.id !== e.id) }))
        break
      case 'session-meta':
        set((s) => ({
          sessions: s.sessions.some((x) => x.id === e.meta.id)
            ? s.sessions.map((x) => (x.id === e.meta.id ? e.meta : x))
            : [e.meta, ...s.sessions]
        }))
        break
      case 'costs-changed':
        void get().refreshCosts()
        set((s) => ({ treeVersion: s.treeVersion + 1 }))
        break
      case 'achievement':
        get().notify(`Conquista desbloqueada: ${e.def.icon} ${e.def.title} (+${e.def.xp} XP)`)
        set((s) => ({ achievementsVersion: s.achievementsVersion + 1 }))
        break
      case 'reminder':
        set({ reminder: { occurrence: e.occurrence, minutesLeft: e.minutesLeft } })
        break
      case 'agenda-changed':
        set((s) => ({ agendaVersion: s.agendaVersion + 1 }))
        break
    }
  }
}))
