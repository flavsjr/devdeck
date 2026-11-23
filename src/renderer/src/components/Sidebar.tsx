import { useCallback, useEffect, useState } from 'react'
import type { TreeNode } from '@shared/types'
import { useStore } from '../store'
import { basename, usd } from '../format'
import { IconChevron, IconFile, IconFolder, IconPlus, IconTrash } from './Icons'

function TreeDir({ rel, depth }: { rel: string; depth: number }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const treeVersion = useStore((s) => s.treeVersion)
  const contextFiles = useStore((s) => s.contextFiles)
  const previewPath = useStore((s) => s.previewPath)
  const toggleContextFile = useStore((s) => s.toggleContextFile)
  const preview = useStore((s) => s.preview)

  const load = useCallback(() => {
    window.deck.workspace
      .list(rel)
      .then(setNodes)
      .catch(() => setNodes([]))
  }, [rel])

  useEffect(load, [load, treeVersion])

  if (!nodes) return <div className="tree-loading" style={{ paddingLeft: 12 + depth * 12 }}>…</div>

  return (
    <>
      {nodes.map((n) => (
        <div key={n.path}>
          <div
            className={`tree-row ${previewPath === n.path ? 'active' : ''}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => (n.dir ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : preview(n.path))}
            title={n.path}
          >
            <span className={`chev ${n.dir ? '' : 'hidden'} ${open[n.path] ? 'open' : ''}`}>
              <IconChevron size={12} />
            </span>
            <span className="tree-icon">{n.dir ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
            <span className="tree-name">{n.name}</span>
            <button
              className={`tree-ctx ${contextFiles.includes(n.path) ? 'on' : ''}`}
              title={contextFiles.includes(n.path) ? 'Remover do contexto' : 'Adicionar ao contexto (@)'}
              onClick={(e) => {
                e.stopPropagation()
                toggleContextFile(n.path)
              }}
            >
              @
            </button>
          </div>
          {n.dir && open[n.path] && <TreeDir rel={n.path} depth={depth + 1} />}
        </div>
      ))}
    </>
  )
}

export function Sidebar() {
  const workspace = useStore((s) => s.workspace)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const busy = useStore((s) => s.busy)
  const approvals = useStore((s) => s.approvals)
  const pickWorkspace = useStore((s) => s.pickWorkspace)
  const openSession = useStore((s) => s.openSession)
  const newSession = useStore((s) => s.newSession)
  const removeSession = useStore((s) => s.removeSession)

  const wsSessions = sessions.filter((s) => s.cwd === workspace)

  return (
    <aside className="sidebar">
      <div className="ws-header">
        <div className="ws-name" title={workspace ?? ''}>
          {workspace ? basename(workspace) : 'Nenhum workspace'}
        </div>
        <button className="btn ghost sm" onClick={() => void pickWorkspace()}>
          {workspace ? 'Trocar' : 'Abrir pasta'}
        </button>
      </div>

      <section className="side-section sessions">
        <div className="side-title">
          <span>Chats</span>
          <button className="icon-btn" title="Novo chat" onClick={() => void newSession()} disabled={!workspace}>
            <IconPlus size={14} />
          </button>
        </div>
        <div className="session-list">
          {wsSessions.length === 0 && <div className="muted small pad">Nenhum chat neste workspace.</div>}
          {wsSessions.map((s) => {
            const pend = approvals.filter((a) => a.sessionId === s.id).length
            return (
              <div key={s.id} className={`session-row ${s.id === activeId ? 'active' : ''}`} onClick={() => void openSession(s.id)}>
                <span className={`dot ${busy[s.id] ? 'busy' : ''}`} />
                <span className="session-title">{s.title}</span>
                {pend > 0 && <span className="badge warn">{pend}</span>}
                <span className="session-cost">{usd(s.totalCostUsd)}</span>
                <button
                  className="icon-btn hover-only"
                  title="Excluir chat"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Excluir o chat "${s.title}"? O histórico local será apagado.`)) void removeSession(s.id)
                  }}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="side-section files">
        <div className="side-title">
          <span>Arquivos</span>
        </div>
        <div className="tree">{workspace ? <TreeDir key={workspace} rel="" depth={0} /> : <div className="muted small pad">Abra uma pasta para navegar.</div>}</div>
      </section>
    </aside>
  )
}
