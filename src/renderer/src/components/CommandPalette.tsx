import { useMemo, useState, type ReactElement } from 'react'
import { useStore } from '../store'
import { runAction, VIEW_LABEL } from '../commands'
import { fuzzyFilter } from '../lib/fuzzy'
import { keysFor, type ShortcutAction } from '../lib/shortcuts'
import { basename } from '../format'
import { Modal } from './Modal'
import { IconChat, IconFolder, IconKeyboard, IconPanelLeft, IconPanelRight, IconPlus, IconSearch } from './Icons'

// Paleta de comandos (H04.6): Ctrl+K, busca aproximada, só teclado. Sem "Aprovar" (Cybersecurity B4).

interface Command {
  id: string
  label: string
  group: string
  keywords?: string
  keys?: string
  icon?: ReactElement
  disabled?: boolean
  run: () => void
}

const VIEW_KEYWORDS: Partial<Record<string, string>> = {
  changes: 'diff git status descartar',
  mcp: 'servidores ferramentas testar mcp conectar',
  profile: 'github gitlab bitbucket conquistas xp nivel',
  agenda: 'calendario eventos daily reuniao ics',
  community: 'feed posts artigos snippets',
  costs: 'gastos tokens dinheiro orcamento',
  settings: 'config modelo chave api preferencias'
}

export function CommandPalette() {
  const setPalette = useStore((s) => s.setPalette)
  const sessions = useStore((s) => s.sessions)
  const workspace = useStore((s) => s.workspace)
  const activeId = useStore((s) => s.activeId)
  const openSession = useStore((s) => s.openSession)
  const pickWorkspace = useStore((s) => s.pickWorkspace)
  const ui = useStore((s) => s.ui)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const commands = useMemo<Command[]>(() => {
    const act = (a: ShortcutAction): (() => void) => () => runAction(a)
    const base: Command[] = [
      { id: 'newChat', label: 'Novo chat', group: 'Ações', keys: keysFor('newChat'), icon: <IconPlus size={15} />, disabled: !workspace, run: act('newChat') },
      { id: 'focus', label: 'Escrever mensagem', group: 'Ações', keywords: 'composer prompt digitar', keys: keysFor('focusComposer'), icon: <IconChat size={15} />, run: act('focusComposer') },
      { id: 'ws', label: workspace ? 'Trocar pasta do projeto' : 'Abrir pasta do projeto', group: 'Ações', keywords: 'workspace projeto pasta abrir', icon: <IconFolder size={15} />, run: () => void pickWorkspace() },
      { id: 'sidebar', label: ui.sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral', group: 'Layout', keys: keysFor('toggleSidebar'), icon: <IconPanelLeft size={15} />, run: act('toggleSidebar') },
      { id: 'right', label: ui.rightPanelOpen ? 'Ocultar painel direito' : 'Mostrar painel direito', group: 'Layout', keywords: 'aprovacoes previa hoje flow', keys: keysFor('toggleRightPanel'), icon: <IconPanelRight size={15} />, run: act('toggleRightPanel') },
      { id: 'help', label: 'Atalhos de teclado', group: 'Ajuda', keywords: 'teclas ajuda', keys: keysFor('help'), icon: <IconKeyboard size={15} />, run: act('help') }
    ]
    const views: Command[] = (Object.keys(VIEW_LABEL) as (keyof typeof VIEW_LABEL)[]).map((v) => ({
      id: `view:${v}`,
      label: `Ir para ${VIEW_LABEL[v]}`,
      group: 'Navegar',
      keywords: VIEW_KEYWORDS[v],
      keys: keysFor(`view:${v}` as ShortcutAction),
      run: act(`view:${v}` as ShortcutAction)
    }))
    const chats: Command[] = sessions
      .filter((s) => s.cwd === workspace && s.id !== activeId)
      .slice(0, 30)
      .map((s) => ({ id: `chat:${s.id}`, label: s.title, group: 'Chats', keywords: 'chat sessao conversa', icon: <IconChat size={15} />, run: () => void openSession(s.id) }))
    return [...views, ...base, ...chats]
  }, [sessions, workspace, activeId, ui, openSession, pickWorkspace])

  const results = useMemo(() => fuzzyFilter(commands, query, (c) => c.label, (c) => `${c.group} ${c.keywords ?? ''}`, 40), [commands, query])
  const current = Math.min(active, Math.max(0, results.length - 1))

  const run = (c: Command | undefined): void => {
    if (!c || c.disabled) return
    setPalette(false)
    // Fecha antes de agir: o Modal devolve o foco e a ação pode movê-lo de novo (ex.: Escrever mensagem).
    requestAnimationFrame(c.run)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((current + 1) % Math.max(1, results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current - 1 + results.length) % Math.max(1, results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[current])
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : results.length - 1)
    }
  }

  return (
    <Modal labelledBy="palette-title" placement="top" className="palette" onClose={() => setPalette(false)}>
      <h2 id="palette-title" className="sr-only">
        Paleta de comandos
      </h2>
      <div className="palette-input">
        <IconSearch size={16} />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[current] ? `cmd-${results[current].id}` : undefined}
          aria-label="Buscar comando, aba ou chat"
          placeholder="Buscar comando, aba ou chat…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label="Resultados" className="palette-list">
        {results.length === 0 && (
          <li className="palette-empty" role="presentation">
            Nada encontrado para “{query}”. Tente o nome de uma aba ou de um chat.
          </li>
        )}
        {results.map((c, i) => (
          <li
            key={c.id}
            id={`cmd-${c.id}`}
            role="option"
            aria-selected={i === current}
            aria-disabled={c.disabled || undefined}
            className={`palette-item ${i === current ? 'active' : ''} ${c.disabled ? 'disabled' : ''}`}
            onMouseMove={() => i !== current && setActive(i)}
            onClick={() => run(c)}
          >
            <span className="palette-icon">{c.icon}</span>
            <span className="palette-label">{c.label}</span>
            <span className="palette-group">{c.group}</span>
            {c.keys && <kbd>{c.keys}</kbd>}
          </li>
        ))}
      </ul>
      <div className="palette-foot small muted">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navegar
        </span>
        <span>
          <kbd>Enter</kbd> executar
        </span>
        {workspace && <span className="palette-ws mono">{basename(workspace)}</span>}
      </div>
    </Modal>
  )
}
