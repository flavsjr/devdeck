import { useEffect, useMemo, useState } from 'react'
import type { AgendaEvent, EventKind, IcsFeedInput, IcsFeedView, Occurrence, Recurrence } from '@shared/types'
import { errorText } from '@shared/lib/errorText'
import { useStore } from '../store'
import { IconPlus, IconRefresh } from './Icons'

// Agenda: semana com eventos locais (recorrentes) + calendários ICS assinados.

const DAY = 86_400_000
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const KIND_LABEL: Record<EventKind, string> = { daily: 'Daily', meeting: 'Reunião', reminder: 'Lembrete', focus: 'Foco' }

function startOfWeek(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)) // semana começa na segunda
  return s
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function localInput(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function blankEvent(kind: EventKind = 'meeting'): AgendaEvent {
  const d = new Date()
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return { id: '', title: '', start: localInput(d), durationMin: 30, recurrence: { kind: 'none' }, remindMin: 10, kind }
}

function dailyTemplate(): AgendaEvent {
  const d = new Date()
  d.setHours(9, 30, 0, 0)
  return { id: '', title: 'Daily', start: localInput(d), durationMin: 15, recurrence: { kind: 'weekdays' }, remindMin: 5, kind: 'daily' }
}

export function OccurrenceRow({ o, onEdit }: { o: Occurrence; onEdit?: () => void }) {
  const now = Date.now()
  const live = now >= o.start && now < o.end
  return (
    <div className={`occ kind-${o.kind} ${live ? 'live' : ''} ${o.end < now ? 'past' : ''}`} onClick={onEdit}>
      <span className="occ-time">{o.allDay ? 'dia todo' : hhmm(o.start)}</span>
      <span className="occ-title">{o.title}</span>
      {o.source === 'ics' && <span className="pill small">{o.feedName}</span>}
      {o.link && (
        <button
          className="btn sm primary"
          onClick={(e) => {
            e.stopPropagation()
            void window.deck.openExternal(o.link!)
          }}
        >
          Entrar
        </button>
      )}
    </div>
  )
}

function EventEditor({ ev, onClose }: { ev: AgendaEvent; onClose: () => void }) {
  const notify = useStore((s) => s.notify)
  const [d, setD] = useState<AgendaEvent>(ev)
  const recKind = d.recurrence.kind
  const weeklyDays = d.recurrence.kind === 'weekly' ? d.recurrence.days : []

  const setRec = (kind: Recurrence['kind']): void => {
    setD({ ...d, recurrence: kind === 'weekly' ? { kind, days: [new Date(d.start).getDay()] } : ({ kind } as Recurrence) })
  }

  const save = async (): Promise<void> => {
    if (!d.title.trim()) return notify({ tipo: 'aviso', texto: 'Dê um título ao evento.' })
    if (d.link && !/^https:\/\//.test(d.link)) return notify({ tipo: 'aviso', texto: 'O link da reunião precisa começar com https://.' })
    await window.deck.agenda.save(d)
    onClose()
  }

  const remove = async (): Promise<void> => {
    if (!confirm(`Excluir "${d.title}"${d.recurrence.kind !== 'none' ? ' e todas as repetições' : ''}?`)) return
    await window.deck.agenda.remove(d.id)
    onClose()
  }

  return (
    <div className="card editor">
      <div className="panel-title">{d.id ? 'Editar evento' : 'Novo evento'}</div>
      <div className="grid2">
        <label>
          Título
          <input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </label>
        <label>
          Tipo
          <select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as EventKind })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início
          <input type="datetime-local" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        </label>
        <label>
          Duração (min)
          <input type="number" min={5} step={5} value={d.durationMin} onChange={(e) => setD({ ...d, durationMin: Number(e.target.value) })} />
        </label>
        <label>
          Repetir
          <select value={recKind} onChange={(e) => setRec(e.target.value as Recurrence['kind'])}>
            <option value="none">Não repete</option>
            <option value="weekdays">Dias úteis (seg–sex)</option>
            <option value="daily">Todo dia</option>
            <option value="weekly">Dias da semana…</option>
          </select>
        </label>
        <label>
          Lembrete
          <select value={d.remindMin} onChange={(e) => setD({ ...d, remindMin: Number(e.target.value) })}>
            {[0, 1, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Sem lembrete' : `${m} min antes`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {recKind === 'weekly' && (
        <div className="seg week-picker">
          {WEEKDAYS.map((w, i) => (
            <button
              key={w}
              className={weeklyDays.includes(i) ? 'on' : ''}
              onClick={() => {
                const days = weeklyDays.includes(i) ? weeklyDays.filter((x) => x !== i) : [...weeklyDays, i]
                setD({ ...d, recurrence: { kind: 'weekly', days: days.length ? days : [i] } })
              }}
            >
              {w}
            </button>
          ))}
        </div>
      )}
      {recKind !== 'none' && (
        <label>
          Até (opcional)
          <input type="date" value={d.until ?? ''} onChange={(e) => setD({ ...d, until: e.target.value || undefined })} />
        </label>
      )}
      <label>
        Link da reunião (Teams, Meet, Zoom…)
        <input value={d.link ?? ''} placeholder="https://" onChange={(e) => setD({ ...d, link: e.target.value || undefined })} />
      </label>
      <label>
        Notas
        <textarea rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || undefined })} />
      </label>
      <div className="row-actions">
        <button className="btn primary" onClick={() => void save()}>
          Salvar
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
        <span className="spacer" />
        {d.id && (
          <button className="btn danger" onClick={() => void remove()}>
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}

function Feeds() {
  const notify = useStore((s) => s.notify)
  const [feeds, setFeeds] = useState<IcsFeedView[]>([])
  const [draft, setDraft] = useState({ name: '', url: '' })
  const [busy, setBusy] = useState(false)
  const agendaVersion = useStore((s) => s.agendaVersion)

  useEffect(() => {
    void window.deck.agenda.feeds().then(setFeeds)
  }, [agendaVersion])

  /** O link nunca volta do main: editar um feed existente manda `url: ''` (manter). */
  const update = (f: IcsFeedView, patch: Partial<IcsFeedInput>): void => {
    const input: IcsFeedInput = { id: f.id, name: f.name, url: '', enabled: f.enabled, remindMin: f.remindMin, ...patch }
    window.deck.agenda
      .saveFeed(input)
      .then(setFeeds)
      .catch((e: unknown) => notify({ tipo: 'erro', texto: errorText(e) }))
  }

  const add = async (): Promise<void> => {
    if (!/^(https|webcal):\/\//i.test(draft.url.trim())) return notify({ tipo: 'aviso', texto: 'Cole um link https:// ou webcal:// de um calendário ICS.' })
    setBusy(true)
    let list: IcsFeedView[]
    try {
      list = await window.deck.agenda.saveFeed({ id: '', name: draft.name || 'Calendário', url: draft.url.trim(), enabled: true, remindMin: 10 })
    } catch (e) {
      setBusy(false)
      return notify({ tipo: 'erro', texto: errorText(e) })
    }
    setFeeds(list)
    setBusy(false)
    setDraft({ name: '', url: '' })
    const added = list[list.length - 1]
    if (added?.error) notify({ tipo: 'aviso', texto: `Calendário adicionado, mas a sincronização falhou: ${errorText(added.error)}` })
  }

  return (
    <div className="card">
      <div className="panel-title">
        Calendários assinados (ICS, só leitura)
        <span className="spacer" />
        <button className="icon-btn" title="Sincronizar agora" onClick={() => void window.deck.agenda.syncFeeds().then(setFeeds)}>
          <IconRefresh size={14} />
        </button>
      </div>
      <p className="small muted">
        Outlook: Configurações → Calendário → Calendários compartilhados → Publicar calendário → copie o link ICS. Google: Configurações da agenda → Endereço secreto no formato iCal. O link é um segredo: trate-o como senha.
      </p>
      {feeds.map((f) => (
        <div key={f.id} className="feed-row">
          <label className="switch">
            <input type="checkbox" checked={f.enabled} aria-label={`Sincronizar ${f.name}`} onChange={() => update(f, { enabled: !f.enabled })} />
            <span />
          </label>
          <span className="feed-name" title={f.urlMasked}>
            {f.name}
          </span>
          {f.urlLost && <span className="small alert-text">link ilegível: remova e assine de novo</span>}
          <span className="small muted">{f.error ? <span className="alert-text">{f.error}</span> : f.lastSync ? `${f.count ?? 0} eventos · ${new Date(f.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'não sincronizado'}</span>
          <span className="spacer" />
          <select className="sm-select" value={f.remindMin} onChange={(e) => update(f, { remindMin: Number(e.target.value) })} title="Lembrete">
            {[0, 5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'sem lembrete' : `${m} min antes`}
              </option>
            ))}
          </select>
          <button className="btn ghost sm" onClick={() => confirm(`Remover "${f.name}"?`) && void window.deck.agenda.removeFeed(f.id).then(setFeeds)}>
            Remover
          </button>
        </div>
      ))}
      <div className="row-actions">
        <input style={{ maxWidth: 180 }} placeholder="Nome (ex.: Trabalho)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input type="password" placeholder="Link ICS (https:// ou webcal://)" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
        <button className="btn primary" disabled={!draft.url || busy} onClick={() => void add()}>
          {busy ? 'Sincronizando…' : 'Assinar'}
        </button>
      </div>
    </div>
  )
}

export function AgendaView() {
  const agendaVersion = useStore((s) => s.agendaVersion)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [occ, setOcc] = useState<Occurrence[]>([])
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [editing, setEditing] = useState<AgendaEvent | null>(null)

  useEffect(() => {
    const from = weekStart.getTime()
    void window.deck.agenda.occurrences(from, from + 7 * DAY).then(setOcc)
    void window.deck.agenda.events().then(setEvents)
  }, [weekStart, agendaVersion])

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getTime() + i * DAY)
        const next = d.getTime() + DAY
        return { date: d, items: occ.filter((o) => o.start < next && o.end > d.getTime()) }
      }),
    [weekStart, occ]
  )
  const today = new Date().toDateString()

  return (
    <div className="view-pad agenda">
      <div className="view-head">
        <h2>Agenda</h2>
        <div className="seg">
          <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}>‹</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</button>
          <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}>›</button>
        </div>
        <span className="muted small">
          {weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {new Date(weekStart.getTime() + 6 * DAY).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setEditing(dailyTemplate())}>
          + Daily (seg–sex 9h30)
        </button>
        <button className="btn primary" onClick={() => setEditing(blankEvent())}>
          <IconPlus size={14} /> Evento
        </button>
      </div>

      {editing && <EventEditor key={editing.id || 'new'} ev={editing} onClose={() => setEditing(null)} />}

      <div className="week">
        {days.map(({ date, items }) => (
          <div key={date.toISOString()} className={`day ${date.toDateString() === today ? 'today' : ''}`}>
            <div className="day-head">
              <span>{WEEKDAYS[date.getDay()]}</span>
              <span className="day-num">{date.getDate()}</span>
            </div>
            {items.length === 0 && <div className="muted small pad">—</div>}
            {items.map((o) => (
              <OccurrenceRow
                key={o.key}
                o={o}
                onEdit={
                  o.source === 'local'
                    ? () => {
                        const ev = events.find((e) => e.id === o.eventId)
                        if (ev) setEditing(ev)
                      }
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>

      <Feeds />
    </div>
  )
}
