import { useEffect, useState } from 'react'
import type { Occurrence } from '@shared/types'
import { useStore } from '../store'
import { basename, tokens, usd } from '../format'
import { keysFor } from '../lib/shortcuts'
import { IconCalendar, IconCommand, IconCpu, IconFolder, IconPause, IconPlug } from './Icons'

function Meter({ pct, label }: { pct: number; label: string }) {
  const level = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''
  return (
    <span className={`meter ${level}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, pct))}>
      <span style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  )
}

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
    <button className={`sb-item ${mins <= 10 ? 'warn-text' : ''}`} onClick={() => setView('agenda')} title="Abrir agenda">
      <IconCalendar size={13} />
      {next.title} {when}
    </button>
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
  const git = useStore((s) => s.git)
  const treeVersion = useStore((s) => s.treeVersion)
  const refreshGit = useStore((s) => s.refreshGit)

  // Status do git acompanha o workspace e as mudanças na árvore (o gate do main decide se roda).
  useEffect(() => {
    void refreshGit()
  }, [workspace, treeVersion, refreshGit])

  const budget = costs?.dailyBudgetUsd ?? 0
  const today = costs?.todayUsd ?? 0
  const pct = budget > 0 ? (today / budget) * 100 : 0
  const ctxPct = ctx ? (ctx.used / ctx.window) * 100 : 0

  const setPalette = useStore((s) => s.setPalette)
  const mcp = info?.mcpServers ?? []
  const mcpOk = mcp.filter((m) => m.status === 'connected').length

  return (
    <footer className="statusbar">
      <span className="sb-item strong" title={workspace ?? ''}>
        <IconFolder size={13} />
        {workspace ? basename(workspace) : 'sem workspace'}
      </span>
      <span className="sb-item mono" title={info?.apiKeySource ? `Credencial: ${info.apiKeySource}` : 'Modelo'}>
        <IconCpu size={13} />
        {info?.model ?? settings?.model}
      </span>
      {git?.paused ? (
        <button className="sb-item warn-text" onClick={() => setView('changes')} title="O git deste repositório está pausado até você confiar nas configurações dele">
          <IconPause size={13} />
          git pausado
        </button>
      ) : (
        git?.branch && (
          <span className="sb-item mono" title="Branch atual">
            {git.branch}
          </span>
        )
      )}
      {mcp.length > 0 && (
        <span className={`sb-item ${mcpOk < mcp.length ? 'warn-text' : ''}`} title={mcp.map((m) => `${m.name}: ${m.status}`).join('\n')}>
          <IconPlug size={13} />
          MCP {mcpOk}/{mcp.length}
        </span>
      )}
      <span className="spacer" />
      <NextEvent />
      {activeId && ctx && (
        <span className={`sb-item ${ctxPct >= 70 ? 'warn-text' : ''}`} title={`${ctx.used.toLocaleString('pt-BR')} de ${ctx.window.toLocaleString('pt-BR')} tokens`}>
          contexto
          <Meter pct={ctxPct} label="Uso do contexto" />
          {ctxPct.toFixed(0)}% · {tokens(ctx.used)}
        </span>
      )}
      {session && <span className="sb-item">sessão {usd(session.totalCostUsd)}</span>}
      <span className="sb-sep" aria-hidden="true" />
      <button className={`sb-item ${pct >= 100 ? 'alert-text' : pct >= 80 ? 'warn-text' : ''}`} onClick={() => setView('costs')} title="Ver custos">
        hoje {usd(today)}
        {budget > 0 && (
          <>
            {' '}
            / {usd(budget)}
            <Meter pct={pct} label="Gasto do dia sobre o teto" />
            {pct.toFixed(0)}%
          </>
        )}
      </button>
      <button className="sb-item" onClick={() => setPalette(true)} title={`Paleta de comandos (${keysFor('palette')})`} aria-label={`Paleta de comandos ${keysFor('palette')}`}>
        <IconCommand size={13} />
        <kbd>{keysFor('palette')}</kbd>
      </button>
    </footer>
  )
}
