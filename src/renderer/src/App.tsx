import { useEffect, type ReactElement } from 'react'
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
import { IconCalendar, IconChat, IconCoin, IconDiff, IconGear, IconPlug, IconUser, IconUsers } from './components/Icons'

const NAV: { id: View; label: string; icon: ReactElement }[] = [
  { id: 'chat', label: 'Chat', icon: <IconChat /> },
  { id: 'changes', label: 'Alterações', icon: <IconDiff /> },
  { id: 'mcp', label: 'MCP', icon: <IconPlug /> },
  { id: 'profile', label: 'Perfil', icon: <IconUser /> },
  { id: 'agenda', label: 'Agenda', icon: <IconCalendar /> },
  { id: 'community', label: 'Comunidade', icon: <IconUsers /> },
  { id: 'costs', label: 'Custos', icon: <IconCoin /> },
  { id: 'settings', label: 'Config', icon: <IconGear /> }
]

function ReminderBanner() {
  const reminder = useStore((s) => s.reminder)
  if (!reminder) return null
  const { occurrence: o, minutesLeft } = reminder
  const close = (): void => useStore.setState({ reminder: null })
  return (
    <div className="reminder">
      <span>
        ⏰ <b>{o.title}</b> em {minutesLeft} min
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

export function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)
  const pending = useStore((s) => s.approvals.length)

  useEffect(() => {
    const off = window.deck.agent.onEvent((e) => useStore.getState().handleEvent(e))
    void useStore.getState().init()
    if (Notification.permission === 'default') void Notification.requestPermission()
    return off
  }, [])

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo" title="DevDeck">
          ◆
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`rail-btn ${view === n.id ? 'active' : ''}`} onClick={() => setView(n.id)} title={n.label}>
            {n.icon}
            <span>{n.label}</span>
            {n.id === 'chat' && pending > 0 && <span className="rail-badge">{pending}</span>}
          </button>
        ))}
      </nav>
      <Sidebar />
      <main className="main">
        {view === 'chat' && <ChatView />}
        {view === 'changes' && <ChangesView />}
        {view === 'mcp' && <McpView />}
        {view === 'profile' && <ProfileView />}
        {view === 'agenda' && <AgendaView />}
        {view === 'community' && <CommunityView />}
        {view === 'costs' && <CostsView />}
        {view === 'settings' && <SettingsView />}
      </main>
      <RightPanel />
      <StatusBar />
      <ReminderBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
