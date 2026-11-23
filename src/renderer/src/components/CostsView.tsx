import { useEffect } from 'react'
import { useStore } from '../store'
import { duration, tokens, usd } from '../format'

export function CostsView() {
  const costs = useStore((s) => s.costs)
  const refreshCosts = useStore((s) => s.refreshCosts)

  useEffect(() => {
    void refreshCosts()
  }, [refreshCosts])

  if (!costs) return <div className="view-pad muted">Carregando…</div>

  const budgetPct = costs.dailyBudgetUsd > 0 ? (costs.todayUsd / costs.dailyBudgetUsd) * 100 : 0
  const decided = costs.approvals.approved + costs.approvals.rejected
  const acceptRate = decided ? Math.round((costs.approvals.approved / decided) * 100) : null
  const maxDay = Math.max(...costs.last14Days.map((d) => d.costUsd), 0)

  return (
    <div className="view-pad costs">
      <div className="view-head">
        <h2>Custos e métricas</h2>
      </div>
      <p className="muted small">Valores estimados pelo Claude Agent SDK (list price), não são fatura.</p>

      <div className="kpis">
        <div className={`kpi ${budgetPct >= 100 ? 'alert' : budgetPct >= 80 ? 'warn' : ''}`}>
          <div className="kpi-label">Hoje</div>
          <div className="kpi-value">{usd(costs.todayUsd)}</div>
          {costs.dailyBudgetUsd > 0 && (
            <>
              <div className="meter">
                <div style={{ width: `${Math.min(100, budgetPct)}%` }} />
              </div>
              <div className="kpi-sub">
                {Math.round(budgetPct)}% do teto de {usd(costs.dailyBudgetUsd)}
              </div>
            </>
          )}
        </div>
        <div className="kpi">
          <div className="kpi-label">Mês</div>
          <div className="kpi-value">{usd(costs.monthUsd)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{usd(costs.allTimeUsd)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Aceitação de diffs</div>
          <div className="kpi-value">{acceptRate === null ? '—' : `${acceptRate}%`}</div>
          <div className="kpi-sub">
            {costs.approvals.approved} aprovadas · {costs.approvals.rejected} rejeitadas
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Turnos</div>
          <div className="kpi-value">{costs.turns}</div>
          <div className="kpi-sub">média {duration(costs.avgTurnMs)}</div>
        </div>
      </div>

      <div className="grid2 top">
        <div className="card">
          <div className="panel-title">Por modelo (mês)</div>
          <table className="data">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cache leitura</th>
                <th>Cache escrita</th>
                <th>Custo</th>
              </tr>
            </thead>
            <tbody>
              {costs.byModelMonth.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Sem uso neste mês.
                  </td>
                </tr>
              )}
              {costs.byModelMonth.map((m) => (
                <tr key={m.model}>
                  <td className="mono">{m.model}</td>
                  <td>{tokens(m.inputTokens)}</td>
                  <td>{tokens(m.outputTokens)}</td>
                  <td>{tokens(m.cacheReadTokens)}</td>
                  <td>{tokens(m.cacheWriteTokens)}</td>
                  <td>{usd(m.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="panel-title">Últimos 14 dias</div>
          <table className="data days">
            <tbody>
              {[...costs.last14Days].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="mono small">{d.day.slice(5)}</td>
                  <td className="bar-cell">
                    <div className="bar" style={{ width: maxDay ? `${(d.costUsd / maxDay) * 100}%` : 0 }} />
                  </td>
                  <td className="num">{usd(d.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="panel-title">Chats mais caros</div>
        <table className="data">
          <tbody>
            {costs.bySession.length === 0 && (
              <tr>
                <td className="muted">Nada ainda.</td>
              </tr>
            )}
            {costs.bySession.map((s) => (
              <tr key={s.sessionId}>
                <td>{s.title}</td>
                <td className="num">{usd(s.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
