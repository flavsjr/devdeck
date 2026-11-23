import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import { useStore, type View } from './store'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { RightPanel } from './components/RightPanel'
import { ChangesView } from './components/ChangesView'
import { McpView } from './components/McpView'
import { ProfileView } from './components/ProfileView'
import { AgendaView } from './components/AgendaView'
import { CommunityView } from './components/CommunityView'
import { CostsView } from './components/CostsView'
import { SettingsView } from './components/SettingsView'
import { StatusBar } from './components/StatusBar'
import { CommandPalette } from './components/CommandPalette'
import { ShortcutHelp } from './components/ShortcutHelp'
import { Logo } from './components/Logo'
import { IconBell, IconCalendar, IconChat, IconCoin, IconDiff, IconGear, IconPlug, IconUser, IconUsers } from './components/Icons'
import { isEditableTarget, keysFor, matchShortcut, type ShortcutAction } from './lib/shortcuts'
import { NARROW_WINDOW, rightPanelVisible } from '@shared/layout'
import { runAction, VIEW_LABEL } from './commands'

// Rail em dois grupos: trabalho (o que se usa o dia todo) e pessoal; Configurações fixa embaixo.
const WORK: { id: View; icon: ReactElement }[] = [
  { id: 'chat', icon: <IconChat /> },
  { id: 'changes', icon: <IconDiff /> },
  { id: 'mcp', icon: <IconPlug /> }
]
const PERSONAL: { id: View; icon: ReactElement }[] = [
  { id: 'profile', icon: <IconUser /> },
  { id: 'agenda', icon: <IconCalendar /> },
  { id: 'community', icon: <IconUsers /> },
  { id: 'costs', icon: <IconCoin /> }
]

function ReminderBanner() {
  const reminder = useStore((s) => s.reminder)
  if (!reminder) return null
  const { occurrence: o, minutesLeft } = reminder
  const close = (): void => useStore.setState({ reminder: null })
  return (
    <div className="reminder" role="status">
      <IconBell size={16} />
      <span>
        <b>{o.title}</b> em {minutesLeft} min
      </span>
      {o.link && (
        <button
          className="btn primary sm"
          onClick={() => {
            void window.deck.openExternal(o.link!)
            close()
          }}
        >
          Entrar
        </button>
      )}
      <button className="btn ghost sm" onClick={close}>
        Ok
      </button>
    </div>
  )
}

function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = (): void => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/** Atalhos globais: uma tabela (lib/shortcuts), um listener. */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useStore.getState()
      const action: ShortcutAction | null = matchShortcut(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, isComposing: e.isComposing, altGraph: e.getModifierState('AltGraph') },
        { editable: isEditableTarget(e.target as HTMLElement), modalOpen: st.paletteOpen || st.helpOpen || Boolean(document.querySelector('[aria-modal="true"]')) }
      )
      if (!action) return
      e.preventDefault()
      runAction(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function RailButton({ id, icon, active, badge, onClick }: { id: View; icon: ReactElement; active: boolean; badge?: number; onClick: () => void }) {
  const keys = keysFor(`view:${id}` as ShortcutAction)
  const label = VIEW_LABEL[id]
  return (
    <button
      className={`rail-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} aprovação(ões) pendente(s)` : label}
      aria-current={active ? 'page' : undefined}
      data-tip={keys ? `${label} · ${keys}` : label}
    >
      {icon}
      {badge ? (
        <span className="rail-badge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

export function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)
  const pending = useStore((s) => s.approvals.length)
  const pendingHere = useStore((s) => s.approvals.filter((a) => a.sessionId === s.activeId).length)
  const ui = useStore((s) => s.ui)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const helpOpen = useStore((s) => s.helpOpen)
  const overlayOpen = useStore((s) => s.overlayOpen)
  const width = useWindowWidth()

  useEffect(() => {
    const off = window.deck.agent.onEvent((e) => useStore.getState().handleEvent(e))
    void useStore.getState().init()
    if (Notification.permission === 'default') void Notification.requestPermission()
    return off
  }, [])
  useGlobalShortcuts()

  const narrow = width < NARROW_WINDOW
  const rightOpen = rightPanelVisible(ui, pendingHere, narrow, overlayOpen)
  // Em janela estreita o painel aberto flutua sobre o conteúdo; a coluna fica só com a faixa.
  const rightCol = rightOpen && !narrow ? `${ui.rightPanelWidth}px` : '40px'
  const layout = { '--sidebar-w': ui.sidebarOpen ? '264px' : '0px', '--right-w': rightCol, '--right-panel-w': `${ui.rightPanelWidth}px` } as CSSProperties

  return (
    <div className={`app ${ui.sidebarOpen ? '' : 'no-sidebar'} ${narrow ? 'narrow' : ''}`} style={layout}>
      <nav className="rail" aria-label="Seções">
        <div className="logo">
          <Logo />
        </div>
        <div className="rail-group">
          {WORK.map((n) => (
            <RailButton key={n.id} id={n.id} icon={n.icon} active={view === n.id} badge={n.id === 'chat' ? pending : 0} onClick={() => setView(n.id)} />
          ))}
        </div>
        <div className="rail-sep" role="separator" />
        <div className="rail-group">
          {PERSONAL.map((n) => (
            <RailButton key={n.id} id={n.id} icon={n.icon} active={view === n.id} onClick={() => setView(n.id)} />
          ))}
        </div>
        <span className="spacer" />
        <RailButton id="settings" icon={<IconGear />} active={view === 'settings'} onClick={() => setView('settings')} />
      </nav>
      {ui.sidebarOpen ? <Sidebar /> : <div aria-hidden="true" />}
      <main className="main" aria-label={VIEW_LABEL[view]}>
        <h1 className="sr-only">DevDeck: {VIEW_LABEL[view]}</h1>
        {view === 'chat' && <ChatView />}
        {view === 'changes' && <ChangesView />}
        {view === 'mcp' && <McpView />}
        {view === 'profile' && <ProfileView />}
        {view === 'agenda' && <AgendaView />}
        {view === 'community' && <CommunityView />}
        {view === 'costs' && <CostsView />}
        {view === 'settings' && <SettingsView />}
      </main>
      <RightPanel open={rightOpen} locked={pendingHere > 0} overlay={narrow && rightOpen} />
      <StatusBar />
      <ReminderBanner />
      {paletteOpen && <CommandPalette />}
      {helpOpen && <ShortcutHelp />}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}
