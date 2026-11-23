import { useEffect, useRef, useState } from 'react'
import type { ChatItem } from '@shared/types'
import { useStore } from '../store'
import { basename, duration, usd } from '../format'
import { Markdown } from './Markdown'
import { DiffView } from './DiffView'
import { IconSend, IconStop, IconX } from './Icons'

const EMPTY: ChatItem[] = []

function ToolRow({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const state = item.result === undefined ? 'running' : item.isError ? 'error' : 'ok'
  return (
    <div className={`tool-row ${state}`}>
      <div className="tool-head" onClick={() => setOpen(!open)}>
        <span className="tool-state" />
        <span className="tool-name">{item.name.replace(/^mcp__/, 'mcp:')}</span>
        <span className="tool-summary">{item.summary}</span>
      </div>
      {open && (
        <div className="tool-body">
          <div className="label">Entrada</div>
          <pre>{JSON.stringify(item.input, null, 2)}</pre>
          {item.result !== undefined && (
            <>
              <div className="label">{item.isError ? 'Erro' : 'Resultado'}</div>
              <pre>{item.result || '(vazio)'}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ChangeCard({ sessionId, item }: { sessionId: string; item: Extract<ChatItem, { kind: 'change' }> }) {
  const [open, setOpen] = useState(false)
  const notify = useStore((s) => s.notify)
  const revert = async (): Promise<void> => {
    const msg = item.created
      ? `Reverter vai APAGAR o arquivo criado ${basename(item.filePath)}. Continuar?`
      : `Reverter a alteração em ${basename(item.filePath)}?`
    if (!confirm(msg)) return
    const r = await window.deck.agent.revertChange(sessionId, item.id)
    if (!r.ok) notify(r.error ?? 'Falha ao reverter.')
  }
  return (
    <div className={`change-card ${item.reverted ? 'reverted' : ''}`}>
      <div className="change-head">
        <span className="change-kind">{item.created ? 'novo' : 'editado'}</span>
        <span className="change-file" title={item.filePath} onClick={() => setOpen(!open)}>
          {basename(item.filePath)}
        </span>
        {item.reverted ? (
          <span className="muted small">revertido</span>
        ) : (
          <button className="btn ghost sm" onClick={() => void revert()}>
            Reverter
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          {open ? 'Ocultar diff' : 'Ver diff'}
        </button>
      </div>
      {open && <DiffView patch={item.patch} compact />}
    </div>
  )
}

function Item({ sessionId, item }: { sessionId: string; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="msg user">
          <div className="bubble">
            {item.text}
            {item.context && (
              <div className="ctx-chips">
                {item.context.map((c) => (
                  <span key={c} className="chip">
                    @{c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="msg assistant">
          <Markdown text={item.text} />
        </div>
      )
    case 'tool':
      return <ToolRow item={item} />
    case 'change':
      return <ChangeCard sessionId={sessionId} item={item} />
    case 'result':
      return (
        <div className={`turn-result ${item.isError ? 'error' : ''}`}>
          {item.isError ? '✕ ' : '✓ '}
          {item.turns} {item.turns === 1 ? 'passo' : 'passos'} · {duration(item.durationMs)} · {usd(item.costUsd, 4)}
          {item.errors?.length ? <div className="small">{item.errors.join(' · ')}</div> : null}
        </div>
      )
    case 'error':
      return <div className="msg error">{item.text}</div>
    default:
      return null
  }
}

export function ChatView() {
  const activeId = useStore((s) => s.activeId)
  const items = useStore((s) => (s.activeId ? s.items[s.activeId] ?? EMPTY : EMPTY))
  const streaming = useStore((s) => (s.activeId ? s.streaming[s.activeId] ?? '' : ''))
  const busy = useStore((s) => (s.activeId ? Boolean(s.busy[s.activeId]) : false))
  const pendingCount = useStore((s) => s.approvals.filter((a) => a.sessionId === s.activeId).length)
  const contextFiles = useStore((s) => s.contextFiles)
  const toggleContextFile = useStore((s) => s.toggleContextFile)
  const workspace = useStore((s) => s.workspace)
  const send = useStore((s) => s.send)
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, streaming, activeId])

  const submit = (): void => {
    if (!text.trim() || busy) return
    void send(text)
    setText('')
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {!activeId && (
          <div className="empty">
            <h2>DevDeck</h2>
            <p>{workspace ? 'Escreva abaixo para começar um chat neste workspace.' : 'Abra uma pasta de projeto na barra lateral para começar.'}</p>
            <ul className="muted">
              <li>
                Clique em <b>@</b> na árvore para anexar arquivos ao contexto.
              </li>
              <li>Edições e comandos param no painel da direita para você aprovar ou rejeitar.</li>
              <li>Custos por turno, sessão e dia ficam na barra de status e na aba Custos.</li>
            </ul>
          </div>
        )}
        {activeId && items.map((it) => <Item key={it.id} sessionId={activeId} item={it} />)}
        {streaming && (
          <div className="msg assistant streaming">
            <Markdown text={streaming} />
          </div>
        )}
        {busy && !streaming && pendingCount === 0 && <div className="thinking">Claude está trabalhando…</div>}
      </div>

      {pendingCount > 0 && <div className="pending-banner">{pendingCount} aprovação(ões) aguardando você no painel à direita →</div>}

      <div className="composer">
        {contextFiles.length > 0 && (
          <div className="ctx-chips">
            {contextFiles.map((c) => (
              <span key={c} className="chip removable">
                @{c}
                <button onClick={() => toggleContextFile(c)} title="Remover">
                  <IconX size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <textarea
            value={text}
            placeholder={workspace ? 'Peça algo ao Claude… (Enter envia, Shift+Enter quebra linha)' : 'Abra um workspace primeiro'}
            disabled={!workspace}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={3}
          />
          {busy ? (
            <button className="btn danger" title="Interromper" onClick={() => activeId && void window.deck.agent.interrupt(activeId)}>
              <IconStop size={16} /> Parar
            </button>
          ) : (
            <button className="btn primary" title="Enviar" onClick={submit} disabled={!text.trim() || !workspace}>
              <IconSend size={16} /> Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
