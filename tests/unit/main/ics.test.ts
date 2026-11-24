import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandIcsEvents, extractLink, parseIcs } from '../../../src/main/lib/ics'

const text = readFileSync(resolve(__dirname, '../../fixtures/outlook-daily.ics'), 'utf8')
const feed = { id: 'feed-1', name: 'Trabalho' }

describe('parseIcs + expandIcsEvents (Outlook)', () => {
  const events = parseIcs(text)
  const from = Date.UTC(2026, 10, 23, 3) // 23/11 00h em São Paulo
  const to = Date.UTC(2026, 10, 28, 3)

  it('fuso do Windows, RRULE e exceção movida', () => {
    const daily = expandIcsEvents(events, feed, from, to).filter((o) => o.eventId === 'daily-1')
    expect(daily.map((o) => [new Date(o.start).toISOString(), o.title])).toEqual([
      ['2026-11-23T12:30:00.000Z', 'Daily do time'],
      ['2026-11-24T14:00:00.000Z', 'Daily do time (adiada)'],
      ['2026-11-25T12:30:00.000Z', 'Daily do time'],
      ['2026-11-26T12:30:00.000Z', 'Daily do time'],
      ['2026-11-27T12:30:00.000Z', 'Daily do time']
    ])
  })

  it('extrai link do Teams da localização', () => {
    const first = expandIcsEvents(events, feed, from, to).find((o) => o.eventId === 'daily-1')
    expect(first?.link).toBe('https://teams.microsoft.com/l/meetup-join/abc')
  })

  it('"Hoje" não inclui dia inteiro de ontem nem de amanhã', () => {
    const todayStart = new Date(2026, 10, 23).getTime()
    const today = expandIcsEvents(events, feed, todayStart, todayStart + 86_400_000)
    expect(today.map((o) => o.eventId)).not.toContain('allday-yesterday')
    expect(today.map((o) => o.eventId)).not.toContain('allday-tomorrow')
  })

  it('evento com título "Cancelado:" é ocultado', () => {
    expect(expandIcsEvents(events, feed, from, to).map((o) => o.eventId)).not.toContain('cancelado-1')
  })

})

