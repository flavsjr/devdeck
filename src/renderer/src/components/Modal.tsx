import { useEffect, useRef, type ReactNode } from 'react'

// Modal acessível (H04.4): prende o Tab dentro, Esc fecha, devolve o foco a quem abriu.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  labelledBy: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** Impede fechar (ex.: enviando). */
  locked?: boolean
  /** Posição: centro (padrão) ou topo (paleta). */
  placement?: 'center' | 'top'
}

export function Modal({ labelledBy, onClose, children, className = '', locked = false, placement = 'center' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = ref.current
    // Foca o primeiro campo marcado com autofocus, senão o primeiro focável, senão o próprio diálogo.
    const first = box?.querySelector<HTMLElement>('[data-autofocus]') ?? box?.querySelector<HTMLElement>(FOCUSABLE) ?? box
    first?.focus()
    return () => {
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!locked) closeRef.current()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={`modal-backdrop ${placement}`} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div ref={ref} className={`modal card ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  )
}
