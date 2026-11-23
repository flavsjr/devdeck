import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, MAX_LEVEL, evaluateAchievements, levelFromXp, xpForLevel } from '@shared/achievements'
import type { MetricKey } from '@shared/types'

const ZERO = Object.fromEntries([...new Set(ACHIEVEMENTS.map((a) => a.metric))].map((m) => [m, 0])) as Record<MetricKey, number>

describe('níveis', () => {
  it('xpForLevel', () => {
    expect([1, 2, 3, 8].map(xpForLevel)).toEqual([0, 50, 150, 1400])
  })
  it('levelFromXp nos limites', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 50 })
    expect(levelFromXp(49).level).toBe(1)
    expect(levelFromXp(50)).toEqual({ level: 2, levelStartXp: 50, nextLevelXp: 150 })
    expect(levelFromXp(1510)).toEqual({ level: 8, levelStartXp: 1400, nextLevelXp: 1800 })
  })
  it('valores inválidos não travam', () => {
    expect(levelFromXp(-5).level).toBe(1)
    expect(levelFromXp(Number.NaN).level).toBe(1)
    expect(levelFromXp(Number.POSITIVE_INFINITY).level).toBe(MAX_LEVEL)
  })
})

describe('catálogo', () => {
  it('ids únicos, 31 conquistas, 1510 XP no total', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS).toHaveLength(31)
    expect(ACHIEVEMENTS.reduce((a, d) => a + d.xp, 0)).toBe(1510)
  })
})

describe('evaluateAchievements', () => {
  it('desbloqueia uma vez e não repete', () => {
    const first = evaluateAchievements(ACHIEVEMENTS, { ...ZERO, turns: 1 }, {}, 1000)
    expect(first.unlocked).toEqual(['first-prompt'])
    expect(first.states['first-prompt']).toEqual({ id: 'first-prompt', progress: 1, unlockedAt: 1000 })
    const second = evaluateAchievements(ACHIEVEMENTS, { ...ZERO, turns: 2 }, first.states, 2000)
    expect(second.unlocked).toEqual([])
    expect(second.states['first-prompt'].unlockedAt).toBe(1000)
  })

  it('métrica que cai mantém a conquista', () => {
    const s1 = evaluateAchievements(ACHIEVEMENTS, { ...ZERO, mcpEnabled: 1 }, {}, 1).states
    const s2 = evaluateAchievements(ACHIEVEMENTS, ZERO, s1, 2).states
    expect(s2['mcp-1'].unlockedAt).toBe(1)
  })

  it('várias de uma vez', () => {
    const r = evaluateAchievements(ACHIEVEMENTS, { ...ZERO, turns: 50, focusSessions: 1 }, {}, 5)
    expect(r.unlocked.sort()).toEqual(['first-prompt', 'focus-1', 'turns-50'])
  })

  it('progresso limitado ao alvo e sanitizado', () => {
    const r = evaluateAchievements(ACHIEVEMENTS, { ...ZERO, turns: Number.NaN, approved: -3 }, {}, 1)
    expect(r.states['first-prompt'].progress).toBe(0)
    expect(r.states['approved-25'].progress).toBe(0)
  })
})
