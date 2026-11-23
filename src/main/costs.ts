import type { CostSummary, ModelTotals } from '@shared/types'
import { getSettings, getStats, listSessions, readLedger } from './store'
import { dayKey as localDayKey } from './lib/dates'

function dayKey(ts: number): string {
  return localDayKey(new Date(ts))
}

export function costSummary(): CostSummary {
  const ledger = readLedger()
  const nowD = new Date()
  const today = dayKey(nowD.getTime())
  const monthPrefix = today.slice(0, 7)

  let todayUsd = 0
  let monthUsd = 0
  let allTimeUsd = 0
  const byModel = new Map<string, ModelTotals>()
  const byDay = new Map<string, number>()
  const bySession = new Map<string, number>()

  for (const e of ledger) {
    const day = dayKey(e.ts)
    allTimeUsd += e.costUsd
    if (day === today) todayUsd += e.costUsd
    byDay.set(day, (byDay.get(day) ?? 0) + e.costUsd)
    bySession.set(e.sessionId, (bySession.get(e.sessionId) ?? 0) + e.costUsd)
    if (!day.startsWith(monthPrefix)) continue
    monthUsd += e.costUsd
    const m = byModel.get(e.model) ?? { model: e.model, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    m.costUsd += e.costUsd
    m.inputTokens += e.inputTokens
    m.outputTokens += e.outputTokens
    m.cacheReadTokens += e.cacheReadTokens
    m.cacheWriteTokens += e.cacheWriteTokens
    byModel.set(e.model, m)
  }

  const last14Days: { day: string; costUsd: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - i)
    const k = dayKey(d.getTime())
    last14Days.push({ day: k, costUsd: byDay.get(k) ?? 0 })
  }

  const titles = new Map(listSessions().map((s) => [s.id, s.title]))
  const stats = getStats()

  return {
    todayUsd,
    monthUsd,
    allTimeUsd,
    dailyBudgetUsd: getSettings().dailyBudgetUsd,
    byModelMonth: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    last14Days,
    bySession: [...bySession.entries()]
      .map(([sessionId, costUsd]) => ({ sessionId, title: titles.get(sessionId) ?? '(chat removido)', costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10),
    approvals: { approved: stats.approved, rejected: stats.rejected },
    turns: stats.turns,
    avgTurnMs: stats.turns ? Math.round(stats.totalTurnMs / stats.turns) : 0
  }
}
