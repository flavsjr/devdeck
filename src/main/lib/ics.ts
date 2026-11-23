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
  for (const comp of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(comp, { strictExceptions: false })
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex)
  return [...masters.values()]
}

export function extractLink(text: string): string | undefined {
  const m = /(https:\/\/(?:teams\.microsoft\.com|meet\.google\.com|[\w.-]*zoom\.us)\/[^\s"<>]+)/i.exec(text)
  return m?.[1]
}

export function expandIcsEvents(events: ICAL.Event[], feed: Pick<IcsFeed, 'id' | 'name'>, from: number, to: number): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    const push = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event): void => {
      const s = start.toJSDate().getTime()
      const e = end.toJSDate().getTime()
      if (e <= from || s >= to) return
      if (/^(cancelad|cancel+ed)/i.test(item.summary ?? '')) return
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
      const it = ev.iterator()
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
