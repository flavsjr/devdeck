import { useStore, type View } from './store'
import type { ShortcutAction } from './lib/shortcuts'
import { NARROW_WINDOW } from '@shared/layout'

// Ações disparadas por atalho ou pela paleta. Nenhuma aprova, rejeita ou executa tool (Cybersecurity B4).

export const VIEW_LABEL: Record<View, string> = {
  chat: 'Chat',
  changes: 'Alterações',
  mcp: 'MCP',
  profile: 'Perfil',
  agenda: 'Agenda',
  community: 'Comunidade',
  costs: 'Custos',
  settings: 'Configurações'
}

/** Foca o campo de mensagem do chat (troca para a aba Chat se preciso). */
export function focusComposer(): void {
  const st = useStore.getState()
  if (st.view !== 'chat') st.setView('chat')
  requestAnimationFrame(() => document.getElementById('composer')?.focus())
}

export function runAction(action: ShortcutAction): void {
  const st = useStore.getState()
  if (action.startsWith('view:')) {
    st.setView(action.slice(5) as View)
    return
  }
  switch (action) {
    case 'palette':
      st.setPalette(!st.paletteOpen)
      break
    case 'help':
      st.setHelp(!st.helpOpen)
      break
    case 'newChat':
      if (st.workspace) void st.newSession()
      else st.notify('Abra uma pasta de projeto antes de criar um chat.')
      break
    case 'focusComposer':
      focusComposer()
      break
    case 'toggleSidebar':
      st.setUi({ sidebarOpen: !st.ui.sidebarOpen })
      break
    case 'toggleRightPanel': {
      const pending = st.approvals.filter((a) => a.sessionId === st.activeId).length
      if (pending > 0) {
        st.notify('Há aprovação pendente: o painel fica aberto até você decidir.')
        return
      }
      if (window.innerWidth < NARROW_WINDOW) st.setOverlay(!st.overlayOpen)
      else st.setUi({ rightPanelOpen: !st.ui.rightPanelOpen })
      break
    }
  }
}
