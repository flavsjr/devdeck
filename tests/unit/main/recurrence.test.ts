import { describe, expect, it } from 'vitest'
import type { AgendaEvent } from '@shared/types'
import { expandLocal, isValidLocalStart, matches, parseLocal } from '../../../src/main/lib/recurrence'

const MON = new Date(2026, 10, 23).getTime() // segunda 23/11/2026, 0h local
const DAY = 86_400_000
const WEEK_END = MON + 7 * DAY

function ev(patch: Partial<AgendaEvent>): AgendaEvent {
  return { id: 'e1', title: 'Daily', start: '2026-11-16T09:30', durationMin: 15, recurrence: { kind: 'none' }, remindMin: 5, kind: 'daily', ...patch }
}

describe('parseLocal / isValidLocalStart', () => {
  it('interpreta como horário local', () => {
    const d = parseLocal('2026-11-23T09:30')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 23, 9, 30])
  })
  it('string inválida → Date inválida, sem exceção', () => {
    expect(Number.isNaN(parseLocal('').getTime())).toBe(true)
    expect(Number.isNaN(parseLocal('abc').getTime())).toBe(true)
  })
  it('valida o formato do datetime-local', () => {
    expect(isValidLocalStart('2026-11-23T09:30')).toBe(true)
    expect(isValidLocalStart('')).toBe(false)
    expect(isValidLocalStart('2026-11-23')).toBe(false)
    expect(isValidLocalStart(undefined)).toBe(false)
  })
})

describe('matches', () => {
  it('dias úteis', () => {
    expect(matches({ recurrence: { kind: 'weekdays' } }, new Date(2026, 10, 23))).toBe(true) // seg
    expect(matches({ recurrence: { kind: 'weekdays' } }, new Date(2026, 10, 29))).toBe(false) // dom
  })
})

describe('expandLocal', () => {
  it('dias úteis na semana → 5 ocorrências às 9h30', () => {
    const occ = expandLocal(ev({ recurrence: { kind: 'weekdays' } }), MON, WEEK_END)
    expect(occ).toHaveLength(5)
    expect(occ.every((o) => new Date(o.start).getHours() === 9 && new Date(o.start).getMinutes() === 30)).toBe(true)
  })

  it('semanal em seg e qua → 2 ocorrências', () => {
    const occ = expandLocal(ev({ recurrence: { kind: 'weekly', days: [1, 3] } }), MON, WEEK_END)
    expect(occ.map((o) => new Date(o.start).getDay())).toEqual([1, 3])
  })

  it('semanal sem dias → nada', () => {
    expect(expandLocal(ev({ recurrence: { kind: 'weekly', days: [] } }), MON, WEEK_END)).toEqual([])
  })

  it('until é inclusivo', () => {
    const occ = expandLocal(ev({ recurrence: { kind: 'daily' }, until: '2026-11-25' }), MON, WEEK_END)
    expect(occ.map((o) => new Date(o.start).getDate())).toEqual([23, 24, 25])
  })

  it('until antes do início → nada', () => {
    expect(expandLocal(ev({ recurrence: { kind: 'daily' }, until: '2026-11-01' }), MON, WEEK_END)).toEqual([])
  })

  it('fim é exclusivo: evento 9h–10h não aparece consultando a partir das 10h', () => {
    const single = ev({ start: '2026-11-23T09:00', durationMin: 60 })
    expect(expandLocal(single, new Date(2026, 10, 23, 10).getTime(), WEEK_END)).toEqual([])
    expect(expandLocal(single, new Date(2026, 10, 23, 9, 59).getTime(), WEEK_END)).toHaveLength(1)
  })

  it('ocorrência de ontem que atravessa a meia-noite aparece hoje', () => {
    const late = ev({ start: '2026-11-20T23:30', durationMin: 60, recurrence: { kind: 'daily' } })
    const occ = expandLocal(late, MON, MON + DAY)
    expect(occ.map((o) => new Date(o.start).getDate())).toEqual([22, 23])
  })

  it('início inválido → nada', () => {
    expect(expandLocal(ev({ start: '' }), MON, WEEK_END)).toEqual([])
  })

  it('horário mantém a hora local depois da troca de horário de verão', () => {
    // Em Nova York o horário de verão começa em 08/03/2026; 09:30 deve continuar 09:30.
    const occ = expandLocal(ev({ start: '2026-03-02T09:30', recurrence: { kind: 'daily' } }), new Date(2026, 2, 7).getTime(), new Date(2026, 2, 11).getTime())
    expect(occ.map((o) => `${new Date(o.start).getDate()} ${new Date(o.start).getHours()}:${new Date(o.start).getMinutes()}`)).toEqual([
      '7 9:30',
      '8 9:30',
      '9 9:30',
      '10 9:30'
    ])
  })
})
