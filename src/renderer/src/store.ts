import { create } from 'zustand'
import type { AgentEvent, AppSettings, ApprovalRequest, ChatItem, CostSummary, GitStatus, SessionInfo, SessionMeta } from '@shared/types'
import { DEFAULT_UI, sanitizeUi, type UiPrefs } from '@shared/layout'
import { errorText } from '@shared/lib/errorText'
import { deveNotificarNativo } from '@shared/lib/nativeNotify'
import { VIEWS, type View } from './lib/views'
import {
  AVISO_SESSAO_INEXISTENTE,
  ESTADO_INICIAL,
  avisoErroDoTurno,
  destinoAbrirSessao,
  notificacoesReducer,
  type AcaoFila,
  type AcaoNotificacao,
  type EstadoNotificacoes,
  type NovaNotificacao,
  type RetryOp
} from './lib/notifications'
import { textoConquista } from './lib/notificationText'
import { mensagemParaRepetir } from './lib/agentErrorCard'

export type { View }

/** Campo que uma view deve focar ao abrir (ex.: "Usar chave da API" no card de erro do chat). */
export type AlvoFoco = 'chaveApi'

/** Estado da janela para a regra da notificação nativa (aprovação passa a olhar o foco, não só `hidden`). */
const janela = (): { focada: boolean; visivel: boolean } => ({ focada: document.hasFocus(), visivel: !document.hidden })

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
  /** Fila de notificações (reducer puro em lib/notifications; renderizada por components/Notifications). */
  notificacoes: EstadoNotificacoes
  /** Campo a focar na próxima abertura da view (a view consome e limpa). */
  focoAlvo: AlvoFoco | null
  /** Item a mostrar quando o chat da sessão abrir ("Ver no chat" de outra sessão, H07.4); o ChatView consome e limpa. */
  rolarPara: { sessionId: string; itemId: string | null } | null
  /** Incrementa quando agenda/conquistas mudam, para as views recarregarem. */
  agendaVersion: number
  achievementsVersion: number
  /** Paleta de comandos (Ctrl+K) e ajuda de atalhos (Ctrl+/). */
  paletteOpen: boolean
  helpOpen: boolean
  /** Painel direito aberto como sobreposição em janela estreita (não persiste). */
  overlayOpen: boolean
  /** Layout atual (espelha settings.ui; gravado com debounce). */
  ui: UiPrefs
  /** Último status do git do workspace (null = ainda não lido ou erro). */
  git: GitStatus | null

  init(): Promise<void>
  setView(v: View): void
  setSettings(s: AppSettings): void
  setUi(patch: Partial<UiPrefs>): void
  setPalette(open: boolean): void
  setHelp(open: boolean): void
  setOverlay(open: boolean): void
  pickWorkspace(): Promise<void>
  refreshSessions(): Promise<void>
  /** Carrega e ativa a sessão. `vale` (opcional) é conferido depois do load: false descarta o resultado (corrida). */
  openSession(id: string, focus?: boolean, vale?: () => boolean): Promise<void>
  newSession(): Promise<void>
  removeSession(id: string): Promise<void>
  send(text: string): Promise<void>
  toggleContextFile(path: string): void
  clearContext(): void
  preview(path: string | null): void
  refreshCosts(): Promise<void>
  refreshGit(): Promise<void>
  /** "Revisar configurações…": diálogo nativo no main; recarrega o status se liberar. */
  reviewGitTrust(): Promise<void>
  /** Mostra uma notificação (tipo, texto e no máximo uma ação de lista fechada). */
  notify(n: NovaNotificacao): void
  /** Aplica uma ação à fila de notificações (fechar, expirar, pausar…). */
  despacharNotificacao(a: AcaoFila): void
  /** Executa a ação do botão de uma notificação: navegar troca de aba; repetir chama `repetir`; abrirSessao, `abrirSessaoDoAviso`. */
  executarAcaoNotificacao(acao: AcaoNotificacao): void
  /** Abre a sessão de um aviso e rola até o item (H07.4). Id inválido ou sessão inexistente: aviso, sem navegar. */
  abrirSessaoDoAviso(acao: Extract<AcaoNotificacao, { tipo: 'abrirSessao' }>): Promise<void>
  limparRolarPara(): void
  /** Ação "repetir" de uma notificação: só leitura ou recarga (lista fechada em lib/notifications). */
  repetir(op: RetryOp): void
  /** Abre Configurações com foco no campo da chave da API. */
  abrirChaveApi(): void
  limparFocoAlvo(): void
  /**
   * "Tentar de novo" do card de erro: reenvia a mensagem do usuário que originou o turno do erro.
   * Só por clique; não faz nada com turno em andamento ou em card de turno antigo.
   */
  repetirMensagem(sessionId: string, erroId: string): Promise<void>
  handleEvent(e: AgentEvent): void
}

