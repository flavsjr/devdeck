import type { BrowserWindow } from 'electron'
import type { EstadoJanela } from '@shared/lib/nativeNotify'

// Referência à janela principal para quem precisa saber se o usuário está olhando para o app
// (regra da notificação nativa, ADR-021) sem importar o index.ts (evita import circular).

let main: BrowserWindow | null = null

export function setMainWindow(w: BrowserWindow | null): void {
  main = w
}

export function getMainWindow(): BrowserWindow | null {
  return main && !main.isDestroyed() ? main : null
}

/** Foco e visibilidade da janela principal; sem janela conta como "não está olhando". */
export function estadoJanelaPrincipal(): EstadoJanela {
  const w = getMainWindow()
  if (!w) return { focada: false, visivel: false }
  return { focada: w.isFocused(), visivel: w.isVisible() && !w.isMinimized() }
}

/** Traz a janela principal para a frente (clique na notificação nativa). */
export function mostrarJanelaPrincipal(): void {
  const w = getMainWindow()
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}
