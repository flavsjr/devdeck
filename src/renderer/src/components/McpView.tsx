import { useEffect, useState } from 'react'
import type { McpServerInput, McpServerView, McpTestResult, McpTransport, ToolPolicy } from '@shared/types'
import { useStore } from '../store'
import { keepAll, textToSecrets } from '../lib/secretInput'
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


function viewToInput(v: McpServerView): McpServerInput {
  const { envMasked, headersMasked, secretsLost: _lost, ...rest } = v
  return { ...rest, env: keepAll(envMasked), headers: keepAll(headersMasked) }
}

function toDraft(e: McpServerView): Draft {
  return {
    name: e.name,
    type: e.type,
    command: e.command ?? '',
    args: (e.args ?? []).join('\n'),
    env: kvToText(e.envMasked, '='),
    url: e.url ?? '',
    headers: kvToText(e.headersMasked, ': ')
  }
}

function fromDraft(d: Draft, base?: McpServerView): McpServerInput {
  return {
    name: d.name.trim(),
    enabled: base?.enabled ?? true,
    type: d.type,
    command: d.type === 'stdio' ? d.command.trim() : undefined,
    args: d.type === 'stdio' ? d.args.split('\n').map((a) => a.trim()).filter(Boolean) : undefined,
    env: d.type === 'stdio' ? textToSecrets(d.env, '=', base?.envMasked) : undefined,
    url: d.type !== 'stdio' ? d.url.trim() : undefined,
    headers: d.type !== 'stdio' ? textToSecrets(d.headers, ':', base?.headersMasked) : undefined,
    toolPolicies: base?.toolPolicies
  }
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function McpView() {
  const notify = useStore((s) => s.notify)
  const settings = useStore((s) => s.settings)
  const [servers, setServers] = useState<McpServerView[]>([])
  const [editing, setEditing] = useState<{ draft: Draft; original?: McpServerView } | null>(null)
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
    try {
      setServers(await window.deck.mcp.save(entry, editing.original?.name))
      setEditing(null)
    } catch (e) {
      notify(errorText(e))
    }
  }

  const saveView = (v: McpServerView, patch: Partial<McpServerInput>): void => {
    window.deck.mcp
      .save({ ...viewToInput(v), ...patch })
      .then(setServers)
      .catch((e: unknown) => notify(errorText(e)))
  }

  const toggle = (e: McpServerView): void => saveView(e, { enabled: !e.enabled })

  const test = async (e: McpServerView): Promise<void> => {
    setTests((t) => ({ ...t, [e.name]: 'loading' }))
    const r = await window.deck.mcp
      .test(viewToInput(e))
      .catch((err: unknown): McpTestResult => ({ ok: false, error: errorText(err), tools: [], resources: [], prompts: [], ms: 0 }))
    setTests((t) => ({ ...t, [e.name]: r }))
  }

  const setPolicy = (e: McpServerView, tool: string, policy: ToolPolicy): void =>
    saveView(e, { toolPolicies: { ...(e.toolPolicies ?? {}), [tool]: policy } })

  const remove = async (e: McpServerView): Promise<void> => {
    if (!confirm(`Remover o servidor MCP "${e.name}"?`)) return
    setServers(await window.deck.mcp.remove(e.name))
  }

  const importClaude = async (): Promise<void> => {
    let r: Awaited<ReturnType<typeof window.deck.mcp.importClaude>>
    try {
      r = await window.deck.mcp.importClaude()
    } catch (e) {
      return notify(errorText(e))
    }
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
        Variáveis e headers ficam cifrados no cofre do sistema; aqui você só vê o final de cada valor.
      </p>
      {settings && !settings.encryptionAvailable && (
        <p className="small alert-text" role="alert">
          O cofre do sistema não está disponível. Servidores com variáveis ou headers não podem ser salvos até ele voltar.
          {settings.secretsPending && ' Há segredos antigos ainda em texto puro: eles serão cifrados assim que o cofre estiver disponível.'}
        </p>
      )}

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
                <input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} />
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
            {s.secretsLost && <div className="small alert-text">Os segredos deste servidor não puderam ser lidos neste computador. Edite e digite de novo.</div>}
            {Object.keys(s.envMasked ?? {}).length > 0 && (
              <div className="env-list small mono">
                {Object.entries(s.envMasked ?? {}).map(([k, v]) => (
                  <span key={k}>
                    {k}={v}
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
                                    <button className={policy === 'auto' ? 'on' : ''} onClick={() => setPolicy(s, tool.name, 'auto')}>
                                      auto
                                    </button>
                                    <button className={policy === 'ask' ? 'on' : ''} onClick={() => setPolicy(s, tool.name, 'ask')}>
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
