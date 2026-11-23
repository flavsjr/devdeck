// Preferências de layout (Sprint 04, H04.5). Puro: usado pelo main (clamp ao gravar) e pelo renderer (arrastar).

export interface UiPrefs {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  /** Largura do painel direito em px, sempre entre RIGHT_PANEL_MIN e RIGHT_PANEL_MAX. */
  rightPanelWidth: number
}

export const RIGHT_PANEL_MIN = 320
export const RIGHT_PANEL_MAX = 640
export const RIGHT_PANEL_DEFAULT = 360
/** Abaixo desta largura de janela o painel direito vira sobreposição. */
export const NARROW_WINDOW = 1280

export const DEFAULT_UI: UiPrefs = { sidebarOpen: true, rightPanelOpen: true, rightPanelWidth: RIGHT_PANEL_DEFAULT }

export function clampPanelWidth(px: number): number {
  if (!Number.isFinite(px)) return RIGHT_PANEL_DEFAULT
  return Math.round(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, px)))
}

/** Normaliza o que veio do disco (pode faltar campo ou ter valor velho/fora da faixa). */
export function sanitizeUi(raw: Partial<UiPrefs> | undefined): UiPrefs {
  return {
    sidebarOpen: typeof raw?.sidebarOpen === 'boolean' ? raw.sidebarOpen : DEFAULT_UI.sidebarOpen,
    rightPanelOpen: typeof raw?.rightPanelOpen === 'boolean' ? raw.rightPanelOpen : DEFAULT_UI.rightPanelOpen,
    rightPanelWidth: clampPanelWidth(typeof raw?.rightPanelWidth === 'number' ? raw.rightPanelWidth : RIGHT_PANEL_DEFAULT)
  }
}

/**
 * Painel direito efetivamente aberto: aprovação pendente no chat ativo trava o painel aberto
 * (Cybersecurity B4 — aprovação nunca fica escondida).
 */
export function rightPanelVisible(ui: UiPrefs, pendingApprovals: number, narrow = false, overlayOpen = false): boolean {
  if (pendingApprovals > 0) return true
  // Janela estreita: o painel flutua sobre o chat, então só abre a pedido (não herda a preferência larga).
  return narrow ? overlayOpen : ui.rightPanelOpen
}
