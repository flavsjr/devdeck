import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { DiffView } from './DiffView'
import { IconPause, IconRefresh } from './Icons'

// Revisão pós-aplicação: tudo que mudou no workspace segundo o git.

function GitPaused({ reasons }: { reasons: string[] }) {
  const review = useStore((s) => s.reviewGitTrust)
  return (
    <div className="git-paused" role="status">
      <IconPause size={22} />
      <h2>Git pausado neste workspace</h2>
      <p className="muted">As configurações do git deste repositório podem executar programas (ex.: core.fsmonitor). Nada foi executado.</p>
      <ul className="git-paused-reasons">
        {reasons.slice(0, 8).map((r, i) => (
          <li key={i} className="mono">
            {r}
          </li>
        ))}
        {reasons.length > 8 && <li className="muted">… e mais {reasons.length - 8}</li>}
      </ul>
      <button className="btn primary" onClick={() => void review()}>
        Revisar configurações…
      </button>
    </div>
  )
}

export function ChangesView() {
  const workspace = useStore((s) => s.workspace)
  const status = useStore((s) => s.git)
  const refresh = useStore((s) => s.refreshGit)
  const notify = useStore((s) => s.notify)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string; before: string; after: string } | null>(null)

  useEffect(() => {
    if (selected && status && !status.files.some((f) => f.path === selected)) setSelected(null)
  }, [status, selected])

  useEffect(() => {
    setDiff(null)
    if (!selected) return
    let alive = true
    // Troca rápida de arquivo: só a resposta do arquivo ainda selecionado entra.
    window.deck.git
      .diff(selected)
      .then((d) => alive && setDiff({ path: selected, ...d }))
      .catch((e: unknown) => alive && notify(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [selected, notify])

  const restore = async (path: string): Promise<void> => {
    if (!confirm(`Descartar TODAS as alterações não commitadas em ${path}? Isso não pode ser desfeito.`)) return
    try {
      await window.deck.git.restore(path)
      setSelected(null)
      await refresh()
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e))
    }
  }

  if (!workspace) return <div className="view-pad muted">Abra um workspace.</div>
  if (status && !status.isRepo) return <div className="view-pad muted">Este workspace não é um repositório git.</div>
  if (status?.paused) return <GitPaused reasons={status.paused.reasons} />

  const sel = status?.files.find((f) => f.path === selected)

  return (
    <div className="changes">
      <div className="changes-list">
        <div className="panel-title">
          Alterações {status?.branch && <span className="muted small">· {status.branch}</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={() => void refresh()} title="Atualizar" aria-label="Atualizar alterações">
            <IconRefresh size={14} />
          </button>
        </div>
        {status?.files.length === 0 && <div className="muted small pad">Working tree limpa.</div>}
        {status?.files.map((f) => (
          <div key={f.path} className={`change-row ${f.path === selected ? 'active' : ''}`} onClick={() => setSelected(f.path)}>
            <span className={`git-badge s-${f.status.replace(/\?/g, 'u')}`}>{f.status}</span>
            <span className="change-path" title={f.path}>
              {f.path}
            </span>
          </div>
        ))}
      </div>
      <div className="changes-diff">
        {sel && diff?.path === sel.path ? (
          <>
            <div className="panel-title">
              <span className="mono">{sel.path}</span>
              <span className="spacer" />
              {sel.status !== '??' && (
                <button className="btn danger sm" onClick={() => void restore(sel.path)}>
                  Descartar arquivo
                </button>
              )}
            </div>
            <DiffView before={diff.before} after={diff.after} />
          </>
        ) : (
          <div className="muted pad">Selecione um arquivo para ver o diff.</div>
        )}
      </div>
    </div>
  )
}
