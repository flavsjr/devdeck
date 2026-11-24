// Regra única da notificação nativa do sistema (ADR-021), usada no main (conquistas, agenda)
// e no renderer (aprovação, Flow). Pura: o estado da janela chega como dado.

/** Eventos que pedem ação ou celebram algo: os únicos que podem virar notificação nativa. */
export const TIPOS_NATIVOS = ['aprovacao', 'lembrete', 'conquista'] as const
export type TipoNativo = (typeof TIPOS_NATIVOS)[number]

/** Todo evento que pode chegar à regra; erro e os demais tipos de toast nunca viram nativa. */
export type TipoEventoNotificavel = TipoNativo | 'erro' | 'aviso' | 'sucesso' | 'info'

export interface EstadoJanela {
  /** A janela tem o foco do teclado (main: `isFocused()`; renderer: `document.hasFocus()`). */
  focada: boolean
  /** A janela está visível (não minimizada nem escondida). */
  visivel: boolean
}

/**
 * Nativa só quando o usuário não está olhando para o app: sem foco, ou com foco mas invisível
 * (minimizada). Com a janela em foco e visível, o toast dentro do app basta.
 */
export function deveNotificarNativo(janela: EstadoJanela, tipo: TipoEventoNotificavel): boolean {
  if (!(TIPOS_NATIVOS as readonly string[]).includes(tipo)) return false
  return !(janela.focada && janela.visivel)
}
