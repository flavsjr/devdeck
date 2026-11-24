import { useEffect, useRef, useState } from 'react'
import type { ApprovalRequest, FileContent, Occurrence } from '@shared/types'
import { clampPanelWidth, RIGHT_PANEL_DEFAULT, RIGHT_PANEL_MAX, RIGHT_PANEL_MIN } from '@shared/layout'
import { useStore } from '../store'
import { bytes } from '../format'
import { runAction } from '../commands'
import { keysFor, matchApprovalKey } from '../lib/shortcuts'
import { DiffView } from './DiffView'
import { FlowCard } from './FlowCard'
import { OccurrenceRow } from './AgendaView'
import { IconCalendar, IconPanelRight, IconX } from './Icons'

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
  // Janela de guarda (B4): teclas nos primeiros 600 ms depois que o card aparece ou muda são ignoradas.
  const shownAt = useRef(Date.now())
  useEffect(() => {
    shownAt.current = Date.now()
  }, [a.id, a.after, a.command])
  const decide = (approve: boolean, always = false): void => {
    void window.deck.agent.decide(a.id, approve ? { approve: true, alwaysForSession: always } : { approve: false, feedback })
  }
  const isFile = a.kind === 'edit' || a.kind === 'write'
  // Prévia parcial = aprovar sem ver tudo: "Aprovar todas da sessão" fica desabilitado (mesmo risco do B4).
  const [diffPartial, setDiffPartial] = useState(false)
  const partialPreview = Boolean(a.previewPartial) || diffPartial
  const target = isFile ? a.relPath : a.title

  // Alt+A / Alt+R só com o foco dentro deste card e para este approvalId; Alt+A nunca liga "sempre".
  const onKeyDown = (e: React.KeyboardEvent): void => {
    // Dentro do campo de comentário, Alt+A/Alt+R não aprovam nem rejeitam.
    if ((e.target as HTMLElement).closest('textarea, input')) return
    const hit = matchApprovalKey(
      { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, repeat: e.repeat, isComposing: e.nativeEvent.isComposing, altGraph: e.getModifierState('AltGraph') },
      shownAt.current,
      Date.now()
    )
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    decide(hit === 'approve')
  }

  return (
    <section className="approval" tabIndex={-1} data-approval={a.id} aria-label={`Aprovação: ${target}`} onKeyDown={onKeyDown}>
      <div className="approval-head">
        <span className={`kind ${a.kind}`}>{a.kind === 'command' ? 'comando' : isFile ? (a.isNewFile ? 'novo arquivo' : 'edição') : 'ferramenta'}</span>
        <span className="approval-title" title={a.title}>
          {isFile ? a.relPath : a.title}
        </span>
      </div>

      {a.scope && (
        <p className="approval-scope" role="note">
          <span className="scope-badge">{a.scope === 'outside' ? 'fora do workspace' : 'pasta sensível'}</span>
          {a.scope === 'outside'
            ? ' Este caminho fica fora do workspace. "Sempre nesta sessão" vale só dentro dele, por isso o DevDeck pergunta de novo.'
            : ' Este caminho está numa pasta sensível (.git, .claude, .github…). Confira antes de aprovar.'}
        </p>
      )}
      {isFile && a.previewError && (
        <p className="approval-warn" role="note">
          {a.previewError}
        </p>
      )}
      {isFile && <DiffView before={a.before} after={a.after} truncated={a.previewPartial} onPartial={setDiffPartial} />}
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
        <button className="btn primary" onClick={() => decide(true)} aria-keyshortcuts="Alt+A">
          Aprovar <kbd className="on-primary">Alt+A</kbd>
        </button>
        {a.allowAlways !== false && (
        <button
          className="btn ghost"
          disabled={isFile && partialPreview}
          title={
            isFile && partialPreview
              ? 'Prévia parcial: aprove esta edição sozinha, depois de conferir'
              : isFile
                ? 'Aprovar esta e as próximas edições desta sessão'
                : `Sempre permitir ${a.toolName} nesta sessão`
          }
          onClick={() => decide(true, true)}
        >
          {isFile ? 'Aprovar todas da sessão' : 'Sempre nesta sessão'}
        </button>
        )}
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
            <button className="btn danger" onClick={() => decide(false)} aria-keyshortcuts="Alt+R">
              Rejeitar
            </button>
          </>
        )}
      </div>
    </section>
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
        <button className="icon-btn" onClick={() => preview(null)} title="Fechar prévia (Esc)" aria-label="Fechar prévia">
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

