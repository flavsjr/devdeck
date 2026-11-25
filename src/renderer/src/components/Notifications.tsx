import { useEffect, useRef, useState, type FocusEvent, type ReactElement } from 'react'
import {
  errosRecolhidos,
  mostrarFecharTodos,
  proximaExpiracao,
  totalFecharTodos,
  type AcaoFila,
  type AcaoNotificacao,
  type EstadoNotificacoes,
  type Notificacao,
  type TipoNotificacao
} from '../lib/notifications'
import {
  PREFIXO_LEITOR,
  ROTULO_FECHAR,
  TITULO_CONQUISTA,
  descricaoErrosRecolhidos,
  detalheConquista,
  esperaAteExpirar,
  gruposExibicao,
  rotuloAcao,
  rotuloErrosRecolhidos,
  rotuloFecharTodos,
  rotuloRepeticoes,
  rotuloXp,
  vizinhaAoFechar
} from '../lib/notificationText'
import { IconAviso, IconConquista, IconErro, IconInfo, IconSucesso, IconX } from './Icons'

/*
 * Pilha de notificações (H06.2, ADR-021). Componente controlado: não guarda a fila, só lê
 * `estado` e despacha `AcaoFila` para quem a guarda (o store, na T10). Quem executa a ação
 * de uma notificação também é o dono do estado, via `onAcao`.
 *
 * Posição (precisa ser renderizado dentro de `.app`, que define --sidebar-w, --right-w e
 * --right-panel-w; detalhes e medidas no bloco "notificações" do shell.css):
 * - Topo da coluna principal, encostada no painel direito. O composer do chat fica no rodapé da
 *   coluna principal e o card de aprovação mora no painel direito, travado aberto enquanto houver
 *   aprovação: a pilha não alcança nenhum dos dois. Em 1280×720, pilha de 360 px numa coluna de 608.
 * - Janela estreita (< 1280 px CSS, ~900 px com zoom) com o painel em sobreposição: a pilha vai
 *   para a esquerda, sobre a barra lateral, e termina antes do painel.
 * - Altura máxima com rolagem, para nunca descer até o composer.
 *
 * Acessibilidade: erro inédito com o texto em role="alert" (erro que volta dos recolhidos não é
 * anunciado de novo); demais tipos e a faixa da conquista numa região role="status" polite sempre
 * montada (mesmo vazia), e o resumo "+N erros" / "Fechar todos (N)" em outra região polite. Nada
 * aqui chama focus() por conta própria: o foco só se move quando o usuário fecha a notificação
 * em que estava (vai para a vizinha ou volta para onde estava antes de entrar na pilha, nunca
 * para o <body>).
 */

export interface NotificationsProps {
  /** Fila atual (reducer `notificacoesReducer`). */
  estado: EstadoNotificacoes
  /** Aplica uma ação ao reducer da fila. Deve ser estável (ex.: método do store). */
  despachar: (acao: AcaoFila) => void
  /**
   * Executa a ação de uma notificação (navegar ou repetir). Depois de chamar, o componente
   * fecha a notificação com `{ type: 'fechar', id, now }`.
   */
  onAcao: (acao: AcaoNotificacao, id: string) => void
  /** Relógio injetável (padrão Date.now), o mesmo `now` que o reducer recebe. Deve ser estável. */
  now?: () => number
}

const ICONE: Record<TipoNotificacao, (p: { size?: number }) => ReactElement> = {
  erro: IconErro,
  aviso: IconAviso,
  sucesso: IconSucesso,
  info: IconInfo,
  conquista: IconConquista
}

