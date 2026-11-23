import type { AgendaEvent, Occurrence } from '@shared/types'

// Expansão de eventos locais recorrentes. Intervalos semiabertos: [from, to).

const DAY = 86_400_000
export const MAX_DAYS = 400

const LOCAL_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** Início válido no formato do <input type="datetime-local">. */
export function isValidLocalStart(start: unknown): start is string {
  if (typeof start !== 'string' || !LOCAL_START.test(start)) return false
  return !Number.isNaN(parseLocal(start).getTime())
}

/** 'YYYY-MM-DDTHH:mm' → Date local. String inválida → Date inválida. */
export function parseLocal(start: string): Date {
  const [d, t = '00:00'] = start.split('T')
  const [y, m, day] = (d ?? '').split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  if ([y, m, day, hh, mm].some((n) => n === undefined || Number.isNaN(n))) return new Date(NaN)
  return new Date(y, m - 1, day, hh, mm)
}

export function matches(ev: Pick<AgendaEvent, 'recurrence'>, day: Date): boolean {
  const r = ev.recurrence
  const wd = day.getDay()
  if (r.kind === 'daily') return true
  if (r.kind === 'weekdays') return wd >= 1 && wd <= 5
  if (r.kind === 'weekly') return r.days.includes(wd)
  return false
}

/** Ocorrências que intersectam [from, to). */
export function expandLocal(ev: AgendaEvent, from: number, to: number): Occurrence[] {
  const first = parseLocal(ev.start)
  if (Number.isNaN(first.getTime())) return []
  const dur = ev.durationMin * 60_000
  const make = (start: Date): Occurrence => ({
    key: `local:${ev.id}:${start.getTime()}`,
    source: 'local',
    eventId: ev.id,
    title: ev.title,
    start: start.getTime(),
    end: start.getTime() + dur,
    kind: ev.kind,
    link: ev.link,
    notes: ev.notes
  })
  const overlaps = (s: number): boolean => s < to && s + dur > from

  if (ev.recurrence.kind === 'none') return overlaps(first.getTime()) ? [make(first)] : []

  const until = ev.until ? parseLocal(`${ev.until}T23:59`).getTime() : Infinity
  const out: Occurrence[] = []
  const cursor = new Date(Math.max(first.getTime(), from - DAY))
  cursor.setHours(first.getHours(), first.getMinutes(), 0, 0)
  for (let i = 0; i < MAX_DAYS && cursor.getTime() < Math.min(to, until + 1); i++) {
    if (cursor.getTime() >= first.getTime() && cursor.getTime() <= until && matches(ev, cursor) && overlaps(cursor.getTime())) {
      out.push(make(new Date(cursor)))
    }
    cursor.setDate(cursor.getDate() + 1)
    cursor.setHours(first.getHours(), first.getMinutes(), 0, 0)
  }
  return out
}
