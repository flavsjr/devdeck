import { useEffect, useState } from 'react'
import type { McpServerEntry, McpTestResult, McpTransport, ToolPolicy } from '@shared/types'
import { useStore } from '../store'
import { IconPlus } from './Icons'

// Painel de MCPs estilo Claude: liga/desliga, edita, testa conexão, política por tool.

interface Draft {
  name: string
  type: McpTransport
  command: string
  args: string
  env: string
  url: string
  headers: string
}

const EMPTY_DRAFT: Draft = { name: '', type: 'stdio', command: '', args: '', env: '', url: '', headers: '' }

function kvToText(rec: Record<string, string> | undefined, sep: string): string {
  return Object.entries(rec ?? {})
    .map(([k, v]) => `${k}${sep}${v}`)
    .join('\n')
}

function textToKv(text: string, sep: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(sep)
    if (i <= 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + sep.length).trim()
  }
  return out
}

function toDraft(e: McpServerEntry): Draft {
  return {
    name: e.name,
    type: e.type,
    command: e.command ?? '',
    args: (e.args ?? []).join('\n'),
    env: kvToText(e.env, '='),
    url: e.url ?? '',
    headers: kvToText(e.headers, ': ')
  }
}

function fromDraft(d: Draft, base?: McpServerEntry): McpServerEntry {
  return {
    name: d.name.trim(),
    enabled: base?.enabled ?? true,
    type: d.type,
    command: d.type === 'stdio' ? d.command.trim() : undefined,
    args: d.type === 'stdio' ? d.args.split('\n').map((a) => a.trim()).filter(Boolean) : undefined,
    env: d.type === 'stdio' ? textToKv(d.env, '=') : undefined,
    url: d.type !== 'stdio' ? d.url.trim() : undefined,
    headers: d.type !== 'stdio' ? textToKv(d.headers, ':') : undefined,
    toolPolicies: base?.toolPolicies
  }
}

function mask(v: string): string {
  return v.length <= 4 ? '••••' : `${v.slice(0, 2)}••••${v.slice(-2)}`
}

