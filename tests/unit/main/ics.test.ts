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

  it.todo('Sprint 04: STATUS:CANCELLED sem prefixo no título é ocultado')
  it.todo('Sprint 04: dois VEVENT sem UID geram duas ocorrências')
  it.todo('Sprint 04: exceção órfã (sem evento mestre) aparece')
  it.todo('Sprint 04: série diária iniciada há mais de 13 anos ainda aparece hoje')
})

describe('extractLink', () => {
  it('reconhece Teams, Meet e Zoom', () => {
    expect(extractLink('Entrar: https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(extractLink('https://empresa.zoom.us/j/123')).toBe('https://empresa.zoom.us/j/123')
    expect(extractLink('sem link aqui')).toBeUndefined()
  })
  it.todo('Sprint 04: não aceitar domínios parecidos como https://evilzoom.us')
})