export function Notifications({ estado, despachar, onAcao, now = Date.now }: NotificationsProps): ReactElement {
  const pilhaRef = useRef<HTMLDivElement>(null)
  // Elemento focado antes de o foco entrar na pilha (para devolver ao fechar a última).
  const origemFoco = useRef<HTMLElement | null>(null)
  // Foco pendente depois que o usuário fecha a notificação focada (aplicado após o render).
  const focoPendente = useRef<{ id: string | null } | null>(null)
  const [recolhidosAbertos, setRecolhidosAbertos] = useState(false)

  const { erros, outros, conquista } = gruposExibicao(estado)
  const nRecolhidos = errosRecolhidos(estado)
  const fecharTodosVisivel = mostrarFecharTodos(estado)
  const fecharTodosRotulo = rotuloFecharTodos(totalFecharTodos(estado))
  const proxima = proximaExpiracao(estado)

  // Timer único, agendado pelo próximo vencimento; reagenda a cada mudança de prazo (pausa, retomada, dedupe).
  useEffect(() => {
    const espera = esperaAteExpirar(proxima, now())
    if (espera === null) return
    const t = window.setTimeout(() => despachar({ type: 'expirar', now: now() }), espera)
    return () => window.clearTimeout(t)
  }, [proxima, despachar, now])

  // Sem erros recolhidos, a lista expandida fecha sozinha.
  useEffect(() => {
    if (nRecolhidos === 0) setRecolhidosAbertos(false)
  }, [nRecolhidos])

  // Aplica o foco pendente depois do render que tirou a notificação fechada.
  useEffect(() => {
    const pendente = focoPendente.current
    if (!pendente) return
    focoPendente.current = null
    const alvo = pendente.id ? pilhaRef.current?.querySelector<HTMLElement>(`[data-notificacao="${pendente.id}"] .notify-close`) : null
    if (alvo) alvo.focus()
    else if (origemFoco.current?.isConnected) origemFoco.current.focus()
  })

  // Ordem visual (de cima para baixo), usada para achar a vizinha ao fechar.
  const ordem = [...erros, ...(recolhidosAbertos ? estado.errosRecolhidos : []), ...outros, ...(conquista ? [conquista] : [])].map((n) => n.id)
  const focoDentro = (): boolean => !!pilhaRef.current && pilhaRef.current.contains(document.activeElement)

  const fechar = (id: string): void => {
    if (focoDentro()) focoPendente.current = { id: vizinhaAoFechar(ordem, id) }
    despachar({ type: 'fechar', id, now: now() })
  }
  const fecharTodos = (): void => {
    // A conquista não é afetada: se houver, o foco vai para ela; senão volta para a origem.
    if (focoDentro()) focoPendente.current = { id: conquista?.id ?? null }
    despachar({ type: 'fecharTodos' })
  }
  const agir = (n: Notificacao): void => {
    if (!n.acao) return
    onAcao(n.acao, n.id)
    fechar(n.id)
  }
  const onFocusPilha = (e: FocusEvent<HTMLDivElement>): void => {
    const de = e.relatedTarget
    if (de instanceof HTMLElement && !e.currentTarget.contains(de)) origemFoco.current = de
  }

  const cartao = (n: Notificacao, alerta: boolean): ReactElement => (
    <Cartao key={n.id} n={n} alerta={alerta} despachar={despachar} now={now} onFechar={() => fechar(n.id)} onAgir={() => agir(n)} />
  )

  return (
    <div className="notify-stack" ref={pilhaRef} onFocus={onFocusPilha}>
      {erros.map((n) => cartao(n, n.alerta))}
      {/* Resumo dos erros numa região polite própria, sempre montada. */}
      <div className="notify-region" role="status" aria-live="polite">
        {(nRecolhidos > 0 || fecharTodosVisivel) && (
          <div className="notify-summary">
            {nRecolhidos > 0 && (
              <button
                type="button"
                className="notify-link notify-more"
                aria-expanded={recolhidosAbertos}
                title={descricaoErrosRecolhidos(nRecolhidos)}
                onClick={() => setRecolhidosAbertos((v) => !v)}
              >
                <span aria-hidden="true">{rotuloErrosRecolhidos(nRecolhidos)}</span>
                <span className="sr-only">{descricaoErrosRecolhidos(nRecolhidos)}</span>
              </button>
            )}
            <span className="notify-spacer" />
            {fecharTodosVisivel && (
              // Sem confirmação (decisão do PO); a faixa da conquista fica.
              <button type="button" className="notify-link" aria-label={fecharTodosRotulo.leitor} onClick={fecharTodos}>
                {fecharTodosRotulo.visivel}
              </button>
            )}
          </div>
        )}
      </div>
      {recolhidosAbertos && nRecolhidos > 0 && (
        // Fora de região viva e sem role="alert": já foram resumidos no "+N erros", e quem abriu foi o usuário.
        <div className="notify-collapsed" role="group" aria-label="Erros recolhidos">
          {estado.errosRecolhidos.map((n) => cartao(n, false))}
        </div>
      )}
      {/* Região polite dos demais tipos e da conquista: montada desde o boot, mesmo vazia (H06.2). */}
      <div className="notify-region" role="status" aria-live="polite">
        {outros.map((n) => cartao(n, false))}
        {conquista && <div className="notify-achievements">{cartao(conquista, false)}</div>}
      </div>
    </div>
  )
}

