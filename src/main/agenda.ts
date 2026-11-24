import { Notification, net } from 'electron'
import { randomUUID } from 'node:crypto'
import type ICAL from 'ical.js'
import type { AgendaEvent, IcsFeed, IcsFeedInput, IcsFeedView, Occurrence } from '@shared/types'
import { bumpStats, deleteIcsText, getAgendaEvents, getIcsFeeds, listIcsFeedViews, readIcsText, saveAgendaEvents, saveIcsFeeds, saveIcsText } from './store'
import { redact, resolveFeedInput } from './lib/secrets'
import { checkAchievements } from './achievements'
import { emit } from './events'
import { MAX_DAYS, expandLocal, isValidLocalStart } from './lib/recurrence'
import { expandIcsEvents, parseIcs } from './lib/ics'
import { HttpStatusError, MensagemUsuario, falhaComContexto } from './lib/userError'
import { deveNotificarNativo } from '@shared/lib/nativeNotify'
import { estadoJanelaPrincipal, mostrarJanelaPrincipal } from './mainWindow'

// Agenda local com recorrência + assinaturas ICS somente leitura + lembretes.

const DAY = 86_400_000
const SYNC_EVERY_MS = 30 * 60 * 1000
const MAX_REMIND_MIN = 24 * 60

// ---------- ICS (cache do parse por feed) ----------

const parsedCache = new Map<string, { text: string; events: ICAL.Event[] }>()

function parseFeed(feed: IcsFeed): ICAL.Event[] {
  const text = readIcsText(feed.id)
  if (!text) return []
  const cached = parsedCache.get(feed.id)
  if (cached?.text === text) return cached.events
  const events = parseIcs(text)
  parsedCache.set(feed.id, { text, events })
  return events
}

