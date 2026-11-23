import { useState } from 'react'
import type { AppSettings, EffortLevel } from '@shared/types'
import { useStore } from '../store'

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (padrão)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2' }
]
const EFFORTS: (EffortLevel | '')[] = ['', 'low', 'medium', 'high', 'xhigh', 'max']

export function SettingsView() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const notify = useStore((s) => s.notify)
  const [key, setKey] = useState('')

  if (!settings) return null

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings(await window.deck.settings.update(patch))
  }

  const saveKey = async (): Promise<void> => {
    try {
      setSettings(await window.deck.settings.setApiKey(key || null))
      setKey('')
      notify('Chave salva (criptografada pelo sistema).')
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="view-pad settings">
      <div className="view-head">
        <h2>Configurações</h2>
      </div>

      <div className="card">
        <div className="panel-title">Autenticação</div>
        <p className="muted small">
          Chave da API Anthropic (console.anthropic.com). Fica criptografada com o cofre do sistema (DPAPI no Windows) e é passada só ao processo do agente.
          Sem chave, o SDK tenta as credenciais já existentes do Claude Code nesta máquina.
        </p>
        <div className="row-actions">
          <input type="password" placeholder={settings.hasApiKey ? '•••••••• (salva)' : 'sk-ant-...'} value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn primary" onClick={() => void saveKey()} disabled={!key}>
            Salvar chave
          </button>
          {settings.hasApiKey && (
            <button className="btn ghost" onClick={() => void window.deck.settings.setApiKey(null).then(setSettings)}>
              Remover
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="panel-title">Modelo</div>
        <div className="grid2">
          <label>
            Modelo
            <select value={settings.model} onChange={(e) => void update({ model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Esforço (effort)
            <select value={settings.effort} onChange={(e) => void update({ effort: e.target.value as EffortLevel | '' })}>
              {EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e || 'padrão do modelo'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Instruções extras (anexadas ao system prompt do Claude Code)
          <textarea rows={3} value={settings.appendSystemPrompt} onChange={(e) => setSettings({ ...settings, appendSystemPrompt: e.target.value })} onBlur={(e) => void update({ appendSystemPrompt: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.loadProjectSettings} onChange={(e) => void update({ loadProjectSettings: e.target.checked })} />
          Carregar CLAUDE.md e .claude/settings.json do projeto
        </label>
        <p className="muted small">Mudanças valem a partir do próximo envio (chats ociosos são reiniciados e retomam o histórico).</p>
      </div>

      <div className="card">
        <div className="panel-title">Orçamento</div>
        <div className="grid2">
          <label>
            Teto diário (USD) — alerta na barra de status
            <input type="number" min={0} step={0.5} value={settings.dailyBudgetUsd} onChange={(e) => void update({ dailyBudgetUsd: Number(e.target.value) || 0 })} />
          </label>
          <label>
            Teto por sessão (USD) — o agente para ao atingir
            <input type="number" min={0} step={0.5} value={settings.sessionBudgetUsd} onChange={(e) => void update({ sessionBudgetUsd: Number(e.target.value) || 0 })} />
          </label>
        </div>
      </div>
    </div>
  )
}
