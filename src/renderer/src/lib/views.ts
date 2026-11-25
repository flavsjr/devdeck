// Abas do app. Fica em lib/ para regras puras (ação "navegar" das notificações) usarem
// o tipo sem importar o store.

export const VIEWS = ['chat', 'changes', 'mcp', 'profile', 'agenda', 'community', 'costs', 'settings'] as const
export type View = (typeof VIEWS)[number]