export function McpView() {
  const notify = useStore((s) => s.notify)
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [editing, setEditing] = useState<{ draft: Draft; original?: McpServerEntry } | null>(null)
  const [tests, setTests] = useState<Record<string, McpTestResult | 'loading'>>({})

  useEffect(() => {
    void window.deck.mcp.list().then(setServers)
  }, [])

  const save = async (): Promise<void> => {
    if (!editing) return
    const entry = fromDraft(editing.draft, editing.original)
    if (!/^[A-Za-z0-9_-]+$/.test(entry.name)) return notify('Nome: use só letras, números, - e _.')
    if (entry.type === 'stdio' && !entry.command) return notify('Informe o comando.')
    if (entry.type !== 'stdio' && !entry.url) return notify('Informe a URL.')
    setServers(await window.deck.mcp.save(entry, editing.original?.name))
    setEditing(null)
  }

  const toggle = async (e: McpServerEntry): Promise<void> => {
    setServers(await window.deck.mcp.save({ ...e, enabled: !e.enabled }))
  }

  const test = async (e: McpServerEntry): Promise<void> => {
    setTests((t) => ({ ...t, [e.name]: 'loading' }))
    const r = await window.deck.mcp.test(e)
    setTests((t) => ({ ...t, [e.name]: r }))
  }

  const setPolicy = async (e: McpServerEntry, tool: string, policy: ToolPolicy): Promise<void> => {
    setServers(await window.deck.mcp.save({ ...e, toolPolicies: { ...(e.toolPolicies ?? {}), [tool]: policy } }))
  }

  const remove = async (e: McpServerEntry): Promise<void> => {
    if (!confirm(`Remover o servidor MCP "${e.name}"?`)) return
    setServers(await window.deck.mcp.remove(e.name))
  }

  const importClaude = async (): Promise<void> => {
    const r = await window.deck.mcp.importClaude()
    setServers(r.servers)
    notify(r.imported.length ? `Importados (desligados): ${r.imported.join(', ')}` : 'Nada novo para importar.')
  }

  return (
    <div className="view-pad mcp">
      <div className="view-head">
        <h2>Servidores MCP</h2>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => void importClaude()} title="Lê claude_desktop_config.json e ~/.claude.json">
          Importar do Claude
        </button>
        <button className="btn primary" onClick={() => setEditing({ draft: { ...EMPTY_DRAFT } })}>
          <IconPlus size={14} /> Adicionar
        </button>
      </div>
      <p className="muted small">
        Servidores ligados entram no próximo turno de cada chat. Tools com política <b>auto</b> rodam sem perguntar; <b>pedir</b> passa pelo painel de aprovação.
      </p>

      {editing && (
        <div className="card editor">
          <div className="grid2">
            <label>
              Nome
              <input value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} placeholder="ex.: github" />
            </label>
            <label>
              Transporte
              <select value={editing.draft.type} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, type: e.target.value as McpTransport } })}>
                <option value="stdio">stdio (processo local)</option>
                <option value="http">HTTP (streamable)</option>
                <option value="sse">SSE</option>
              </select>
            </label>
          </div>
          {editing.draft.type === 'stdio' ? (
            <>
              <label>
                Comando
                <input value={editing.draft.command} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, command: e.target.value } })} placeholder="ex.: npx" />
              </label>
              <div className="grid2">
                <label>
                  Argumentos (um por linha)
                  <textarea rows={4} value={editing.draft.args} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, args: e.target.value } })} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\projetos'} />
                </label>
                <label>
                  Variáveis de ambiente (CHAVE=valor)
                  <textarea rows={4} className="secret" value={editing.draft.env} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, env: e.target.value } })} placeholder="GITHUB_TOKEN=..." />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>
                URL
                <input value={editing.draft.url} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, url: e.target.value } })} placeholder="https://exemplo.com/mcp" />
              </label>
              <label>
                Headers (Nome: valor)
                <textarea rows={3} className="secret" value={editing.draft.headers} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, headers: e.target.value } })} placeholder="Authorization: Bearer ..." />
              </label>
            </>
          )}
          <div className="row-actions">
            <button className="btn primary" onClick={() => void save()}>
              Salvar
            </button>
            <button className="btn ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 && !editing && <div className="muted pad">Nenhum servidor configurado.</div>}

      {servers.map((s) => {
        const t = tests[s.name]
        return (
          <div key={s.name} className={`card server ${s.enabled ? '' : 'off'}`}>
            <div className="server-head">
              <label className="switch" title={s.enabled ? 'Desligar' : 'Ligar'}>
                <input type="checkbox" checked={s.enabled} onChange={() => void toggle(s)} />
                <span />
              </label>
              <span className="server-name">{s.name}</span>
              <span className="pill">{s.type}</span>
              <span className="server-target mono muted small" title={s.type === 'stdio' ? `${s.command} ${(s.args ?? []).join(' ')}` : s.url}>
                {s.type === 'stdio' ? `${s.command} ${(s.args ?? []).join(' ')}` : s.url}
              </span>
              <span className="spacer" />
              <button className="btn ghost sm" onClick={() => void test(s)} disabled={t === 'loading'}>
                {t === 'loading' ? 'Testando…' : 'Testar'}
              </button>
              <button className="btn ghost sm" onClick={() => setEditing({ draft: toDraft(s), original: s })}>
                Editar
              </button>
              <button className="btn ghost sm" onClick={() => void remove(s)}>
                Remover
              </button>
            </div>
            {Object.keys(s.env ?? {}).length > 0 && (
              <div className="env-list small mono">
                {Object.entries(s.env ?? {}).map(([k, v]) => (
                  <span key={k}>
                    {k}={mask(v)}
                  </span>
                ))}
              </div>
            )}
            {t && t !== 'loading' && (
              <div className={`test-result ${t.ok ? 'ok' : 'fail'}`}>
                {t.ok ? (
                  <>
                    <div className="small">
                      ✓ {t.serverName} {t.serverVersion} · {t.tools.length} tools · {t.resources.length} resources · {t.prompts.length} prompts · {t.ms}ms
                    </div>
                    {t.tools.length > 0 && (
                      <table className="tools-table">
                        <tbody>
                          {t.tools.map((tool) => {
                            const policy = s.toolPolicies?.[tool.name] ?? 'ask'
                            return (
                              <tr key={tool.name}>
                                <td className="mono">{tool.name}</td>
                                <td className="muted small">
                                  {tool.readOnly && <span className="pill">leitura</span>} {tool.description?.slice(0, 120)}
                                </td>
                                <td>
                                  <div className="seg">
                                    <button className={policy === 'auto' ? 'on' : ''} onClick={() => void setPolicy(s, tool.name, 'auto')}>
                                      auto
                                    </button>
                                    <button className={policy === 'ask' ? 'on' : ''} onClick={() => void setPolicy(s, tool.name, 'ask')}>
                                      pedir
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : (
                  <div className="small">✕ {t.error}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
