import { useCallback, useEffect, useState } from 'react'
import type { TreeNode } from '@shared/types'
import { useStore } from '../store'
import { basename, usd } from '../format'
import { IconChevron, IconFile, IconFolder, IconPanelLeft, IconPlus, IconTrash } from './Icons'
import { runAction } from '../commands'
import { keysFor } from '../lib/shortcuts'

/** Setas ↑/↓ andam entre itens visíveis da árvore; Home/End vão às pontas. */
function moveTreeFocus(from: HTMLElement, key: string): boolean {
  const tree = from.closest('[role="tree"]')
  if (!tree) return false
  const items = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')]
  const i = items.indexOf(from)
  const next = key === 'ArrowDown' ? items[i + 1] : key === 'ArrowUp' ? items[i - 1] : key === 'Home' ? items[0] : key === 'End' ? items[items.length - 1] : undefined
  if (!next) return false
  next.focus()
  return true
}

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
            role="treeitem"
            tabIndex={0}
            aria-level={depth + 1}
            aria-expanded={n.dir ? Boolean(open[n.path]) : undefined}
            aria-selected={previewPath === n.path}
            onClick={() => (n.dir ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : preview(n.path))}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (n.dir) setOpen((o) => ({ ...o, [n.path]: !o[n.path] }))
                else preview(n.path)
              } else if (e.key === 'ArrowRight' && n.dir && !open[n.path]) {
                e.preventDefault()
                setOpen((o) => ({ ...o, [n.path]: true }))
              } else if (e.key === 'ArrowLeft' && n.dir && open[n.path]) {
                e.preventDefault()
                setOpen((o) => ({ ...o, [n.path]: false }))
              } else if (e.key === '@') {
                e.preventDefault()
                toggleContextFile(n.path)
              } else if (moveTreeFocus(e.currentTarget, e.key)) {
                e.preventDefault()
              }
            }}
            title={n.path}
          >
            <span className={`chev ${n.dir ? '' : 'hidden'} ${open[n.path] ? 'open' : ''}`}>
              <IconChevron size={12} />
            </span>
            <span className="tree-icon">{n.dir ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
            <span className="tree-name">{n.name}</span>
            <button
              className={`tree-ctx ${contextFiles.includes(n.path) ? 'on' : ''}`}
              tabIndex={-1}
              aria-label={contextFiles.includes(n.path) ? `Remover ${n.name} do contexto` : `Adicionar ${n.name} ao contexto`}
              title={contextFiles.includes(n.path) ? 'Remover do contexto (@)' : 'Adicionar ao contexto (@)'}
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
        <button className={`btn sm ${workspace ? 'ghost' : 'primary'}`} onClick={() => void pickWorkspace()}>
          {workspace ? 'Trocar' : 'Abrir pasta'}
        </button>
        <button className="icon-btn" onClick={() => runAction('toggleSidebar')} aria-label="Ocultar barra lateral" data-tip-left={`Ocultar barra lateral · ${keysFor('toggleSidebar')}`}>
          <IconPanelLeft size={15} />
        </button>
      </div>

      <section className="side-section sessions">
        <div className="side-title">
          <span>Chats</span>
          <button className="icon-btn" title={`Novo chat (${keysFor('newChat')})`} aria-label="Novo chat" onClick={() => void newSession()} disabled={!workspace}>
            <IconPlus size={14} />
          </button>
        </div>
        <div className="session-list">
          {wsSessions.length === 0 && <div className="muted small pad">Nenhum chat neste workspace.</div>}
          {wsSessions.map((s) => {
            const pend = approvals.filter((a) => a.sessionId === s.id).length
            return (
              <div key={s.id} className={`session-row ${s.id === activeId ? 'active' : ''}`} onClick={() => void openSession(s.id)}>
                <span className={`dot ${busy[s.id] ? 'busy' : ''}`} role="img" aria-label={busy[s.id] ? 'trabalhando' : 'parado'} />
                <button className="session-title" aria-current={s.id === activeId ? 'true' : undefined} onClick={(e) => {
                  e.stopPropagation()
                  void openSession(s.id)
                }}>
                  {s.title}
                </button>
                {pend > 0 && <span className="badge warn">{pend}</span>}
                <span className="session-cost">{usd(s.totalCostUsd)}</span>
                <button
                  className="icon-btn hover-only"
                  title="Excluir chat"
                  aria-label={`Excluir o chat ${s.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Excluir o chat "${s.title}"? O histórico local será apagado e não dá para desfazer.`)) void removeSession(s.id)
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
        <div className="tree" role={workspace ? 'tree' : undefined} aria-label={workspace ? 'Arquivos do workspace' : undefined}>{workspace ? <TreeDir key={workspace} rel="" depth={0} /> : <div className="muted small pad">Abra uma pasta para navegar.</div>}</div>
      </section>
    </aside>
  )
}
