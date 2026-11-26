import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react'
import { useStore } from '../store'
import { historicoRecente, naoLidas, type TipoNotificacao } from '../lib/notifications'
import {
  HISTORICO_VAZIO,
  PREFIXO_LEITOR,
  ROTULO_LIMPAR_HISTORICO,
  ROTULO_LISTA_HISTORICO,
  ROTULO_PAINEL_HISTORICO,
  badgeNaoLidas,
  horaExata,
  rotuloRepeticoes,
  rotuloSino,
  tempoRelativo
} from '../lib/notificationText'
import { IconAviso, IconBell, IconConquista, IconErro, IconInfo, IconSucesso } from './Icons'

/*
 * Sino do histórico na barra de status (T48 / H06.9; desenho do UX na Sprint 07). Lê o `historico` do
 * mesmo reducer da pilha (últimas 20 da execução do app). Só informação: as ações das notificações não
 * aparecem aqui (podem ter expirado).
 * - Badge com as não lidas ("9+" a partir de 10), número também no rótulo acessível; abrir marca como lidas.
 * - Painel ancorado acima do sino (position: fixed, porque a barra corta o que sai dela), role="dialog".
 *   Abre com o foco no título; Esc fecha e devolve o foco ao sino; clique fora ou foco saindo fecham sem
 *   roubar o foco. Sem armadilha de Tab.
 * - "Limpar (só desta sessão)" sem confirmação: o histórico não é gravado em disco.
 */

const ICONE: Record<TipoNotificacao, (p: { size?: number }) => ReactElement> = {
  erro: IconErro,
  aviso: IconAviso,
  sucesso: IconSucesso,
  info: IconInfo,
  conquista: IconConquista
}

export function NotificationBell(): ReactElement {
  const estado = useStore((s) => s.notificacoes)
  const despachar = useStore((s) => s.despacharNotificacao)
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<CSSProperties>({})
  const [agora, setAgora] = useState(() => Date.now())
  const caixaRef = useRef<HTMLDivElement>(null)
  const sinoRef = useRef<HTMLButtonElement>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const id = useId()
  const painelId = `${id}-painel`
  const tituloId = `${id}-titulo`

  const n = naoLidas(estado)
  const badge = badgeNaoLidas(n)
  const itens = historicoRecente(estado)

  const fechar = (devolverFoco: boolean): void => {
    setAberto(false)
    if (devolverFoco) sinoRef.current?.focus()
  }
  const posicionar = (): void => {
    const r = sinoRef.current?.getBoundingClientRect()
    if (r) setPosicao({ bottom: window.innerHeight - r.top + 6, right: Math.max(8, window.innerWidth - r.right) })
  }
  const abrir = (): void => {
    posicionar()
    setAgora(Date.now())
    setAberto(true)
  }

  // Aberto: o que chega já é visto (marca como lido também o que entra com o painel na tela).
  useEffect(() => {
    if (aberto) despachar({ type: 'marcarLidas', now: Date.now() })
  }, [aberto, estado.historico, despachar])

  // Ao abrir: foco no título; hora relativa atualizada a cada 30 s; clique fora e redimensionar.
  // Deps só [aberto]: `fechar` e `posicionar` usam apenas setters e refs (estáveis), então a closure da
  // abertura vale até fechar (TL).
  useEffect(() => {
    if (!aberto) return
    tituloRef.current?.focus()
    const t = window.setInterval(() => setAgora(Date.now()), 30_000)
    const fora = (e: MouseEvent): void => {
      if (e.target instanceof Node && !caixaRef.current?.contains(e.target)) fechar(false)
    }
    document.addEventListener('mousedown', fora)
    window.addEventListener('resize', posicionar)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('resize', posicionar)
    }
  }, [aberto])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && aberto) {
      // preventDefault também: outros handlers de Esc (ex.: RightPanel) conferem defaultPrevented.
      e.preventDefault()
      e.stopPropagation()
      fechar(true)
    }
  }

  const limpar = (): void => {
    despachar({ type: 'limparHistorico' })
    tituloRef.current?.focus()
  }

  return (
    <div
      className="sb-bell"
      ref={caixaRef}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Foco saiu do sino e do painel (Tab para fora): fecha sem puxar o foco de volta.
        if (aberto && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) fechar(false)
      }}
    >
      <button
        ref={sinoRef}
        type="button"
        className="sb-item sb-bell-btn"
        aria-label={rotuloSino(n)}
        title={rotuloSino(n)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        data-testid="notify-bell"
        onClick={() => (aberto ? fechar(true) : abrir())}
      >
        <IconBell size={13} />
        {badge && (
          <span className="sb-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>
      {aberto && (
        <div id={painelId} className="bell-panel" role="dialog" aria-labelledby={tituloId} style={posicao} data-testid="notify-history">
          <div className="bell-head">
            <h2 id={tituloId} ref={tituloRef} tabIndex={-1} className="bell-title">
              {ROTULO_PAINEL_HISTORICO}
            </h2>
            {itens.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={limpar}>
                {ROTULO_LIMPAR_HISTORICO}
              </button>
            )}
          </div>
          {itens.length === 0 ? (
            <p className="bell-empty">{HISTORICO_VAZIO}</p>
          ) : (
            // tabIndex 0: a lista rola (até 20 linhas) e precisa ser rolável pelo teclado (axe scrollable-region-focusable).
            <ul className="bell-list" aria-label={ROTULO_LISTA_HISTORICO} tabIndex={0}>
              {itens.map((item) => {
                const Icone = ICONE[item.tipo]
                const rep = rotuloRepeticoes(item.repeticoes)
                return (
                  <li key={item.id} className={`bell-item notify-${item.tipo}`}>
                    <span className="bell-icon" aria-hidden="true">
                      <Icone size={14} />
                    </span>
                    <span className="bell-text">
                      <span className="sr-only">{PREFIXO_LEITOR[item.tipo]} </span>
                      {item.texto}
                      {rep && (
                        <span className="notify-count">
                          <span aria-hidden="true">{rep.visivel}</span>
                          <span className="sr-only">, {rep.leitor}</span>
                        </span>
                      )}
                    </span>
                    <time className="bell-time" dateTime={new Date(item.ultimaEm).toISOString()} title={horaExata(item.ultimaEm)}>
                      {tempoRelativo(item.ultimaEm, agora)}
                    </time>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
