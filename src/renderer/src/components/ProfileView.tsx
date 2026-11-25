import { useEffect, useMemo, useState } from 'react'
import type { AchievementsSummary, ProfileSummary, ProviderId } from '@shared/types'
import { ACHIEVEMENTS, CATEGORY_LABEL } from '@shared/achievements'
import { errorText } from '@shared/lib/errorText'
import { useStore } from '../store'
import { usd } from '../format'
import { IconRefresh } from './Icons'

// Perfil do dev: cartão, métricas git agregadas, heatmap, linguagens, conquistas e conexões.

const PROVIDER_LABEL: Record<ProviderId, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket Cloud' }
const PROVIDER_HELP: Record<ProviderId, string> = {
  github: 'Token clássico com read:user e repo (privados), ou fine-grained com leitura de metadados/conteúdo.',
  gitlab: 'Personal access token com escopo read_api. Para self-hosted, informe a URL base.',
  bitbucket: 'API token do Atlassian com escopos read:user, read:workspace, read:repository e read:pullrequest (bitbucket).'
}

// Paleta sequencial (azul, passos para superfície escura) e categórica fixa — ver skill dataviz.
// Valores em styles/tokens.css (--viz-*).
const HEAT = ['var(--viz-heat-1)', 'var(--viz-heat-2)', 'var(--viz-heat-3)', 'var(--viz-heat-4)']
const CATEGORICAL = ['var(--viz-cat-1)', 'var(--viz-cat-2)', 'var(--viz-cat-3)', 'var(--viz-cat-4)', 'var(--viz-cat-5)']
const OTHER = 'var(--viz-other)'

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Heatmap({ days }: { days: Record<string, number> }) {
  const { weeks, thresholds, months } = useMemo(() => {
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - (25 * 7 + end.getDay()))
    const weeks: { key: string; date: Date; count: number; future: boolean }[][] = []
    const months: { col: number; label: string }[] = []
    const cursor = new Date(start)
    for (let w = 0; w < 26; w++) {
      const col: { key: string; date: Date; count: number; future: boolean }[] = []
      for (let d = 0; d < 7; d++) {
        const k = dayKey(cursor)
        if (d === 0 && (w === 0 || cursor.getDate() <= 7)) months.push({ col: w, label: cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') })
        col.push({ key: k, date: new Date(cursor), count: days[k] ?? 0, future: cursor > end })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(col)
    }
    const vals = Object.values(days).filter((v) => v > 0).sort((a, b) => a - b)
    const q = (p: number): number => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] ?? 1
    return { weeks, thresholds: [q(0.25), q(0.5), q(0.75)], months }
  }, [days])

  const level = (n: number): number => (n <= 0 ? -1 : n <= thresholds[0] ? 0 : n <= thresholds[1] ? 1 : n <= thresholds[2] ? 2 : 3)

  return (
    <div className="heatmap">
      <div className="heat-months">
        {months.map((m) => (
          <span key={`${m.col}-${m.label}`} style={{ gridColumn: m.col + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="heat-grid">
        {weeks.map((col, wi) => (
          <div key={wi} className="heat-col">
            {col.map((c) => {
              const lv = level(c.count)
              return (
                <span
                  key={c.key}
                  className={`heat-cell ${c.future ? 'future' : ''}`}
                  style={lv >= 0 ? { background: HEAT[lv] } : undefined}
                  title={`${c.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}: ${c.count} ${c.count === 1 ? 'atividade' : 'atividades'}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend small muted">
        menos <span className="heat-cell" />
        {HEAT.map((c) => (
          <span key={c} className="heat-cell" style={{ background: c }} />
        ))}{' '}
        mais
      </div>
    </div>
  )
}

function Languages({ langs }: { langs: { name: string; count: number }[] }) {
  const total = langs.reduce((a, l) => a + l.count, 0)
  if (!total) return <div className="muted small">Sem dados de linguagem.</div>
  const top = langs.slice(0, 5)
  const rest = total - top.reduce((a, l) => a + l.count, 0)
  const rows = [...top.map((l, i) => ({ ...l, color: CATEGORICAL[i] })), ...(rest > 0 ? [{ name: 'Outras', count: rest, color: OTHER }] : [])]
  return (
    <>
      <div className="lang-bar">
        {rows.map((r) => (
          <span key={r.name} style={{ width: `${(r.count / total) * 100}%`, background: r.color }} title={`${r.name}: ${Math.round((r.count / total) * 100)}%`} />
        ))}
      </div>
      <ul className="lang-legend">
        {rows.map((r) => (
          <li key={r.name}>
            <span className="swatch" style={{ background: r.color }} />
            {r.name} <span className="muted">{Math.round((r.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ProviderCard({ id, summary, onChange }: { id: ProviderId; summary: ProfileSummary; onChange: (s: ProfileSummary) => void }) {
  const notify = useStore((s) => s.notify)
  const cfg = summary.providers.find((p) => p.id === id)
  const stats = summary.stats.find((s) => s.provider === id)
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState(cfg?.baseUrl ?? '')
  const [busy, setBusy] = useState(false)

  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      onChange(await window.deck.profile.setToken(id, token, id === 'gitlab' ? baseUrl : undefined))
      setToken('')
    } catch (e) {
      notify({ tipo: 'erro', texto: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    if (!confirm(`Desconectar ${PROVIDER_LABEL[id]}? O token salvo será apagado.`)) return
    onChange(await window.deck.profile.setToken(id, null))
  }

  return (
    <div className={`provider ${cfg?.connected ? 'on' : ''}`}>
      <div className="provider-head">
        <span className="provider-name">{PROVIDER_LABEL[id]}</span>
        {cfg?.connected ? (
          stats?.error ? <span className="pill bad">erro</span> : <span className="pill ok">@{stats?.login ?? '…'}</span>
        ) : (
          <span className="pill">desconectado</span>
        )}
        <span className="spacer" />
        {cfg?.connected && (
          <button className="btn ghost sm" onClick={() => void disconnect()}>
            Desconectar
          </button>
        )}
      </div>
      {stats?.error && <div className="small alert-text">{stats.error}</div>}
      {cfg?.connected && stats && !stats.error && (
        <div className="small muted">
          {stats.commits} commits · {stats.pullRequests} PRs · {stats.reviews} reviews · atualizado {new Date(stats.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {!cfg?.connected && (
        <>
          <p className="small muted">{PROVIDER_HELP[id]}</p>
          {id === 'gitlab' && <input placeholder="https://gitlab.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />}
          <div className="row-actions">
            <input type="password" placeholder="Token de leitura" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn primary" disabled={!token || busy} onClick={() => void connect()}>
              {busy ? 'Conectando…' : 'Conectar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Achievements({ ach, featured, onFeature }: { ach: AchievementsSummary; featured: string[]; onFeature: (ids: string[]) => void }) {
  const cats = Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]
  const unlockedCount = ACHIEVEMENTS.filter((a) => ach.states[a.id]?.unlockedAt).length
  const toggle = (id: string): void => {
    if (featured.includes(id)) onFeature(featured.filter((f) => f !== id))
    else if (featured.length < 3) onFeature([...featured, id])
  }
  return (
    <div className="card">
      <div className="panel-title">
        Conquistas <span className="muted small">{unlockedCount}/{ACHIEVEMENTS.length} · clique na ⭐ para destacar até 3</span>
      </div>
      {cats.map((c) => (
        <div key={c} className="ach-group">
          <div className="side-title">{CATEGORY_LABEL[c]}</div>
          <div className="ach-grid">
            {ACHIEVEMENTS.filter((a) => a.category === c).map((a) => {
              const st = ach.states[a.id]
              const done = Boolean(st?.unlockedAt)
              const pct = Math.round(((st?.progress ?? 0) / a.target) * 100)
              return (
                <div key={a.id} className={`ach ${done ? 'done' : 'locked'}`} title={done ? `Desbloqueada em ${new Date(st!.unlockedAt!).toLocaleDateString('pt-BR')}` : `${st?.progress ?? 0}/${a.target}`}>
                  <div className="ach-icon">{a.icon}</div>
                  <div className="ach-body">
                    <div className="ach-title">
                      {a.title} <span className="muted small">+{a.xp} XP</span>
                    </div>
                    <div className="small muted">{a.description}</div>
                    {!done && (
                      <div className="meter thin">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {done && (
                    <button className={`star ${featured.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)} title="Destacar no perfil">
                      ★
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProfileView() {
  const achievementsVersion = useStore((s) => s.achievementsVersion)
  const notify = useStore((s) => s.notify)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [ach, setAch] = useState<AchievementsSummary | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ displayName: '', headline: '' })
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void window.deck.profile.get().then(setSummary)
  }, [])
  useEffect(() => {
    void window.deck.achievements.get().then(setAch)
  }, [achievementsVersion])

  if (!summary || !ach) return <div className="view-pad muted">Carregando perfil…</div>

  const { profile, totals, local } = summary
  const avatar = summary.stats.find((s) => s.avatarUrl && !s.error)?.avatarUrl
  const name = profile.displayName || summary.stats.find((s) => s.name)?.name || 'Dev sem nome'
  const levelPct = ((ach.xp - ach.levelStartXp) / (ach.nextLevelXp - ach.levelStartXp)) * 100
  const anyConnected = summary.providers.some((p) => p.connected)

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      setSummary(await window.deck.profile.refresh())
    } catch (e) {
      notify({ tipo: 'erro', texto: errorText(e) })
    } finally {
      setRefreshing(false)
    }
  }

  const saveProfile = async (): Promise<void> => {
    setSummary(await window.deck.profile.update(draft))
    setEditing(false)
  }

  const feature = async (ids: string[]): Promise<void> => {
    setSummary(await window.deck.profile.update({ featured: ids }))
  }

  return (
    <div className="view-pad profile">
      <div className="card profile-card">
        <div className="avatar">{avatar ? <img src={avatar} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}</div>
        <div className="profile-main">
          {editing ? (
            <div className="grid2">
              <input value={draft.displayName} placeholder="Seu nome" onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
              <input value={draft.headline} placeholder="Headline (ex.: Full-stack .NET + React)" onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
            </div>
          ) : (
            <>
              <h2>{name}</h2>
              <div className="muted">{profile.headline || 'Adicione uma headline ao seu perfil.'}</div>
            </>
          )}
          <div className="level-row">
            <span className="level">Nível {ach.level}</span>
            <div className="meter">
              <div style={{ width: `${levelPct}%` }} />
            </div>
            <span className="small muted">
              {ach.xp} / {ach.nextLevelXp} XP
            </span>
          </div>
          <div className="featured">
            {profile.featured.length === 0 && <span className="small muted">Nenhuma conquista em destaque.</span>}
            {profile.featured.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id)
              return a ? (
                <span key={id} className="badge-pill" title={a.description}>
                  {a.icon} {a.title}
                </span>
              ) : null
            })}
          </div>
        </div>
        <div className="profile-actions">
          {editing ? (
            <>
              <button className="btn primary" onClick={() => void saveProfile()}>
                Salvar
              </button>
              <button className="btn ghost" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="btn ghost"
              onClick={() => {
                setDraft({ displayName: profile.displayName, headline: profile.headline })
                setEditing(true)
              }}
            >
              Editar perfil
            </button>
          )}
          {anyConnected && (
            <button className="btn ghost" onClick={() => void refresh()} disabled={refreshing} title="Buscar métricas nos provedores">
              <IconRefresh size={14} /> {refreshing ? 'Atualizando…' : 'Atualizar'}
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Commits (6 meses)</div>
          <div className="kpi-value">{totals.commits}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pull/merge requests</div>
          <div className="kpi-value">{totals.pullRequests}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Code reviews</div>
          <div className="kpi-value">{totals.reviews}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sequência</div>
          <div className="kpi-value">{totals.currentStreak}d</div>
          <div className="kpi-sub">recorde {totals.longestStreak}d</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Dias ativos</div>
          <div className="kpi-value">{totals.activeDays}</div>
        </div>
      </div>

      <div className="card">
        <div className="panel-title">
          Atividade <span className="muted small">commits (GitLab/Bitbucket) + contribuições (GitHub), últimas 26 semanas</span>
        </div>
        {anyConnected ? <Heatmap days={totals.days} /> : <div className="muted small pad">Conecte um provedor abaixo para ver sua atividade.</div>}
      </div>

      <div className="grid2 top">
        <div className="card">
          <div className="panel-title">Linguagens</div>
          <Languages langs={totals.languages} />
        </div>
        <div className="card">
          <div className="panel-title">Repositórios mais ativos</div>
          {summary.stats.flatMap((s) => s.repos).length === 0 && <div className="muted small">Nada ainda.</div>}
          <table className="data">
            <tbody>
              {summary.stats
                .flatMap((s) => s.repos.map((r) => ({ ...r, provider: s.provider })))
                .sort((a, b) => b.commits - a.commits)
                .slice(0, 8)
                .map((r) => (
                  <tr key={`${r.provider}:${r.name}`}>
                    <td>
                      <button className="link" onClick={() => r.url && void window.deck.openExternal(r.url)}>
                        {r.name}
                      </button>{' '}
                      <span className="muted small">{PROVIDER_LABEL[r.provider]}</span>
                    </td>
                    <td className="muted small">{r.language}</td>
                    <td className="num">{r.commits}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="panel-title">No DevDeck</div>
        <div className="mini-stats">
          <span>
            <b>{local.turns}</b> turnos com IA
          </span>
          <span>
            <b>{local.approved}</b> aprovações · <b>{local.rejected}</b> rejeições
          </span>
          <span>
            <b>{local.reverts}</b> reverts
          </span>
          <span>
            <b>{local.focusSessions}</b> pomodoros
          </span>
          <span>
            <b>{local.mcpEnabled}</b> MCPs ligados
          </span>
          <span>
            <b>{usd(local.aiCostMonth)}</b> de IA no mês
          </span>
          <span>
            <b>{local.eventsCreated}</b> eventos criados
          </span>
        </div>
      </div>

      <Achievements ach={ach} featured={profile.featured} onFeature={(ids) => void feature(ids)} />

      <div className="card">
        <div className="panel-title">Conexões</div>
        <p className="small muted">Tokens ficam criptografados no cofre do sistema e só são usados para leitura de métricas.</p>
        <div className="providers">
          {(['github', 'gitlab', 'bitbucket'] as ProviderId[]).map((id) => (
            <ProviderCard key={id} id={id} summary={summary} onChange={setSummary} />
          ))}
        </div>
      </div>
    </div>
  )
}
