import { useId, useState, type ReactElement } from 'react'
import { errorText } from '@shared/lib/errorText'
import { useStore } from '../store'
import {
  DICA_REPETIR_OCUPADO,
  ERRO_COPIAR,
  ROTULO_ACAO_ERRO,
  SUCESSO_COPIAR,
  acaoChave,
  acaoExterna,
  cartaoErro,
  rotuloAcessivelAcao,
  trechosCorpo,
  type AcaoCartaoErro,
  type ItemErro
} from '../lib/agentErrorCard'
import { IconAviso, IconCopiar, IconErro, IconExterno } from './Icons'

/*
 * Card de erro do turno do Claude no chat (H06.3, H06.7, T20). Texto fixo por código (a mensagem
 * original só aparece, já redigida no main, em "Detalhes técnicos"). Ações:
 * - "Como entrar (de novo)": abre a ajuda fixa no navegador via window.deck.help.open (chave de lista fechada);
 * - "Usar/Trocar/Adicionar chave": Configurações com foco no campo da chave;
 * - "Tentar de novo": reenvia a mensagem do turno, só por clique, e fica indisponível durante um turno.
 * O card nunca toca no composer (o rascunho do usuário fica onde está).
 */

export interface AgentErrorCardProps {
  sessionId: string
  item: ItemErro
  /** "Tentar de novo" só no card do último turno (card antigo não repete). */
  podeRepetir: boolean
  /** Turno em andamento na sessão: "Tentar de novo" fica indisponível. */
  ocupado: boolean
  /** Erro que acabou de chegar: título e corpo em role="alert" (histórico carregado não é anunciado). */
  anunciar: boolean
}

export function AgentErrorCard({ sessionId, item, podeRepetir, ocupado, anunciar }: AgentErrorCardProps): ReactElement {
  const notify = useStore((s) => s.notify)
  const abrirChaveApi = useStore((s) => s.abrirChaveApi)
  const repetirMensagem = useStore((s) => s.repetirMensagem)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  const id = useId()
  const tituloId = `${id}-titulo`
  const dicaId = `${id}-dica`
  const detalhesId = `${id}-detalhes`

  const cartao = cartaoErro(item.code)
  const Icone = cartao.tom === 'warn' ? IconAviso : IconErro
  const acoes = cartao.acoes.filter((a) => a !== 'repetir' || podeRepetir)

  const agir = (acao: AcaoCartaoErro): void => {
    if (acaoExterna(acao)) {
      window.deck.help.open('claude-login').catch((e: unknown) => notify({ tipo: 'erro', texto: errorText(e) }))
    } else if (acaoChave(acao)) {
      abrirChaveApi()
    } else if (!ocupado) {
      void repetirMensagem(sessionId, item.id)
    }
  }

  const copiar = (): void => {
    navigator.clipboard
      .writeText(item.detail ?? '')
      .then(() => notify({ tipo: 'sucesso', texto: SUCESSO_COPIAR }))
      .catch(() => notify({ tipo: 'erro', texto: ERRO_COPIAR }))
  }

  const texto = (
    <>
      <p className="agent-error-title" id={tituloId}>
        {cartao.titulo}
      </p>
      <p className="agent-error-body">
        {trechosCorpo(cartao.corpo).map((t, i) => (t.codigo ? <code key={i}>{t.texto}</code> : <span key={i}>{t.texto}</span>))}
      </p>
    </>
  )

  return (
    <section className={`agent-error agent-error-${cartao.tom}`} aria-labelledby={tituloId}>
      <div className="agent-error-head">
        <span className="agent-error-icon">
          <Icone size={18} />
        </span>
        {/* Só o texto vai no alert: os botões ficam fora para o anúncio não ler os rótulos. */}
        <div className="agent-error-text" role={anunciar ? 'alert' : undefined}>
          {texto}
        </div>
      </div>

      <div className="agent-error-actions">
        {acoes.map((acao, i) => {
          const repetir = acao === 'repetir'
          const indisponivel = repetir && ocupado
          return (
            <button
              key={acao}
              type="button"
              className={`btn sm ${i === 0 ? 'primary' : ''}`}
              aria-label={acaoExterna(acao) ? rotuloAcessivelAcao(acao) : undefined}
              // aria-disabled (e não disabled): o botão continua focável e a dica é lida.
              aria-disabled={indisponivel || undefined}
              aria-describedby={indisponivel ? dicaId : undefined}
              onClick={() => agir(acao)}
            >
              {ROTULO_ACAO_ERRO[acao]}
              {acaoExterna(acao) && <IconExterno size={13} />}
            </button>
          )
        })}
        {podeRepetir && ocupado && (
          <span className="agent-error-hint" id={dicaId}>
            {DICA_REPETIR_OCUPADO}
          </span>
        )}
      </div>

      {item.detail && (
        <div className="agent-error-details">
          <button
            type="button"
            className="agent-error-toggle"
            aria-expanded={detalhesAbertos}
            aria-controls={detalhesId}
            onClick={() => setDetalhesAbertos((v) => !v)}
          >
            Detalhes técnicos
          </button>
          <div id={detalhesId} hidden={!detalhesAbertos}>
            <pre className="agent-error-detail">{item.detail}</pre>
            <button type="button" className="btn ghost sm" onClick={copiar}>
              <IconCopiar size={13} /> Copiar detalhes
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
