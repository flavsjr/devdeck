import { BrowserWindow, Notification, net } from 'electron'
import { randomUUID } from 'node:crypto'
import ICAL from 'ical.js'
import type { AgendaEvent, IcsFeed, Occurrence } from '@shared/types'
import { bumpStats, deleteIcsText, getAgendaEvents, getIcsFeeds, readIcsText, saveAgendaEvents, saveIcsFeeds, saveIcsText } from './store'
import { checkAchievements } from './achievements'
import { emit } from './events'

// Agenda local com recorrência + assinaturas ICS somente leitura + lembretes.

const DAY = 86_400_000
const MAX_DAYS = 400
const MAX_ITER = 5000
const SYNC_EVERY_MS = 30 * 60 * 1000

// ---------- eventos locais ----------

function parseLocal(start: string): Date {
  const [d, t = '00:00'] = start.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return new Date(y, m - 1, day, hh, mm)
}

function matches(ev: AgendaEvent, day: Date): boolean {
  const r = ev.recurrence
  const wd = day.getDay()
  if (r.kind === 'daily') return true
  if (r.kind === 'weekdays') return wd >= 1 && wd <= 5
  if (r.kind === 'weekly') return r.days.includes(wd)
  return false
}

function expandLocal(ev: AgendaEvent, from: number, to: number): Occurrence[] {
  const first = parseLocal(ev.start)
  const make = (start: Date): Occurrence => ({
    key: `local:${ev.id}:${start.getTime()}`,
    source: 'local',
    eventId: ev.id,
    title: ev.title,
    start: start.getTime(),
    end: start.getTime() + ev.durationMin * 60_000,
    kind: ev.kind,
    link: ev.link,
    notes: ev.notes
  })
  if (ev.recurrence.kind === 'none') {
    const end = first.getTime() + ev.durationMin * 60_000
    return end >= from && first.getTime() <= to ? [make(first)] : []
  }
  const until = ev.until ? parseLocal(`${ev.until}T23:59`).getTime() : Infinity
  const out: Occurrence[] = []
  const cursor = new Date(Math.max(first.getTime(), from - DAY))
  cursor.setHours(first.getHours(), first.getMinutes(), 0, 0)
  for (let i = 0; i < MAX_DAYS && cursor.getTime() <= Math.min(to, until); i++) {
    if (cursor.getTime() >= first.getTime() && matches(ev, cursor)) {
      const o = make(new Date(cursor))
      if (o.end >= from) out.push(o)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

// ---------- ICS ----------

const parsedCache = new Map<string, { text: string; events: ICAL.Event[] }>()

function parseFeed(feed: IcsFeed): ICAL.Event[] {
  const text = readIcsText(feed.id)
  if (!text) return []
  const cached = parsedCache.get(feed.id)
  if (cached?.text === text) return cached.events

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
  const events = [...masters.values()]
  parsedCache.set(feed.id, { text, events })
  return events
}

function expandIcs(feed: IcsFeed, from: number, to: number): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of parseFeed(feed)) {
    const push = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event): void => {
      const s = start.toJSDate().getTime()
      const e = end.toJSDate().getTime()
      if (e < from || s > to) return
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
        if (next.toJSDate().getTime() > to) break
        const det = ev.getOccurrenceDetails(next)
        push(det.startDate, det.endDate, det.item)
      }
    } catch {
      // evento malformado: ignora
    }
  }
  return out
}

