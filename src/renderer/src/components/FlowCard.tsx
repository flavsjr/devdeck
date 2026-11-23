import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { IconMusic } from './Icons'

// Modo Flow: player Spotify (embed oficial, sem OAuth) + timer de foco/pausa.
// Controle completo via Spotify Web API (device, fila, busca) fica para a Fase 2.

function toEmbed(url: string): string | null {
  const uri = /^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)/.exec(url.trim())
  if (uri) return `https://open.spotify.com/embed/${uri[1]}/${uri[2]}`
  const m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/.exec(url)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null
}

const PRESETS = { foco: 25 * 60, pausa: 5 * 60 } as const
type Mode = keyof typeof PRESETS

function FocusTimer() {
  const [mode, setMode] = useState<Mode>('foco')
  const [left, setLeft] = useState<number>(PRESETS.foco)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])

  // Fim do ciclo: efeito separado (updaters de estado não podem ter efeitos colaterais).
  useEffect(() => {
    if (!running || left > 0) return
    setRunning(false)
    new Notification('DevDeck', { body: mode === 'foco' ? 'Hora da pausa! ☕' : 'Bora voltar pro foco 🎧' })
    if (mode === 'foco') void window.deck.achievements.focusCompleted()
  }, [left, running, mode])

  const switchMode = (m: Mode): void => {
    setMode(m)
    setLeft(PRESETS[m])
    setRunning(false)
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const pct = 100 - (left / PRESETS[mode]) * 100

  return (
    <div className="timer">
      <div className="seg">
        <button className={mode === 'foco' ? 'on' : ''} onClick={() => switchMode('foco')}>
          Foco 25
        </button>
        <button className={mode === 'pausa' ? 'on' : ''} onClick={() => switchMode('pausa')}>
          Pausa 5
        </button>
      </div>
      <div className="timer-clock">
        {mm}:{ss}
      </div>
      <div className="timer-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-actions">
        <button className="btn sm primary" onClick={() => setRunning(!running)}>
          {running ? 'Pausar' : left === 0 ? 'Reiniciar' : 'Iniciar'}
        </button>
        <button className="btn sm ghost" onClick={() => switchMode(mode)}>
          Zerar
        </button>
      </div>
    </div>
  )
}

export function FlowCard() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const embed = settings?.spotifyUrl ? toEmbed(settings.spotifyUrl) : null

  const saveUrl = async (): Promise<void> => {
    if (!toEmbed(draft)) return
    setSettings(await window.deck.settings.update({ spotifyUrl: draft.trim() }))
    setDraft('')
  }

  return (
    <div className={`flow ${open ? 'open' : ''}`}>
      <div className="flow-head" onClick={() => setOpen(!open)}>
        <IconMusic size={14} /> <span>Flow</span>
        <span className="spacer" />
        <span className="muted small">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="flow-body">
          <FocusTimer />
          {embed ? (
            <>
              <iframe
                className="spotify"
                src={embed}
                title="Spotify"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
              <button className="link small" onClick={() => void window.deck.settings.update({ spotifyUrl: '' }).then(setSettings)}>
                trocar playlist
              </button>
            </>
          ) : (
            <div className="spotify-setup">
              <input
                placeholder="Cole o link de uma playlist do Spotify"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void saveUrl()}
              />
              <button className="btn sm ghost" disabled={!toEmbed(draft)} onClick={() => void saveUrl()}>
                Salvar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
