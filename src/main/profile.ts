import type { DevProfile, ProfileSummary, ProviderConfig, ProviderId, ProviderStats } from '@shared/types'
import { getMcpServers, getProfile, getProviderCache, getProviderToken, getStats, saveProfile, saveProviderCache, setProviderToken } from './store'
import { fetchProvider, mergeDays } from './providers'
import { checkAchievements } from './achievements'
import { costSummary } from './costs'

const PROVIDERS: ProviderId[] = ['github', 'gitlab', 'bitbucket']
const STALE_MS = 60 * 60 * 1000

function providerConfigs(): ProviderConfig[] {
  const p = getProfile()
  return PROVIDERS.map((id) => ({ id, connected: Boolean(getProviderToken(id)), baseUrl: id === 'gitlab' ? p.gitlabBaseUrl || 'https://gitlab.com' : undefined }))
}

function summarize(stats: ProviderStats[]): ProfileSummary {
  const p = getProfile()
  const ok = stats.filter((s) => !s.error)
  const merged = mergeDays(ok)
  const langs = new Map<string, number>()
  for (const s of ok) for (const l of s.languages) langs.set(l.name, (langs.get(l.name) ?? 0) + l.count)
  const st = getStats()
  return {
    profile: { displayName: p.displayName, headline: p.headline, featured: p.featured },
    providers: providerConfigs(),
    stats,
    totals: {
      days: merged.days,
      commits: ok.reduce((a, s) => a + s.commits, 0),
      pullRequests: ok.reduce((a, s) => a + s.pullRequests, 0),
      reviews: ok.reduce((a, s) => a + s.reviews, 0),
      activeDays: merged.activeDays,
      currentStreak: merged.currentStreak,
      longestStreak: merged.longestStreak,
      languages: [...langs.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    },
    local: {
      turns: st.turns,
      approved: st.approved,
      rejected: st.rejected,
      reverts: st.reverts,
      focusSessions: st.focusSessions,
      nightTurns: st.nightTurns,
      earlyTurns: st.earlyTurns,
      eventsCreated: st.eventsCreated,
      mcpEnabled: getMcpServers().filter((m) => m.enabled).length,
      aiCostMonth: costSummary().monthUsd
    }
  }
}

/** Cache atual; dispara atualização em segundo plano se estiver velho. */
export function getProfileSummary(): ProfileSummary {
  const cache = getProviderCache()
  const connected = PROVIDERS.filter((id) => getProviderToken(id))
  const stale = connected.some((id) => {
    const s = cache.find((c) => c.provider === id)
    return !s || Date.now() - s.fetchedAt > STALE_MS
  })
  if (stale) void refreshProfile()
  return summarize(cache.filter((c) => connected.includes(c.provider)))
}

let inflight: Promise<ProfileSummary> | null = null

export function refreshProfile(): Promise<ProfileSummary> {
  inflight ??= (async () => {
    try {
      const p = getProfile()
      const ids = PROVIDERS.filter((id) => getProviderToken(id))
      const stats = await Promise.all(ids.map((id) => fetchProvider(id, getProviderToken(id) as string, { gitlabBaseUrl: p.gitlabBaseUrl })))
      saveProviderCache(stats)
      checkAchievements()
      return summarize(stats)
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function updateProfile(patch: Partial<DevProfile>): ProfileSummary {
  const clean: Partial<DevProfile> = {}
  if (patch.displayName !== undefined) clean.displayName = patch.displayName.slice(0, 60)
  if (patch.headline !== undefined) clean.headline = patch.headline.slice(0, 120)
  if (patch.featured !== undefined) clean.featured = patch.featured.slice(0, 3)
  saveProfile(clean)
  checkAchievements()
  return getProfileSummary()
}

export async function setToken(id: ProviderId, token: string | null, baseUrl?: string): Promise<ProfileSummary> {
  if (id === 'gitlab' && baseUrl !== undefined) {
    const url = baseUrl.trim() || 'https://gitlab.com'
    if (!/^https:\/\//.test(url)) throw new Error('A URL do GitLab precisa começar com https://')
    saveProfile({ gitlabBaseUrl: url })
  }
  setProviderToken(id, token)
  if (!token) {
    saveProviderCache(getProviderCache().filter((s) => s.provider !== id))
    checkAchievements()
    return getProfileSummary()
  }
  return refreshProfile()
}
