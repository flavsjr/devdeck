import { Notification } from 'electron'
import { ACHIEVEMENTS, evaluateAchievements, levelFromXp } from '@shared/achievements'
import type { AchievementsSummary, MetricKey, ProviderId } from '@shared/types'
import { getAchievementStates, getIcsFeeds, getMcpServers, getProfile, getProviderCache, getProviderToken, getStats, saveAchievementStates } from './store'
import { countLanguages, mergeDays } from './lib/streak'
import { emit } from './events'
import { deveNotificarNativo } from '@shared/lib/nativeNotify'
import { estadoJanelaPrincipal } from './mainWindow'

// Avalia conquistas a partir de métricas locais + cache dos provedores + comunidade.

const PROVIDERS: ProviderId[] = ['github', 'gitlab', 'bitbucket']

export function computeMetrics(): Record<MetricKey, number> {
  const st = getStats()
  const cache = getProviderCache().filter((s) => !s.error)
  const merged = mergeDays(cache)
  const profile = getProfile()
  const languages = countLanguages(cache.flatMap((s) => s.languages.map((l) => l.name)))
  return {
    turns: st.turns,
    approved: st.approved,
    rejected: st.rejected,
    reverts: st.reverts,
    focusSessions: st.focusSessions,
    nightTurns: st.nightTurns,
    earlyTurns: st.earlyTurns,
    eventsCreated: st.eventsCreated,
    // Só feeds que sincronizaram com sucesso contam.
    icsFeeds: getIcsFeeds().filter((f) => f.lastSync && !f.error).length,
    mcpEnabled: getMcpServers().filter((m) => m.enabled).length,
    providers: PROVIDERS.filter((p) => getProviderToken(p)).length,
    commits: cache.reduce((a, s) => a + s.commits, 0),
    pullRequests: cache.reduce((a, s) => a + s.pullRequests, 0),
    reviews: cache.reduce((a, s) => a + s.reviews, 0),
    longestStreak: merged.longestStreak,
    languages: languages.length,
    profileComplete: profile.displayName.trim() && profile.headline.trim() ? 1 : 0,
    articles: profile.community?.articles ?? 0,
    snippets: profile.community?.snippets ?? 0,
    likesReceived: profile.community?.likesReceived ?? 0
  }
}

/** Atualiza progresso, persiste e notifica conquistas recém-desbloqueadas. */
export function checkAchievements(): void {
  const { states, unlocked } = evaluateAchievements(ACHIEVEMENTS, computeMetrics(), getAchievementStates(), Date.now())
  saveAchievementStates(states)

  for (const id of unlocked) {
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (def) emit({ type: 'achievement', def })
  }
  // O toast de conquista sai sempre pelo evento acima; a nativa só com o usuário fora do app (ADR-021).
  if (unlocked.length && Notification.isSupported() && deveNotificarNativo(estadoJanelaPrincipal(), 'conquista')) {
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
