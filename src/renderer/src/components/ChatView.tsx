import { useEffect, useRef, useState } from 'react'
import type { ChatItem } from '@shared/types'
import { errorText } from '@shared/lib/errorText'
import { useStore } from '../store'
import { basename, duration, usd } from '../format'
import { Markdown } from './Markdown'
import { DiffView } from './DiffView'
import { AgentErrorCard } from './AgentErrorCard'
import { IconSend, IconStop, IconX } from './Icons'
import { Logo } from './Logo'
import { keysFor } from '../lib/shortcuts'
import { mensagemParaRepetir } from '../lib/agentErrorCard'

const EMPTY: ChatItem[] = []

function ToolRow({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false)
  const state = item.result === undefined ? 'running' : item.isError ? 'error' : 'ok'
  return (
    <div className={`tool-row ${state}`}>
      <button className="tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tool-state" aria-label={state === 'running' ? 'rodando' : state === 'error' ? 'erro' : 'ok'} role="img" />
        <span className="tool-name">{item.name.replace(/^mcp__/, 'mcp:')}</span>
        <span className="tool-summary">{item.summary}</span>
      </button>
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
    if (!r.ok) notify({ tipo: 'erro', texto: r.error ? errorText(r.error) : `Não foi possível reverter a alteração em ${basename(item.filePath)}.` })
  }
  return (
    <div className={`change-card ${item.reverted ? 'reverted' : ''}`}>
      <div className="change-head">
        <span className="change-kind">{item.created ? 'novo' : 'editado'}</span>
        <button className="change-file" title={item.filePath} onClick={() => setOpen(!open)} aria-expanded={open}>
          {basename(item.filePath)}
        </button>
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

interface ItemProps {
  sessionId: string
  item: ChatItem
  /** Itens da sessão (o card de erro descobre se é do último turno). */
  items: ChatItem[]
  busy: boolean
  /** Quando o ChatView montou: card de erro mais novo que isso acabou de chegar e é anunciado. */
  montadoEm: number
}

function Item({ sessionId, item, items, busy, montadoEm }: ItemProps) {
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
          {item.isError ? 'Falhou · ' : 'Concluído · '}
          {item.turns} {item.turns === 1 ? 'passo' : 'passos'} · {duration(item.durationMs)} · {usd(item.costUsd, 4)}
          {item.errors?.length ? <div className="small">{item.errors.join(' · ')}</div> : null}
        </div>
      )
    case 'error':
      // Item antigo, sem código: como antes (texto já gravado em PT-BR).
      if (!item.code) return <div className="msg error">{item.text}</div>
      return (
        <AgentErrorCard
          sessionId={sessionId}
          item={item}
          podeRepetir={mensagemParaRepetir(items, item.id) !== null}
          ocupado={busy}
          anunciar={item.ts >= montadoEm}
        />
      )
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
  const [montadoEm] = useState(() => Date.now())

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
            <div className="logo-hero">
              <Logo size={44} />
            </div>
            <h2>{workspace ? 'Pronto para o próximo passo' : 'Abra um projeto para começar'}</h2>
            <p className="muted">
              {workspace ? 'Escreva abaixo o que você quer fazer neste workspace.' : 'Escolha a pasta do projeto na barra lateral ou pela paleta de comandos.'}
            </p>
            <dl className="empty-keys">
              <dt>
                <kbd>{keysFor('palette')}</kbd>
              </dt>
              <dd>Paleta de comandos: abas, chats e ações</dd>
              <dt>
                <kbd>@</kbd>
              </dt>
              <dd>Na árvore de arquivos, anexa o arquivo ao contexto</dd>
              <dt>
                <kbd>Alt+A</kbd>
              </dt>
              <dd>Aprova a alteração focada no painel; nada é aplicado sem você</dd>
              <dt>
                <kbd>{keysFor('help')}</kbd>
              </dt>
              <dd>Todos os atalhos</dd>
            </dl>
          </div>
        )}
        {activeId && items.map((it) => <Item key={it.id} sessionId={activeId} item={it} items={items} busy={busy} montadoEm={montadoEm} />)}
        {streaming && (
          <div className="msg assistant streaming">
            <Markdown text={streaming} />
          </div>
        )}
        {busy && !streaming && pendingCount === 0 && <div className="thinking">Claude está trabalhando…</div>}
      </div>

      {pendingCount > 0 && (
        <div className="pending-banner" role="status">
          <span>
            <b>{pendingCount}</b> {pendingCount === 1 ? 'alteração aguarda' : 'alterações aguardam'} sua aprovação
          </span>
          <button
            className="btn sm"
            onClick={() => document.querySelector<HTMLElement>('[data-approval]')?.focus()}
            title="Leva o foco ao cartão de aprovação (depois use Alt+A ou Alt+R)"
          >
            Revisar
          </button>
        </div>
      )}

      <div className="composer">
        {contextFiles.length > 0 && (
          <div className="ctx-chips">
            {contextFiles.map((c) => (
              <span key={c} className="chip removable">
                @{c}
                <button onClick={() => toggleContextFile(c)} title="Remover" aria-label={`Remover ${c} do contexto`}>
                  <IconX size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <textarea
            id="composer"
            aria-label="Mensagem para o Claude"
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
