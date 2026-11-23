import type { ProviderStats } from '@shared/types'
import { dayKey } from './dates'

// Agregação de atividade git: soma por dia e sequências (streaks).

export const WINDOW_DAYS = 182 // ~26 semanas, casa com o heatmap

/** Conta linguagens sem diferenciar maiúsculas; mantém a grafia da primeira ocorrência. */
export function countLanguages(langs: (string | null | undefined)[]): { name: string; count: number }[] {
  const m = new Map<string, { name: string; count: number }>()
  for (const l of langs) {
    if (!l) continue
    const key = l.trim().toLowerCase()
    if (!key) continue
    const cur = m.get(key)
    if (cur) cur.count++
    else m.set(key, { name: l.trim(), count: 1 })
  }
  return [...m.values()].sort((a, b) => b.count - a.count)
}

/** Soma os dias de todos os provedores e calcula sequência atual, recorde e dias ativos. */
export function mergeDays(
  all: Pick<ProviderStats, 'days'>[],
  now: Date = new Date(),
  windowDays: number = WINDOW_DAYS
): { days: Record<string, number>; activeDays: number; currentStreak: number; longestStreak: number } {
  const days: Record<string, number> = {}
  for (const s of all) for (const [k, v] of Object.entries(s.days)) if (v > 0) days[k] = (days[k] ?? 0) + v

  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0) // meio-dia evita pular/repetir dia em mudança de horário de verão
  let longest = 0
  let run = 0
  let current = 0
  let currentOpen = true
  // Hoje sem commit não quebra a sequência atual (o dia ainda não acabou).
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i <= windowDays; i++) {
    if (days[dayKey(cursor)]) {
      run++
      if (currentOpen) current = run
    } else {
      currentOpen = false
      run = 0
    }
    longest = Math.max(longest, run)
    cursor.setDate(cursor.getDate() - 1)
  }
  return { days, activeDays: Object.keys(days).length, currentStreak: current, longestStreak: longest }
}