interface CartaoProps {
  n: Notificacao
  /** Texto em role="alert" (erro na primeira vez que entra na tela). */
  alerta: boolean
  despachar: (acao: AcaoFila) => void
  now: () => number
  onFechar: () => void
  onAgir: () => void
}

/** Um cartão. Pausa o prazo enquanto o mouse ou o foco estiver dentro dele. */
function Cartao({ n, alerta, despachar, now, onFechar, onAgir }: CartaoProps): ReactElement {
  const mouse = useRef(false)
  const foco = useRef(false)
  const Icone = ICONE[n.tipo]
  const rep = rotuloRepeticoes(n.repeticoes)
  const ehConquista = n.tipo === 'conquista'
  const titulo = ehConquista ? n.conquista?.titulo : undefined
  const xp = ehConquista ? rotuloXp(n.conquista?.xp) : null
  const detalhe = ehConquista ? detalheConquista(n) : n.texto

  const pausar = (): void => despachar({ type: 'pausar', id: n.id, now: now() })
  const retomarSeLivre = (): void => {
    if (!mouse.current && !foco.current) despachar({ type: 'retomar', id: n.id, now: now() })
  }

  const mensagem = (
    <div className="notify-body">
      <span className="sr-only">{PREFIXO_LEITOR[n.tipo]} </span>
      {ehConquista && (
        <span className="notify-title" aria-hidden="true">
          {TITULO_CONQUISTA}
        </span>
      )}
      {titulo && (
        <span className="notify-achievement-name">
          <b>{titulo}</b>
          {xp && <span className="notify-xp">{xp}</span>}
        </span>
      )}
      {detalhe && <span className="notify-text">{detalhe}</span>}
      {rep && (
        <span className="notify-count">
          <span aria-hidden="true">{rep.visivel}</span>
          <span className="sr-only">, {rep.leitor}</span>
        </span>
      )}
    </div>
  )

  return (
    <div
      className={`notify-card notify-${n.tipo}`}
      data-notificacao={n.id}
      onMouseEnter={() => {
        mouse.current = true
        pausar()
      }}
      onMouseLeave={() => {
        mouse.current = false
        retomarSeLivre()
      }}
      onFocus={() => {
        if (foco.current) return
        foco.current = true
        pausar()
      }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
        foco.current = false
        retomarSeLivre()
      }}
    >
      <span className="notify-icon">
        <Icone size={ehConquista ? 20 : 16} />
      </span>
      {/* Só o texto vai no alert: os botões ficam fora para o anúncio não ler "Fechar notificação". */}
      {alerta ? (
        <div className="notify-alert" role="alert">
          {mensagem}
        </div>
      ) : (
        mensagem
      )}
      {n.acao && (
        <button type="button" className="btn sm notify-action" onClick={onAgir}>
          {rotuloAcao(n.acao)}
        </button>
      )}
      <button type="button" className="notify-close" aria-label={ROTULO_FECHAR} title={ROTULO_FECHAR} onClick={onFechar}>
        <IconX size={14} />
      </button>
    </div>
  )
}
