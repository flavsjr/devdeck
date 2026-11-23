import { Notification } from 'electron'
import { ACHIEVEMENTS, levelFromXp } from '@shared/achievements'
import type { AchievementsSummary, MetricKey, ProviderId } from '@shared/types'
import { getAchievementStates, getIcsFeeds, getMcpServers, getProfile, getProviderCache, getProviderToken, getStats, saveAchievementStates } from './store'
import { mergeDays } from './providers'
import { emit } from './events'

// Avalia conquistas a partir de métricas locais + cache dos provedores + comunidade.

const PROVIDERS: ProviderId[] = ['github', 'gitlab', 'bitbucket']

export function computeMetrics(): Record<MetricKey, number> {
  const st = getStats()
  const cache = getProviderCache().filter((s) => !s.error)
  const merged = mergeDays(cache)
  const profile = getProfile()
  const languages = new Set(cache.flatMap((s) => s.languages.map((l) => l.name)))
  return {
    turns: st.turns,
    approved: st.approved,
    rejected: st.rejected,
    reverts: st.reverts,
    focusSessions: st.focusSessions,
    nightTurns: st.nightTurns,
    earlyTurns: st.earlyTurns,
    eventsCreated: st.eventsCreated,
    icsFeeds: getIcsFeeds().length,
    mcpEnabled: getMcpServers().filter((m) => m.enabled).length,
    providers: PROVIDERS.filter((p) => getProviderToken(p)).length,
    commits: cache.reduce((a, s) => a + s.commits, 0),
    pullRequests: cache.reduce((a, s) => a + s.pullRequests, 0),
    reviews: cache.reduce((a, s) => a + s.reviews, 0),
    longestStreak: merged.longestStreak,
    languages: languages.size,
    profileComplete: profile.displayName.trim() && profile.headline.trim() ? 1 : 0,
    articles: profile.community?.articles ?? 0,
    snippets: profile.community?.snippets ?? 0,
    likesReceived: profile.community?.likesReceived ?? 0
  }
}

/** Atualiza progresso, persiste e notifica conquistas recém-desbloqueadas. */
export function checkAchievements(): void {
  const metrics = computeMetrics()
  const states = getAchievementStates()
  const unlocked: string[] = []
  for (const def of ACHIEVEMENTS) {
    const prev = states[def.id]
    const progress = Math.min(metrics[def.metric], def.target)
    const unlockedAt = prev?.unlockedAt ?? (progress >= def.target ? Date.now() : undefined)
    if (!prev?.unlockedAt && unlockedAt) unlocked.push(def.id)
    states[def.id] = { id: def.id, progress, unlockedAt }
  }
  saveAchievementStates(states)

  for (const id of unlocked) {
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (def) emit({ type: 'achievement', def })
  }
  if (unlocked.length && Notification.isSupported()) {
    const first = ACHIEVEMENTS.find((a) => a.id === unlocked[0])
    const body = unlocked.length === 1 && first ? `${first.icon} ${first.title} — ${first.description}` : `${unlocked.length} conquistas desbloqueadas!`
    new Notification({ title: 'DevDeck · Conquista!', body }).show()
  }
}

export function achievementsSummary(): AchievementsSummary {
  const states = getAchievementStates()
  const xp = ACHIEVEMENTS.reduce((acc, a) => acc + (states[a.id]?.unlockedAt ? a.xp : 0), 0)
  return { states, xp, ...levelFromXp(xp) }
}
