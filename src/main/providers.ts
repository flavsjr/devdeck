import { net } from 'electron'
import type { ProviderId, ProviderStats } from '@shared/types'

// Métricas de GitHub, GitLab e Bitbucket Cloud via token pessoal (somente leitura).
// net.fetch usa a pilha de rede do Chromium: respeita proxy corporativo do sistema.

export const WINDOW_DAYS = 182 // ~26 semanas, casa com o heatmap
const TIMEOUT_MS = 20_000

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sinceDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - WINDOW_DAYS)
  return d
}

async function getJson<T>(url: string, headers: Record<string, string>, init: { method?: string; body?: string } = {}): Promise<{ data: T; res: Response }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await net.fetch(url, { method: init.method ?? 'GET', body: init.body, headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${res.status} ${res.statusText} em ${new URL(url).pathname}${text ? `: ${text.slice(0, 160)}` : ''}`)
    }
    return { data: (await res.json()) as T, res }
  } finally {
    clearTimeout(t)
  }
}

function countLanguages(langs: (string | null | undefined)[]): { name: string; count: number }[] {
  const m = new Map<string, number>()
  for (const l of langs) if (l) m.set(l, (m.get(l) ?? 0) + 1)
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function base(provider: ProviderId): ProviderStats {
  return { provider, login: '', days: {}, commits: 0, pullRequests: 0, reviews: 0, repos: [], languages: [], windowDays: WINDOW_DAYS, fetchedAt: Date.now() }
}

// ---------- GitHub (GraphQL) ----------

interface GhResponse {
  data?: {
    viewer: {
      login: string
      name: string | null
      avatarUrl: string
      url: string
      contributionsCollection: {
        totalCommitContributions: number
        totalPullRequestContributions: number
        totalPullRequestReviewContributions: number
        contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] }
        commitContributionsByRepository: { repository: { nameWithOwner: string; url: string; primaryLanguage: { name: string } | null }; contributions: { totalCount: number } }[]
      }
      repositories: { nodes: { primaryLanguage: { name: string } | null }[] }
    }
  }
  errors?: { message: string }[]
}

const GH_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login name avatarUrl url
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 10) {
        repository { nameWithOwner url primaryLanguage { name } }
        contributions { totalCount }
      }
    }
    repositories(first: 60, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes { primaryLanguage { name } }
    }
  }
}`

async function fetchGitHub(token: string): Promise<ProviderStats> {
  const { data } = await getJson<GhResponse>(
    'https://api.github.com/graphql',
    { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    { method: 'POST', body: JSON.stringify({ query: GH_QUERY, variables: { from: sinceDate().toISOString(), to: new Date().toISOString() } }) }
  )
  if (data.errors?.length || !data.data) throw new Error(data.errors?.map((e) => e.message).join('; ') ?? 'Resposta vazia do GitHub')
  const v = data.data.viewer
  const cc = v.contributionsCollection
  const s = base('github')
  s.login = v.login
  s.name = v.name ?? undefined
  s.avatarUrl = v.avatarUrl
  s.profileUrl = v.url
  for (const w of cc.contributionCalendar.weeks) for (const d of w.contributionDays) if (d.contributionCount) s.days[d.date] = d.contributionCount
  s.commits = cc.totalCommitContributions
  s.pullRequests = cc.totalPullRequestContributions
  s.reviews = cc.totalPullRequestReviewContributions
  s.repos = cc.commitContributionsByRepository.map((r) => ({
    name: r.repository.nameWithOwner,
    url: r.repository.url,
    language: r.repository.primaryLanguage?.name,
    commits: r.contributions.totalCount
  }))
  s.languages = countLanguages(v.repositories.nodes.map((n) => n.primaryLanguage?.name))
  return s
}

// ---------- GitLab (REST v4, gitlab.com ou self-hosted) ----------

interface GlEvent {
  created_at: string
  action_name: string
  target_type: string | null
  project_id: number
  push_data?: { commit_count: number }
}

async function fetchGitLab(token: string, baseUrl: string): Promise<ProviderStats> {
  const api = `${baseUrl.replace(/\/+$/, '')}/api/v4`
  const h = { 'PRIVATE-TOKEN': token }
  const { data: me } = await getJson<{ id: number; username: string; name: string; avatar_url: string; web_url: string }>(`${api}/user`, h)
  const s = base('gitlab')
  s.login = me.username
  s.name = me.name
  s.avatarUrl = me.avatar_url
  s.profileUrl = me.web_url

  const after = dayKey(new Date(sinceDate().getTime() - 86_400_000))
  const byProject = new Map<number, number>()
  for (let page = 1; page <= 10; page++) {
    const { data: events, res } = await getJson<GlEvent[]>(`${api}/users/${me.id}/events?after=${after}&per_page=100&page=${page}`, h)
    for (const e of events) {
      const day = dayKey(new Date(e.created_at))
      if (e.push_data?.commit_count) {
        s.days[day] = (s.days[day] ?? 0) + e.push_data.commit_count
        s.commits += e.push_data.commit_count
        byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + e.push_data.commit_count)
      } else if (e.target_type === 'MergeRequest' && e.action_name === 'opened') s.pullRequests++
      else if (e.target_type === 'MergeRequest' && e.action_name === 'approved') s.reviews++
    }
    if (!res.headers.get('x-next-page')) break
  }

  const { data: projects } = await getJson<{ id: number; path_with_namespace: string; web_url: string }[]>(
    `${api}/projects?membership=true&order_by=last_activity_at&per_page=15&simple=true`,
    h
  )
  const langs: string[] = []
  await Promise.all(
    projects.slice(0, 10).map(async (p) => {
      try {
        const { data } = await getJson<Record<string, number>>(`${api}/projects/${p.id}/languages`, h)
        const top = Object.entries(data).sort((a, b) => b[1] - a[1])[0]?.[0]
        if (top) langs.push(top)
        if (byProject.has(p.id)) s.repos.push({ name: p.path_with_namespace, url: p.web_url, language: top, commits: byProject.get(p.id) ?? 0 })
      } catch {
        // projeto sem permissão de leitura de linguagens: ignora
      }
    })
  )
  s.repos.sort((a, b) => b.commits - a.commits)
  s.languages = countLanguages(langs)
  return s
}

// ---------- Bitbucket Cloud (REST 2.0, API token via Bearer) ----------

interface BbPage<T> {
  values: T[]
  next?: string
}
interface BbRepo {
  slug: string
  full_name: string
  language: string
  links: { html: { href: string } }
  workspace: { slug: string }
}
interface BbCommit {
  date: string
  author: { user?: { account_id?: string } }
}

async function fetchBitbucket(token: string): Promise<ProviderStats> {
  const api = 'https://api.bitbucket.org/2.0'
  const h = { Authorization: `Bearer ${token}` }
  const { data: me } = await getJson<{ account_id: string; display_name: string; nickname: string; links: { avatar: { href: string }; html: { href: string } } }>(`${api}/user`, h)
  const s = base('bitbucket')
  s.login = me.nickname
  s.name = me.display_name
  s.avatarUrl = me.links.avatar?.href
  s.profileUrl = me.links.html?.href
  const since = sinceDate()

  // Endpoint de workspaces mudou ao longo do tempo; tenta do mais novo ao legado.
  let slugs: string[] = []
  for (const path of ['/user/workspaces', '/user/permissions/workspaces', '/workspaces']) {
    try {
      const { data } = await getJson<BbPage<{ slug?: string; workspace?: { slug: string } }>>(`${api}${path}?pagelen=50`, h)
      slugs = data.values.map((v) => v.workspace?.slug ?? v.slug ?? '').filter(Boolean)
      if (slugs.length) break
    } catch {
      // tenta o próximo
    }
  }

  const q = encodeURIComponent(`updated_on >= ${since.toISOString()}`)
  const repos: BbRepo[] = []
  for (const ws of slugs.slice(0, 5)) {
    try {
      const { data } = await getJson<BbPage<BbRepo>>(`${api}/repositories/${encodeURIComponent(ws)}?role=member&sort=-updated_on&pagelen=25&q=${q}`, h)
      repos.push(...data.values)
    } catch {
      // workspace sem acesso
    }
  }
  const recent = repos.slice(0, 15)
  s.languages = countLanguages(repos.map((r) => r.language))

  await Promise.all(
    recent.map(async (r) => {
      let url: string | undefined = `${api}/repositories/${r.full_name}/commits?pagelen=100`
      let mine = 0
      for (let page = 0; url && page < 3; page++) {
        try {
          const res: { data: BbPage<BbCommit> } = await getJson<BbPage<BbCommit>>(url, h)
          let older = false
          for (const c of res.data.values) {
            const d = new Date(c.date)
            if (d < since) {
              older = true
              continue
            }
            if (c.author.user?.account_id !== me.account_id) continue
            const k = dayKey(d)
            s.days[k] = (s.days[k] ?? 0) + 1
            mine++
          }
          url = older ? undefined : res.data.next
        } catch {
          url = undefined
        }
      }
      s.commits += mine
      if (mine) s.repos.push({ name: r.full_name, url: r.links.html.href, language: r.language || undefined, commits: mine })
    })
  )
  s.repos.sort((a, b) => b.commits - a.commits)

  try {
    let url: string | undefined = `${api}/pullrequests/${encodeURIComponent(me.account_id)}?state=OPEN&state=MERGED&state=DECLINED&pagelen=50`
    for (let page = 0; url && page < 4; page++) {
      const res: { data: BbPage<{ created_on: string }> } = await getJson<BbPage<{ created_on: string }>>(url, h)
      const inWindow = res.data.values.filter((p) => new Date(p.created_on) >= since)
      s.pullRequests += inWindow.length
      url = inWindow.length === res.data.values.length ? res.data.next : undefined
    }
  } catch {
    // sem escopo de pull requests
  }
  return s
}

export async function fetchProvider(id: ProviderId, token: string, opts: { gitlabBaseUrl?: string } = {}): Promise<ProviderStats> {
  try {
    if (id === 'github') return await fetchGitHub(token)
    if (id === 'gitlab') return await fetchGitLab(token, opts.gitlabBaseUrl || 'https://gitlab.com')
    return await fetchBitbucket(token)
  } catch (err) {
    return { ...base(id), error: err instanceof Error ? err.message : String(err) }
  }
}

/** Soma dias de todos os provedores e calcula sequências. */
export function mergeDays(all: ProviderStats[]): { days: Record<string, number>; activeDays: number; currentStreak: number; longestStreak: number } {
  const days: Record<string, number> = {}
  for (const s of all) for (const [k, v] of Object.entries(s.days)) days[k] = (days[k] ?? 0) + v

  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  let longest = 0
  let run = 0
  let current = 0
  let currentOpen = true
  // Hoje sem commit não quebra a sequência atual (o dia ainda não acabou).
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i <= WINDOW_DAYS; i++) {
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
  return { days, activeDays: Object.values(days).filter((v) => v > 0).length, currentStreak: current, longestStreak: longest }
}