/** Divisor arrastável (mouse) e ajustável por setas (teclado), entre 320 e 640 px. */
function Resizer() {
  const width = useStore((s) => s.ui.rightPanelWidth)
  const setUi = useStore((s) => s.setUi)
  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent): void => setUi({ rightPanelWidth: clampPanelWidth(startW + (startX - ev.clientX)) })
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') setUi({ rightPanelWidth: clampPanelWidth(width + step) })
    else if (e.key === 'ArrowRight') setUi({ rightPanelWidth: clampPanelWidth(width - step) })
    else if (e.key === 'Home') setUi({ rightPanelWidth: RIGHT_PANEL_MAX })
    else if (e.key === 'End') setUi({ rightPanelWidth: RIGHT_PANEL_MIN })
    else return
    e.preventDefault()
  }
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do painel direito"
      aria-valuemin={RIGHT_PANEL_MIN}
      aria-valuemax={RIGHT_PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setUi({ rightPanelWidth: RIGHT_PANEL_DEFAULT })}
    />
  )
}

/** Painel recolhido: faixa com o botão de abrir e contadores. O conteúdo não existe no DOM (não recebe foco nem clique). */
function CollapsedStrip({ others }: { others: number }) {
  const setView = useStore((s) => s.setView)
  return (
    <aside className="right collapsed" aria-label="Painel direito (recolhido)">
      <button className="icon-btn" onClick={() => runAction('toggleRightPanel')} aria-label="Mostrar painel direito" data-tip-left={`Mostrar painel · ${keysFor('toggleRightPanel')}`}>
        <IconPanelRight size={16} />
      </button>
      {others > 0 && (
        <button className="strip-badge" onClick={() => setView('chat')} aria-label={`${others} aprovação(ões) em outros chats`} data-tip-left="Aprovações em outros chats">
          {others}
        </button>
      )}
      <button className="icon-btn" onClick={() => setView('agenda')} aria-label="Abrir agenda" data-tip-left="Agenda">
        <IconCalendar size={16} />
      </button>
    </aside>
  )
}

export function RightPanel({ open, locked, overlay }: { open: boolean; locked: boolean; overlay: boolean }) {
  const activeId = useStore((s) => s.activeId)
  const approvals = useStore((s) => s.approvals)
  const previewPath = useStore((s) => s.previewPath)
  const preview = useStore((s) => s.preview)
  const mine = approvals.filter((a) => a.sessionId === activeId)
  const others = approvals.length - mine.length

  // Esc fecha a prévia de arquivo (fora de campos e diálogos).
  useEffect(() => {
    if (!previewPath) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      preview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewPath, preview])

  if (!open) return <CollapsedStrip others={others} />

  return (
    <aside className={`right ${overlay ? 'overlay' : ''}`} aria-label="Painel direito">
      {!overlay && <Resizer />}
      <div className="right-head">
        <span className="sr-only" aria-live="polite">
          {mine.length > 0 ? `${mine.length} aprovação(ões) aguardando você` : ''}
        </span>
        <span className="spacer" />
        <button
          className="icon-btn"
          onClick={() => runAction('toggleRightPanel')}
          disabled={locked}
          aria-label={locked ? 'Painel fixo enquanto houver aprovação pendente' : 'Ocultar painel direito'}
          data-tip-left={locked ? 'Fixo até você decidir a aprovação' : `Ocultar painel · ${keysFor('toggleRightPanel')}`}
        >
          <IconPanelRight size={16} />
        </button>
      </div>
      <div className="right-main">
        {mine.length > 0 ? (
          <div className="approvals">
            <div className="panel-title" id="approvals-title">
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
