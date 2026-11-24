import ICAL from 'ical.js'
import type { IcsFeed, Occurrence } from '@shared/types'

// Parse e expansão de calendários ICS (não confiáveis). Intervalos semiabertos: [from, to).

export const MAX_ITER = 5000

export function parseIcs(text: string): ICAL.Event[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // fuso inválido: o horário cai como local
    }
  }
  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  const loose: ICAL.Event[] = []
  root.getAllSubcomponents('vevent').forEach((comp, i) => {
    const ev = new ICAL.Event(comp, { strictExceptions: false })
    // Sem UID: cada VEVENT é um evento próprio (id sintético), sem relação com exceções.
    if (!ev.uid) {
      ev.uid = `noid-${i}`
      loose.push(ev)
    } else if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  })
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    // Exceção órfã (série não veio no arquivo): aparece como evento avulso.
    if (master) master.relateException(ex)
    else loose.push(ex)
  }
  return [...masters.values(), ...loose]
}

const MEETING_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'meet.google.com']

/** Host exato (ou subdomínio de zoom.us); https sem porta nem usuário. Domínio parecido (evilzoom.us) não passa. */
function isMeetingUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return false
  const host = u.hostname.toLowerCase()
  return MEETING_HOSTS.includes(host) || host === 'zoom.us' || host.endsWith('.zoom.us')
}

export function extractLink(text: string): string | undefined {
  for (const m of text.matchAll(/https:\/\/[^\s"<>]+/gi)) if (isMeetingUrl(m[0])) return m[0]
  return undefined
}

const DAY_MS = 86_400_000

/**
 * Série DAILY/WEEKLY sem COUNT começada há muito tempo: o iterador parte de um início alinhado
 * (k períodos depois do DTSTART, mesmo horário local) para não estourar MAX_ITER antes de chegar em `from`.
 */
export function alignedStart(ev: ICAL.Event, from: number): ICAL.Time | undefined {
  const rule = ev.component.getFirstPropertyValue('rrule') as ICAL.Recur | null
  if (!rule || rule.count || (rule.freq !== 'DAILY' && rule.freq !== 'WEEKLY')) return undefined
  const period = (rule.freq === 'WEEKLY' ? 7 : 1) * (rule.interval || 1)
  const start = ev.startDate
  const days = Math.floor((from - start.toJSDate().getTime()) / DAY_MS) - period
  const k = Math.floor(days / period)
  if (k <= 0) return undefined
  const t = start.clone()
  t.adjust(k * period, 0, 0, 0)
  return t
}

const isCancelled = (item: ICAL.Event): boolean =>
  String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED' || /^(cancelad|cancel+ed)/i.test(item.summary ?? '')

export function expandIcsEvents(events: ICAL.Event[], feed: Pick<IcsFeed, 'id' | 'name'>, from: number, to: number): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    const push = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event): void => {
      const s = start.toJSDate().getTime()
      const e = end.toJSDate().getTime()
      if (e <= from || s >= to) return
      if (isCancelled(item)) return
      out.push({
        key: `ics:${feed.id}:${item.uid}:${s}`,
        source: 'ics',
        eventId: item.uid,
        feedName: feed.name,
        title: item.summary || '(sem título)',
        start: s,
        end: e,
        kind: 'meeting',
        location: item.location || undefined,
        link: extractLink(`${item.location ?? ''} ${item.description ?? ''}`),
        allDay: start.isDate
      })
    }
    try {
      if (!ev.isRecurring()) {
        push(ev.startDate, ev.endDate, ev)
        continue
      }
      const it = ev.iterator(alignedStart(ev, from))
      let next: ICAL.Time | null
      for (let i = 0; i < MAX_ITER && (next = it.next()); i++) {
        if (next.toJSDate().getTime() >= to) break
        const det = ev.getOccurrenceDetails(next)
        push(det.startDate, det.endDate, det.item)
      }
    } catch {
      // evento malformado: ignora
    }
  }
  return out
}
