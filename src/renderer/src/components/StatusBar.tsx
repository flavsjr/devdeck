import { useEffect, useState } from 'react'
import type { Occurrence } from '@shared/types'
import { useStore } from '../store'
import { tokens, usd } from '../format'

function NextEvent() {
  const agendaVersion = useStore((s) => s.agendaVersion)
  const setView = useStore((s) => s.setView)
  const [next, setNext] = useState<Occurrence | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const load = (): void => {
      const now = Date.now()
      void window.deck.agenda.occurrences(now, now + 12 * 3_600_000).then((list) => setNext(list.find((o) => !o.allDay && o.end > now) ?? null))
      tick((n) => n + 1)
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [agendaVersion])

  if (!next) return null
  const mins = Math.round((next.start - Date.now()) / 60_000)
  const when = mins <= 0 ? 'agora' : mins < 60 ? `em ${mins} min` : `às ${new Date(next.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  return (
    <span className={`sb-item clickable ${mins <= 10 ? 'warn-text' : ''}`} onClick={() => setView('agenda')} title="Abrir agenda">
      📅 {next.title} {when}
    </span>
  )
}

export function StatusBar() {
  const workspace = useStore((s) => s.workspace)
  const settings = useStore((s) => s.settings)
  const activeId = useStore((s) => s.activeId)
  const session = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const info = useStore((s) => (s.activeId ? s.info[s.activeId] : undefined))
  const ctx = useStore((s) => (s.activeId ? s.context[s.activeId] : undefined))
  const costs = useStore((s) => s.costs)
  const setView = useStore((s) => s.setView)

  const budget = costs?.dailyBudgetUsd ?? 0
  const today = costs?.todayUsd ?? 0
  const pct = budget > 0 ? (today / budget) * 100 : 0
  const ctxPct = ctx ? (ctx.used / ctx.window) * 100 : 0

  return (
    <footer className="statusbar">
      <span className="sb-item mono" title={workspace ?? ''}>
        {workspace ?? 'sem workspace'}
      </span>
      <span className="spacer" />
      <NextEvent />
      {info?.mcpServers && info.mcpServers.length > 0 && (
        <span className="sb-item" title={info.mcpServers.map((m) => `${m.name}: ${m.status}`).join('\n')}>
          MCP {info.mcpServers.filter((m) => m.status === 'connected').length}/{info.mcpServers.length}
        </span>
      )}
      {info?.apiKeySource && (
        <span className="sb-item" title="Origem da credencial">
          auth: {info.apiKeySource}
        </span>
      )}
      <span className="sb-item mono">{info?.model ?? settings?.model}</span>
      {activeId && ctx && (
        <span className={`sb-item ${ctxPct >= 70 ? 'warn-text' : ''}`} title={`${ctx.used.toLocaleString()} de ${ctx.window.toLocaleString()} tokens`}>
          contexto {tokens(ctx.used)} ({ctxPct.toFixed(0)}%)
        </span>
      )}
      {session && <span className="sb-item">sessão {usd(session.totalCostUsd)}</span>}
      <span className={`sb-item clickable ${pct >= 100 ? 'alert-text' : pct >= 80 ? 'warn-text' : ''}`} onClick={() => setView('costs')} title="Ver custos">
        hoje {usd(today)}
        {budget > 0 && ` / ${usd(budget)}`}
      </span>
    </footer>
  )
}