const NL = String.fromCharCode(10)
const cal = (...events: string[]): string => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join(NL)
const vevent = (...lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join(NL)

describe('casos de borda do ICS (Sprint 05, H05.4)', () => {
  const from = Date.UTC(2026, 10, 23)
  const to = Date.UTC(2026, 10, 24)

  it('STATUS:CANCELLED sem prefixo no título é ocultado', () => {
    const ics = cal(vevent('UID:c1', 'SUMMARY:Revisão', 'STATUS:CANCELLED', 'DTSTART:20261123T120000Z', 'DTEND:20261123T130000Z'), vevent('UID:ok', 'SUMMARY:Planning', 'STATUS:CONFIRMED', 'DTSTART:20261123T140000Z', 'DTEND:20261123T150000Z'))
    expect(expandIcsEvents(parseIcs(ics), feed, from, to).map((o) => o.eventId)).toEqual(['ok'])
  })

  it('exceção cancelada de uma série some só naquele dia', () => {
    const ics = cal(
      vevent('UID:s', 'SUMMARY:Daily', 'DTSTART:20261122T120000Z', 'DTEND:20261122T121500Z', 'RRULE:FREQ=DAILY'),
      vevent('UID:s', 'RECURRENCE-ID:20261123T120000Z', 'SUMMARY:Daily', 'STATUS:CANCELLED', 'DTSTART:20261123T120000Z', 'DTEND:20261123T121500Z')
    )
    expect(expandIcsEvents(parseIcs(ics), feed, Date.UTC(2026, 10, 22), Date.UTC(2026, 10, 25)).map((o) => new Date(o.start).getUTCDate())).toEqual([22, 24])
  })

  it('dois VEVENT sem UID geram duas ocorrências com chaves diferentes', () => {
    const ics = cal(vevent('SUMMARY:A', 'DTSTART:20261123T120000Z', 'DTEND:20261123T130000Z'), vevent('SUMMARY:B', 'DTSTART:20261123T120000Z', 'DTEND:20261123T130000Z'))
    const occ = expandIcsEvents(parseIcs(ics), feed, from, to)
    expect(occ.map((o) => o.title).sort()).toEqual(['A', 'B'])
    expect(new Set(occ.map((o) => o.key)).size).toBe(2)
  })

  it('exceção órfã (sem evento mestre) aparece', () => {
    const ics = cal(vevent('UID:orfa', 'RECURRENCE-ID:20261123T120000Z', 'SUMMARY:Movida', 'DTSTART:20261123T150000Z', 'DTEND:20261123T160000Z'))
    const occ = expandIcsEvents(parseIcs(ics), feed, from, to)
    expect(occ.map((o) => [o.title, new Date(o.start).toISOString()])).toEqual([['Movida', '2026-11-23T15:00:00.000Z']])
  })

  it('série diária iniciada há mais de 13 anos ainda aparece hoje, no mesmo horário', () => {
    const ics = cal(vevent('UID:velha', 'SUMMARY:Standup', 'DTSTART:20100104T120000Z', 'DTEND:20100104T121500Z', 'RRULE:FREQ=DAILY'))
    const occ = expandIcsEvents(parseIcs(ics), feed, from, to)
    expect(occ.map((o) => new Date(o.start).toISOString())).toEqual(['2026-11-23T12:00:00.000Z'])
  })

  it('série semanal antiga com intervalo 2 mantém a fase', () => {
    // 04/01/2010 é segunda; a cada 2 semanas. 16/11/2026 está a 880 semanas (par) → ocorre; 23/11 (881) não.
    const ics = cal(vevent('UID:quinzenal', 'SUMMARY:1:1', 'DTSTART:20100104T120000Z', 'DTEND:20100104T123000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2'))
    const twoWeeks = expandIcsEvents(parseIcs(ics), feed, Date.UTC(2026, 10, 16), Date.UTC(2026, 10, 30))
    expect(twoWeeks.map((o) => new Date(o.start).toISOString())).toEqual(['2026-11-16T12:00:00.000Z'])
  })

  it('série antiga com EXDATE e exceção movida continua batendo', () => {
    const ics = cal(
      vevent('UID:v2', 'SUMMARY:Sync', 'DTSTART:20120102T120000Z', 'DTEND:20120102T121500Z', 'RRULE:FREQ=DAILY', 'EXDATE:20261124T120000Z'),
      vevent('UID:v2', 'RECURRENCE-ID:20261125T120000Z', 'SUMMARY:Sync (tarde)', 'DTSTART:20261125T180000Z', 'DTEND:20261125T181500Z')
    )
    const occ = expandIcsEvents(parseIcs(ics), feed, Date.UTC(2026, 10, 23), Date.UTC(2026, 10, 26))
    expect(occ.map((o) => [new Date(o.start).toISOString(), o.title])).toEqual([
      ['2026-11-23T12:00:00.000Z', 'Sync'],
      ['2026-11-25T18:00:00.000Z', 'Sync (tarde)']
    ])
  })
})

describe('extractLink', () => {
  it('reconhece Teams, Meet e Zoom', () => {
    expect(extractLink('Entrar: https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(extractLink('https://empresa.zoom.us/j/123')).toBe('https://empresa.zoom.us/j/123')
    expect(extractLink('sem link aqui')).toBeUndefined()
  })
  it('não aceita domínios parecidos, porta, usuário nem http', () => {
    for (const t of ['https://evilzoom.us/j/1', 'https://zoom.us.evil.com/j/1', 'https://teams.microsoft.com.evil.io/x', 'http://meet.google.com/abc', 'https://meet.google.com:8443/abc', 'https://user@zoom.us/j/1', 'https://notmeet.google.com/x'])
      expect(extractLink(t), t).toBeUndefined()
  })
  it('pula link inválido e pega o primeiro válido', () => {
    expect(extractLink('https://evilzoom.us/j/1 ou https://zoom.us/j/2')).toBe('https://zoom.us/j/2')
  })
})