const api = (): Window['deck'] => window.deck

let uiTimer: ReturnType<typeof setTimeout> | undefined
let gitSeq = 0
/** Itens de erro já avisados fora do chat (o fim do turno pode chegar duas vezes: result e finally). */
const errosAvisados = new Set<string>()
/** Sequência dos "Ver no chat" de outra sessão: só o último clique rola a lista. */
let abrirSeq = 0

const textoDe = (err: unknown): NovaNotificacao => ({ tipo: 'erro', texto: errorText(err) })

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
  notificacoes: ESTADO_INICIAL,
  focoAlvo: null,
  rolarPara: null,
  agendaVersion: 0,
  achievementsVersion: 0,
  paletteOpen: hashFlag('palette'),
  helpOpen: hashFlag('help'),
  overlayOpen: false,
  ui: DEFAULT_UI,
  git: null,

  async init() {
    const settings = await api().settings.get()
    const ui = sanitizeUi(settings.ui)
    set({ settings, workspace: settings.lastWorkspace, ui: hashFlag('collapsed') ? { ...ui, rightPanelOpen: false } : ui })
    await get().refreshSessions()
    await get().refreshCosts()
    const first = get().sessions.find((s) => s.cwd === settings.lastWorkspace)
    if (first) await get().openSession(first.id, false)
  },

  async refreshGit() {
    const ws = get().workspace
    if (!ws) return set({ git: null })
    // Só a resposta do pedido mais recente entra (status fora de ordem não sobrescreve um mais novo).
    const seq = ++gitSeq
    try {
      const git = await api().git.status()
      if (seq === gitSeq && get().workspace === ws) set({ git })
    } catch (err) {
      if (seq === gitSeq && get().workspace === ws) set({ git: null })
      get().notify({ ...textoDe(err), acao: { tipo: 'repetir', op: 'recarregarGit' } })
    }
  },

  async reviewGitTrust() {
    try {
      if (await api().git.trust()) await get().refreshGit()
    } catch (err) {
      // Confiança não entra em RetryOp: sem ação.
      get().notify(textoDe(err))
    }
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
    set({ workspace: ws, previewPath: null, contextFiles: [], git: null, treeVersion: get().treeVersion + 1 })
    await get().refreshSessions()
    const first = get().sessions.find((s) => s.cwd === ws)
    set({ activeId: null })
    if (first) await get().openSession(first.id, false)
  },

  async refreshSessions() {
    const sessions = await api().agent.sessions()
    set({ sessions })
  },

  async openSession(id, focus = true, vale) {
    const st = await api().agent.load(id)
    if (vale && !vale()) return
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
      get().notify(textoDe(err))
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
      // Só o rethrow do diálogo de confiança: o erro do turno vira card no chat, não toast.
      get().notify(textoDe(err))
    }
    // O primeiro envio pode ter passado pelo diálogo de confiança (git liberado ou pausado).
    void get().refreshGit()
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

  notify(notificacao) {
    // `now` lido fora do updater: o updater fica puro (StrictMode pode chamá-lo duas vezes).
    get().despacharNotificacao({ type: 'adicionar', notificacao, now: Date.now() })
  },

  despacharNotificacao(a) {
    set((s) => ({ notificacoes: notificacoesReducer(s.notificacoes, a) }))
  },

  executarAcaoNotificacao(acao) {
    if (acao.tipo === 'navegar') get().setView(acao.destino)
    else if (acao.tipo === 'repetir') get().repetir(acao.op)
    else void get().abrirSessaoDoAviso(acao)
  },

  async abrirSessaoDoAviso(acao) {
    const seq = ++abrirSeq
    let destino = destinoAbrirSessao(acao, get().sessions)
    if (!destino.ok && destino.aviso === AVISO_SESSAO_INEXISTENTE) {
      // A lista pode estar atrasada: consulta o main antes de recusar (TL, D7).
      await get()
        .refreshSessions()
        .catch(() => undefined)
      destino = destinoAbrirSessao(acao, get().sessions)
    }
    if (!destino.ok) {
      get().notify({ tipo: 'aviso', texto: destino.aviso })
      return
    }
    // Outro clique chegou enquanto esta sessão carregava: vale o último, na navegação e no scroll (TL).
    const atual = (): boolean => seq === abrirSeq
    try {
      await get().openSession(destino.sessionId, true, atual)
    } catch (err) {
      get().notify(textoDe(err))
      return
    }
    if (!atual()) return
    set({ rolarPara: { sessionId: destino.sessionId, itemId: destino.itemId } })
  },

  limparRolarPara() {
    set({ rolarPara: null })
  },

  abrirChaveApi() {
    get().setView('settings')
    set({ focoAlvo: 'chaveApi' })
  },

  limparFocoAlvo() {
    set({ focoAlvo: null })
  },

  async repetirMensagem(sessionId, erroId) {
    if (get().busy[sessionId]) return
    const msg = mensagemParaRepetir(get().items[sessionId] ?? [], erroId)
    if (!msg) return
    try {
      // Reenvia com o contexto da mensagem original; os chips atuais do composer ficam como estão.
      await api().agent.send(sessionId, msg.text, msg.context ?? [])
    } catch (err) {
      get().notify(textoDe(err))
    }
  },

  repetir(op) {
    // Sem ação na falha do próprio repetir, para não virar laço.
    const falhou = (err: unknown): void => get().notify(textoDe(err))
    switch (op) {
      case 'recarregarGit':
        void get().refreshGit()
        break
      case 'recarregarSessoes':
        get().refreshSessions().catch(falhou)
        break
      case 'recarregarCustos':
        get().refreshCosts().catch(falhou)
        break
      case 'recarregarAgenda':
        set((s) => ({ agendaVersion: s.agendaVersion + 1 }))
        break
      case 'recarregarPerfil':
        // Só relê as conquistas. `profile.refresh()` existe, mas grava o cache dos provedores e roda
        // checkAchievements no main (não é só leitura): por isso nenhum erro do perfil oferece "Tentar de novo".
        set((s) => ({ achievementsVersion: s.achievementsVersion + 1 }))
        break
      default: {
        const nunca: never = op
        return nunca
      }
    }
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
        // Fim do turno: a classificação do erro já é a final (o result pode reclassificar, ex.: 529).
        if (!e.busy) avisarErroDoTurno(e.sessionId)
        break
      case 'info':
        set((s) => ({ info: { ...s.info, [e.sessionId]: e.info } }))
        break
      case 'context':
        set((s) => ({ context: { ...s.context, [e.sessionId]: { used: e.used, window: e.window } } }))
        break
      case 'approval':
        set((s) => ({ approvals: [...s.approvals, e.approval] }))
        // Nativa só sem foco (ou minimizada); em foco, o card no painel direito basta.
        if (deveNotificarNativo(janela(), 'aprovacao')) new Notification('DevDeck', { body: `Aprovação pendente: ${e.approval.title}` })
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
        get().notify({
          tipo: 'conquista',
          texto: textoConquista(e.def.title, e.def.xp),
          conquista: { titulo: e.def.title, xp: e.def.xp },
          acao: { tipo: 'navegar', destino: 'profile' }
        })
        set((s) => ({ achievementsVersion: s.achievementsVersion + 1 }))
        break
      case 'agenda-reminder':
        // O main só manda este evento com a janela em foco (sem foco, vai a nativa). Título só como texto.
        get().notify({ tipo: 'info', texto: `Lembrete da agenda: ${e.titulo}`, acao: { tipo: 'navegar', destino: 'agenda' } })
        break
      case 'agenda-changed':
        set((s) => ({ agendaVersion: s.agendaVersion + 1 }))
        break
    }
  }
}))

/** Erro do turno fora da vista (T21): a regra é `avisoErroDoTurno` (lib/notifications.ts, com teste). */
function avisarErroDoTurno(sessionId: string): void {
  const st = useStore.getState()
  const r = avisoErroDoTurno({
    sessionId,
    activeId: st.activeId,
    view: st.view,
    items: st.items[sessionId] ?? [],
    tituloSessao: st.sessions.find((s) => s.id === sessionId)?.title,
    avisados: errosAvisados
  })
  if (!r) return
  errosAvisados.add(r.erroId)
  if (r.aviso) st.notify(r.aviso)
}
