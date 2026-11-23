// Mapa único de atalhos (H04.6, ADR-016). A mesma tabela alimenta o handler global, a paleta e a ajuda (Ctrl+/).
// Puro: recebe um "evento" simplificado e o contexto, devolve a ação. Nenhum atalho global aprova nada.

export type ShortcutAction =
  | 'palette'
  | 'help'
  | 'newChat'
  | 'focusComposer'
  | 'toggleSidebar'
  | 'toggleRightPanel'
  | 'view:chat'
  | 'view:changes'
  | 'view:mcp'
  | 'view:profile'
  | 'view:agenda'
  | 'view:community'
  | 'view:costs'
  | 'view:settings'

export interface Shortcut {
  action: ShortcutAction
  /** Tecla comparada por `KeyboardEvent.key` (layout-aware), em minúsculas. */
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  /** Rótulo exibido (ex.: "Ctrl+K"). */
  keys: string
  label: string
  /** Funciona com foco em campo editável (input/textarea/contenteditable). */
  inEditable?: boolean
}

const VIEW_ORDER: { action: ShortcutAction; label: string }[] = [
  { action: 'view:chat', label: 'Ir para Chat' },
  { action: 'view:changes', label: 'Ir para Alterações' },
  { action: 'view:mcp', label: 'Ir para MCP' },
  { action: 'view:profile', label: 'Ir para Perfil' },
  { action: 'view:agenda', label: 'Ir para Agenda' },
  { action: 'view:community', label: 'Ir para Comunidade' },
  { action: 'view:costs', label: 'Ir para Custos' },
  { action: 'view:settings', label: 'Ir para Configurações' }
]

export const SHORTCUTS: Shortcut[] = [
  { action: 'palette', key: 'k', ctrl: true, keys: 'Ctrl+K', label: 'Paleta de comandos', inEditable: true },
  { action: 'help', key: '/', ctrl: true, keys: 'Ctrl+/', label: 'Atalhos de teclado', inEditable: true },
  { action: 'help', key: 'f1', keys: 'F1', label: 'Atalhos de teclado', inEditable: true },
  { action: 'newChat', key: 'n', ctrl: true, keys: 'Ctrl+N', label: 'Novo chat' },
  { action: 'focusComposer', key: 'l', ctrl: true, keys: 'Ctrl+L', label: 'Escrever mensagem' },
  { action: 'toggleSidebar', key: 'b', ctrl: true, keys: 'Ctrl+B', label: 'Mostrar/ocultar barra lateral' },
  { action: 'toggleRightPanel', key: 'b', ctrl: true, alt: true, keys: 'Ctrl+Alt+B', label: 'Mostrar/ocultar painel direito' },
  ...VIEW_ORDER.map((v, i) => ({ action: v.action, key: String(i + 1), ctrl: true, keys: `Ctrl+${i + 1}`, label: v.label }))
]

/** Primeiro atalho de uma ação, para dicas ("Chat · Ctrl+1"). */
export function keysFor(action: ShortcutAction): string | undefined {
  return SHORTCUTS.find((s) => s.action === action)?.keys
}

/** Lista para a ajuda: uma linha por ação, juntando teclas alternativas. */
export function shortcutHelp(): { label: string; keys: string[] }[] {
  const out = new Map<ShortcutAction, { label: string; keys: string[] }>()
  for (const s of SHORTCUTS) {
    const row = out.get(s.action)
    if (row) row.keys.push(s.keys)
    else out.set(s.action, { label: s.label, keys: [s.keys] })
  }
  return [...out.values()]
}

export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey?: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  /** `getModifierState('AltGraph')`: no ABNT2, AltGr chega como Ctrl+Alt e não é atalho. */
  altGraph?: boolean
  repeat?: boolean
}

export interface ShortcutContext {
  /** Foco em input, textarea, select ou contenteditable. */
  editable: boolean
  /** Algum modal aberto: só a ajuda e a paleta (que fecham/alternam) passam. */
  modalOpen?: boolean
}

export function matchShortcut(e: KeyLike, ctx: ShortcutContext): ShortcutAction | null {
  if (e.isComposing || e.altGraph) return null
  const ctrl = e.ctrlKey || Boolean(e.metaKey)
  const key = e.key.toLowerCase()
  for (const s of SHORTCUTS) {
    if (s.key !== key) continue
    if (Boolean(s.ctrl) !== ctrl || Boolean(s.alt) !== e.altKey || Boolean(s.shift) !== e.shiftKey) continue
    if (ctx.editable && !s.inEditable) return null
    if (ctx.modalOpen && s.action !== 'palette' && s.action !== 'help') return null
    return s.action
  }
  return null
}

export function isEditableTarget(el: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  // Checkbox, rádio e botões não editam texto: atalhos continuam valendo.
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes((el.type ?? 'text').toLowerCase())
}

// ---------- Aprovação por teclado (Cybersecurity B4) ----------

/** Tempo em que o card recém-aparecido (ou alterado) ignora teclas: evita aprovar o que não se viu. */
export const APPROVAL_GUARD_MS = 600

/**
 * Alt+A / Alt+R só valem com o foco dentro do card, sem repetição de tecla e depois da janela de guarda.
 * Alt+A nunca liga "sempre nesta sessão".
 */
export function matchApprovalKey(e: KeyLike, shownAt: number, now: number): 'approve' | 'reject' | null {
  if (e.repeat || e.isComposing || e.altGraph) return null
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null
  if (now - shownAt < APPROVAL_GUARD_MS) return null
  const key = e.key.toLowerCase()
  if (key === 'a') return 'approve'
  if (key === 'r') return 'reject'
  return null
}