async function syncFeed(feed: IcsFeed): Promise<IcsFeed> {
  try {
    const url = feed.url.replace(/^webcal:\/\//i, 'https://')
    if (!/^https:\/\//i.test(url)) throw new MensagemUsuario('Use um link https:// (ou webcal://).')
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 30_000)
    const res = await net.fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    if (!res.ok) throw new HttpStatusError(res.status)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new MensagemUsuario('Resposta não é um calendário ICS.')
    saveIcsText(feed.id, text)
    parsedCache.delete(feed.id)
    const count = parseFeed(feed).length
    return { ...feed, lastSync: Date.now(), error: undefined, count }
  } catch (err) {
    // A mensagem vai para o renderer: PT-BR com contexto (H06.2, T11) e nunca com o link (que carrega o token).
    // falhaComContexto não repassa texto cru; o redact fica como defesa extra.
    const msg = falhaComContexto('Não foi possível baixar o calendário', err, 'O servidor do calendário')
    return { ...feed, lastSync: Date.now(), error: redact(msg, [feed.url, feed.url.replace(/^webcal:\/\//i, 'https://'), feed.url.replace(/^(https|webcal):\/\/[^/]+/i, '')]) }
  }
}

// ---------- API ----------

/** Ocorrências que intersectam [from, to). */
export function listOccurrences(from: number, to: number): Occurrence[] {
  const span = Math.min(to, from + MAX_DAYS * DAY)
  const local = getAgendaEvents().flatMap((e) => expandLocal(e, from, span))
  const ics = getIcsFeeds()
    .filter((f) => f.enabled)
    .flatMap((f) => expandIcsEvents(parseFeed(f), f, from, span))
  return [...local, ...ics].sort((a, b) => a.start - b.start)
}

export function saveEvent(ev: AgendaEvent): AgendaEvent[] {
  if (!isValidLocalStart(ev.start)) throw new Error('Informe data e hora de início válidas.')
  if (ev.until !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(ev.until)) throw new Error('Data "até" inválida.')
  const list = getAgendaEvents()
  const isNew = !ev.id || !list.some((e) => e.id === ev.id)
  const recurrence: AgendaEvent['recurrence'] =
    ev.recurrence.kind === 'weekly'
      ? { kind: 'weekly', days: [...new Set(ev.recurrence.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] }
      : ev.recurrence
  if (recurrence.kind === 'weekly' && recurrence.days.length === 0) throw new Error('Escolha ao menos um dia da semana.')
  const clean: AgendaEvent = {
    ...ev,
    recurrence,
    id: ev.id || randomUUID(),
    title: ev.title.trim().slice(0, 120) || 'Sem título',
    durationMin: Math.max(5, Math.min(24 * 60, Math.round(ev.durationMin) || 30)),
    remindMin: Math.max(0, Math.min(MAX_REMIND_MIN, Math.round(ev.remindMin) || 0)),
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

export async function saveFeed(input: IcsFeedInput): Promise<IcsFeedView[]> {
  const list = getIcsFeeds()
  const feed = resolveFeedInput(input, input.id ? list.find((f) => f.id === input.id) : undefined)
  const clean: IcsFeed = {
    ...feed,
    id: feed.id || randomUUID(),
    name: feed.name.trim().slice(0, 60) || 'Calendário',
    remindMin: Math.max(0, Math.min(MAX_REMIND_MIN, Math.round(feed.remindMin) || 0))
  }
  const synced = clean.enabled ? await syncFeed(clean) : clean
  const next = list.some((f) => f.id === synced.id) ? list.map((f) => (f.id === synced.id ? synced : f)) : [...list, synced]
  const views = saveIcsFeeds(next)
  checkAchievements()
  emit({ type: 'agenda-changed' })
  return views
}

export function removeFeed(id: string): IcsFeedView[] {
  deleteIcsText(id)
  parsedCache.delete(id)
  const next = saveIcsFeeds(getIcsFeeds().filter((f) => f.id !== id))
  emit({ type: 'agenda-changed' })
  return next
}

export async function syncAllFeeds(): Promise<IcsFeedView[]> {
  const feeds = getIcsFeeds()
  if (!feeds.length) return []
  const synced = await Promise.all(feeds.map((f) => (f.enabled && f.url ? syncFeed(f) : Promise.resolve(f))))
  let views: IcsFeedView[]
  try {
    views = saveIcsFeeds(synced)
  } catch {
    // Sem cofre do sistema (dados antigos ainda em claro): não regrava, só devolve o estado atual.
    views = listIcsFeedViews()
  }
  checkAchievements()
  emit({ type: 'agenda-changed' })
  return views
}

// ---------- lembretes ----------

const notified = new Set<string>()

function tickReminders(): void {
  const now = Date.now()
  const feeds = new Map(getIcsFeeds().map((f) => [f.id, f]))
  const events = new Map(getAgendaEvents().map((e) => [e.id, e]))
  // A janela cobre o maior lembrete configurado (antes era fixa em 3 h e lembretes maiores disparavam atrasados).
  const maxRemind = Math.max(0, ...[...events.values()].map((e) => e.remindMin), ...[...feeds.values()].map((f) => f.remindMin))
  if (!maxRemind) return
  for (const o of listOccurrences(now, now + (maxRemind + 1) * 60_000)) {
    if (o.allDay || notified.has(o.key)) continue
    const remindMin = o.source === 'local' ? (events.get(o.eventId)?.remindMin ?? 0) : (feeds.get(o.key.split(':')[1])?.remindMin ?? 0)
    if (!remindMin) continue
    const minutesLeft = Math.round((o.start - now) / 60_000)
    if (now < o.start - remindMin * 60_000 || now >= o.start) continue
    notified.add(o.key)
    // TODO(T13): o banner atual ('reminder', com a ocorrência inteira) sai quando o renderer trocar
    // pelo toast do 'agenda-reminder'. Mantido para o lembrete não sumir antes disso.
    emit({ type: 'reminder', occurrence: o, minutesLeft })
    // Nativa só com o usuário fora do app (deveNotificarNativo, ADR-021); com a janela em foco,
    // evento para o toast "Abrir na agenda", só com id e título.
    if (!deveNotificarNativo(estadoJanelaPrincipal(), 'lembrete')) {
      emit({ type: 'agenda-reminder', id: o.key, titulo: o.title })
    } else if (Notification.isSupported()) {
      const n = new Notification({ title: `${o.title} em ${minutesLeft} min`, body: o.link ? 'Clique para abrir o DevDeck e entrar.' : (o.location ?? o.feedName ?? 'Lembrete do DevDeck') })
      n.on('click', () => mostrarJanelaPrincipal())
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