function extractLink(text: string): string | undefined {
  const m = /(https:\/\/(?:teams\.microsoft\.com|meet\.google\.com|[\w.-]*zoom\.us)\/[^\s"<>]+)/i.exec(text)
  return m?.[1]
}

async function syncFeed(feed: IcsFeed): Promise<IcsFeed> {
  try {
    const url = feed.url.replace(/^webcal:\/\//i, 'https://')
    if (!/^https:\/\//i.test(url)) throw new Error('Use um link https:// (ou webcal://).')
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30_000)
    const res = await net.fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Resposta não é um calendário ICS.')
    saveIcsText(feed.id, text)
    parsedCache.delete(feed.id)
    const count = parseFeed(feed).length
    return { ...feed, lastSync: Date.now(), error: undefined, count }
  } catch (err) {
    return { ...feed, lastSync: Date.now(), error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------- API ----------

export function listOccurrences(from: number, to: number): Occurrence[] {
  const span = Math.min(to, from + MAX_DAYS * DAY)
  const local = getAgendaEvents().flatMap((e) => expandLocal(e, from, span))
  const ics = getIcsFeeds()
    .filter((f) => f.enabled)
    .flatMap((f) => expandIcs(f, from, span))
  return [...local, ...ics].sort((a, b) => a.start - b.start)
}

export function saveEvent(ev: AgendaEvent): AgendaEvent[] {
  const list = getAgendaEvents()
  const isNew = !ev.id || !list.some((e) => e.id === ev.id)
  const clean: AgendaEvent = {
    ...ev,
    id: ev.id || randomUUID(),
    title: ev.title.trim().slice(0, 120) || 'Sem título',
    durationMin: Math.max(5, Math.min(24 * 60, Math.round(ev.durationMin) || 30)),
    remindMin: Math.max(0, Math.min(24 * 60, Math.round(ev.remindMin) || 0)),
    link: ev.link && /^https:\/\//.test(ev.link) ? ev.link : undefined
  }
  const next = isNew ? [...list, clean] : list.map((e) => (e.id === clean.id ? clean : e))
  saveAgendaEvents(next)
  if (isNew) bumpStats({ eventsCreated: 1 })
  checkAchievements()
  emit({ type: 'agenda-changed' })
  return next
}

export function removeEvent(id: string): AgendaEvent[] {
  const next = saveAgendaEvents(getAgendaEvents().filter((e) => e.id !== id))
  emit({ type: 'agenda-changed' })
  return next
}

export async function saveFeed(feed: IcsFeed): Promise<IcsFeed[]> {
  const list = getIcsFeeds()
  const clean: IcsFeed = { ...feed, id: feed.id || randomUUID(), name: feed.name.trim().slice(0, 60) || 'Calendário', remindMin: Math.max(0, feed.remindMin) }
  const synced = clean.enabled ? await syncFeed(clean) : clean
  const next = list.some((f) => f.id === synced.id) ? list.map((f) => (f.id === synced.id ? synced : f)) : [...list, synced]
  saveIcsFeeds(next)
  checkAchievements()
  emit({ type: 'agenda-changed' })
  return next
}

export function removeFeed(id: string): IcsFeed[] {
  deleteIcsText(id)
  parsedCache.delete(id)
  const next = saveIcsFeeds(getIcsFeeds().filter((f) => f.id !== id))
  emit({ type: 'agenda-changed' })
  return next
}

export async function syncAllFeeds(): Promise<IcsFeed[]> {
  const synced = await Promise.all(getIcsFeeds().map((f) => (f.enabled ? syncFeed(f) : Promise.resolve(f))))
  saveIcsFeeds(synced)
  emit({ type: 'agenda-changed' })
  return synced
}

// ---------- lembretes ----------

const notified = new Set<string>()

function tickReminders(): void {
  const now = Date.now()
  const feeds = new Map(getIcsFeeds().map((f) => [f.id, f]))
  const events = new Map(getAgendaEvents().map((e) => [e.id, e]))
  for (const o of listOccurrences(now, now + 3 * 60 * 60 * 1000)) {
    if (o.allDay || notified.has(o.key)) continue
    const remindMin = o.source === 'local' ? (events.get(o.eventId)?.remindMin ?? 0) : (feeds.get(o.key.split(':')[1])?.remindMin ?? 0)
    if (!remindMin) continue
    const minutesLeft = Math.round((o.start - now) / 60_000)
    if (now < o.start - remindMin * 60_000 || now >= o.start) continue
    notified.add(o.key)
    emit({ type: 'reminder', occurrence: o, minutesLeft })
    if (Notification.isSupported()) {
      const n = new Notification({ title: `${o.title} em ${minutesLeft} min`, body: o.link ? 'Clique para abrir o DevDeck e entrar.' : (o.location ?? o.feedName ?? 'Lembrete do DevDeck') })
      n.on('click', () => BrowserWindow.getAllWindows()[0]?.show())
      n.show()
    }
  }
  if (notified.size > 500) notified.clear()
}

export function startAgendaScheduler(): void {
  setInterval(tickReminders, 30_000)
  setTimeout(tickReminders, 5_000)
  setInterval(() => void syncAllFeeds(), SYNC_EVERY_MS)
  setTimeout(() => void syncAllFeeds(), 15_000)
}
