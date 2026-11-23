import { describe, expect, it } from 'vitest'

// Garante que cada projeto do vitest roda de fato no fuso configurado.
describe('fuso do projeto', () => {
  it('offset de julho bate com o TZ', () => {
    const expected: Record<string, number> = { 'America/Sao_Paulo': 180, 'America/New_York': 240 }
    const tz = process.env.TZ ?? ''
    expect(Object.keys(expected)).toContain(tz)
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(expected[tz])
  })
})
