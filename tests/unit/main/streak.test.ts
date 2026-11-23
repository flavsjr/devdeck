import { describe, expect, it } from 'vitest'
import { dayKey, startOfDayAgo } from '../../../src/main/lib/dates'
import { countLanguages, mergeDays, WINDOW_DAYS } from '../../../src/main/lib/streak'

const NOW = new Date(2026, 10, 23, 12, 0, 0) // 23/11/2026 12h local

function ago(n: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

function days(...offsets: number[]): Record<string, number> {
  return Object.fromEntries(offsets.map((o) => [ago(o), 1]))
}

describe('dayKey / startOfDayAgo', () => {
  it('formata no fuso local', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
  it('volta para a meia-noite local', () => {
    const d = startOfDayAgo(NOW, 2)
    expect(dayKey(d)).toBe('2026-11-21')
    expect(d.getHours()).toBe(0)
  })
})

describe('mergeDays', () => {
  it('sem dados → tudo zero', () => {
    expect(mergeDays([], NOW)).toEqual({ days: {}, activeDays: 0, currentStreak: 0, longestStreak: 0 })
  })

  it('hoje e 3 dias anteriores → sequência 4', () => {
    const r = mergeDays([{ days: days(0, 1, 2, 3) }], NOW)
    expect(r.currentStreak).toBe(4)
    expect(r.longestStreak).toBe(4)
  })

  it('sequência que começa ontem conta (hoje ainda não acabou)', () => {
    expect(mergeDays([{ days: days(1, 2, 3) }], NOW).currentStreak).toBe(3)
  })

  it('hoje sim, ontem não → atual 1', () => {
    expect(mergeDays([{ days: days(0, 2, 3) }], NOW).currentStreak).toBe(1)
  })

  it('buraco de dois dias zera a atual e preserva o recorde', () => {
    const r = mergeDays([{ days: days(2, 3, 4, 5) }], NOW)
    expect(r.currentStreak).toBe(0)
    expect(r.longestStreak).toBe(4)
  })

  it('soma provedores no mesmo dia e ignora zeros', () => {
    const r = mergeDays([{ days: { [ago(0)]: 2, [ago(5)]: 0 } }, { days: { [ago(0)]: 3 } }], NOW)
    expect(r.days[ago(0)]).toBe(5)
    expect(r.days[ago(5)]).toBeUndefined()
    expect(r.activeDays).toBe(1)
  })

  it('respeita a janela de dias', () => {
    const r = mergeDays([{ days: days(WINDOW_DAYS + 5, WINDOW_DAYS + 6) }], NOW)
    expect(r.longestStreak).toBe(0)
  })

  it('sequência atravessa a troca de horário de verão sem pular dia', () => {
    // 08/03/2026: início do horário de verão em Nova York; em São Paulo não muda nada.
    const now = new Date(2026, 2, 10, 12)
    const keys = [8, 9, 10, 7, 6].map((d) => dayKey(new Date(2026, 2, d, 12)))
    const r = mergeDays([{ days: Object.fromEntries(keys.map((k) => [k, 1])) }], now)
    expect(r.currentStreak).toBe(5)
  })
})

describe('countLanguages', () => {
  it('agrupa sem diferenciar maiúsculas e mantém a primeira grafia', () => {
    expect(countLanguages(['TypeScript', 'typescript', 'C#', null, '', 'TYPESCRIPT'])).toEqual([
      { name: 'TypeScript', count: 3 },
      { name: 'C#', count: 1 }
    ])
  })
})
