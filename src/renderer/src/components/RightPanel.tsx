import { useEffect, useState } from 'react'
import type { ApprovalRequest, FileContent, Occurrence } from '@shared/types'
import { useStore } from '../store'
import { bytes } from '../format'
import { DiffView } from './DiffView'
import { FlowCard } from './FlowCard'
import { OccurrenceRow } from './AgendaView'
import { IconX } from './Icons'

function TodayAgenda() {
  const agendaVersion = useStore((s) => s.agendaVersion)
  const setView = useStore((s) => s.setView)
  const [items, setItems] = useState<Occurrence[]>([])

  useEffect(() => {
    const load = (): void => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      void window.deck.agenda.occurrences(start.getTime(), start.getTime() + 86_400_000).then(setItems)
    }
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [agendaVersion])

  return (
    <div className="today">
      <div className="panel-title">
        Hoje
        <span className="spacer" />
        <button className="link small" onClick={() => setView('agenda')}>
          agenda ›
        </button>
      </div>
      {items.length === 0 && <div className="muted small pad">Nada marcado para hoje.</div>}
      {items.map((o) => (
        <OccurrenceRow key={o.key} o={o} />
      ))}
    </div>
  )
}

function ApprovalCard({ a }: { a: ApprovalRequest }) {
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const decide = (approve: boolean, always = false): void => {
    void window.deck.agent.decide(a.id, approve ? { approve: true, alwaysForSession: always } : { approve: false, feedback })
  }
  const isFile = a.kind === 'edit' || a.kind === 'write'

  return (
    <div className="approval">
      <div className="approval-head">
        <span className={`kind ${a.kind}`}>{a.kind === 'command' ? 'comando' : isFile ? (a.isNewFile ? 'novo arquivo' : 'edição') : 'ferramenta'}</span>
        <span className="approval-title" title={a.title}>
          {isFile ? a.relPath : a.title}
        </span>
      </div>

      {isFile && <DiffView before={a.before} after={a.after} />}
      {a.kind === 'command' && (
        <div className="approval-cmd">
          {a.description && <div className="muted small">{a.description}</div>}
          <pre>{a.command}</pre>
        </div>
      )}
      {a.kind === 'tool' && (
        <div className="approval-cmd">
          <div className="muted small">{a.toolName}</div>
          <pre>{JSON.stringify(a.input, null, 2)}</pre>
        </div>
      )}

      {showFeedback && (
        <textarea
          className="feedback"
          autoFocus
          placeholder="O que mudar? (vai para o Claude como motivo da rejeição)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
        />
      )}

      <div className="approval-actions">
        <button className="btn primary" onClick={() => decide(true)}>
          Aprovar
        </button>
        <button
          className="btn ghost"
          title={isFile ? 'Aprovar esta e as próximas edições desta sessão' : `Sempre permitir ${a.toolName} nesta sessão`}
          onClick={() => decide(true, true)}
        >
          {isFile ? 'Aprovar todas da sessão' : 'Sempre nesta sessão'}
        </button>
        <span className="spacer" />
        {showFeedback ? (
          <button className="btn danger" onClick={() => decide(false)}>
            Rejeitar com comentário
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={() => setShowFeedback(true)}>
              Pedir ajuste
            </button>
            <button className="btn danger" onClick={() => decide(false)}>
              Rejeitar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FilePreview({ path }: { path: string }) {
  const [file, setFile] = useState<FileContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = useStore((s) => s.preview)
  const contextFiles = useStore((s) => s.contextFiles)
  const toggleContextFile = useStore((s) => s.toggleContextFile)

  useEffect(() => {
    setFile(null)
    setError(null)
    window.deck.workspace
      .read(path)
      .then(setFile)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [path])

  return (
    <div className="preview">
      <div className="preview-head">
        <span className="preview-path" title={path}>
          {path}
        </span>
        {file && <span className="muted small">{bytes(file.size)}</span>}
        <button className={`btn sm ${contextFiles.includes(path) ? 'primary' : 'ghost'}`} onClick={() => toggleContextFile(path)}>
          {contextFiles.includes(path) ? '✓ no contexto' : '@ contexto'}
        </button>
        <button className="icon-btn" onClick={() => preview(null)} title="Fechar">
          <IconX size={14} />
        </button>
      </div>
      <div className="preview-body">
        {error && <div className="msg error">{error}</div>}
        {file?.binary && <div className="muted pad">Arquivo binário.</div>}
        {file?.content !== null && file?.content !== undefined && (
          <pre className="code-view">
            {file.content.split('\n').map((l, i) => (
              <div key={i} className="code-line">
                <span className="ln">{i + 1}</span>
                <span>{l}</span>
              </div>
            ))}
            {file.truncated && <div className="muted small pad">… truncado (prévia de 512 KB)</div>}
          </pre>
        )}
      </div>
    </div>
  )
}

export function RightPanel() {
  const activeId = useStore((s) => s.activeId)
  const approvals = useStore((s) => s.approvals)
  const previewPath = useStore((s) => s.previewPath)
  const mine = approvals.filter((a) => a.sessionId === activeId)
  const others = approvals.length - mine.length

  return (
    <aside className="right">
      <div className="right-main">
        {mine.length > 0 ? (
          <div className="approvals">
            <div className="panel-title">
              Aprovações pendentes <span className="badge warn">{mine.length}</span>
            </div>
            {mine.map((a) => (
              <ApprovalCard key={a.id} a={a} />
            ))}
          </div>
        ) : previewPath ? (
          <FilePreview path={previewPath} />
        ) : (
          <div className="right-idle">
            {others > 0 && <p className="small warn-text pad">{others} aprovação(ões) em outros chats.</p>}
            <TodayAgenda />
            <p className="small muted pad">Sem aprovações pendentes. Clique num arquivo da árvore para pré-visualizar.</p>
          </div>
        )}
      </div>
      <FlowCard />
    </aside>
  )
}
