import { useCallback, useEffect, useState } from 'react'
import type { GitStatus } from '@shared/types'
import { useStore } from '../store'
import { DiffView } from './DiffView'
import { IconRefresh } from './Icons'

// Revisão pós-aplicação: tudo que mudou no workspace segundo o git.

export function ChangesView() {
  const workspace = useStore((s) => s.workspace)
  const treeVersion = useStore((s) => s.treeVersion)
  const notify = useStore((s) => s.notify)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ before: string; after: string } | null>(null)

  const refresh = useCallback(() => {
    window.deck.git
      .status()
      .then((s) => {
        setStatus(s)
        if (selected && !s.files.some((f) => f.path === selected)) setSelected(null)
      })
      .catch((e: unknown) => notify(e instanceof Error ? e.message : String(e)))
  }, [selected, notify])

  useEffect(refresh, [workspace, treeVersion])

  useEffect(() => {
    setDiff(null)
    if (selected) void window.deck.git.diff(selected).then(setDiff)
  }, [selected])

  const restore = async (path: string): Promise<void> => {
    if (!confirm(`Descartar TODAS as alterações não commitadas em ${path}? Isso não pode ser desfeito.`)) return
    try {
      await window.deck.git.restore(path)
      refresh()
      setSelected(null)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e))
    }
  }

  if (!workspace) return <div className="view-pad muted">Abra um workspace.</div>
  if (status && !status.isRepo) return <div className="view-pad muted">Este workspace não é um repositório git.</div>

  const sel = status?.files.find((f) => f.path === selected)

  return (
    <div className="changes">
      <div className="changes-list">
        <div className="panel-title">
          Alterações {status?.branch && <span className="muted small">· {status.branch}</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={refresh} title="Atualizar">
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
        {sel && diff ? (
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
