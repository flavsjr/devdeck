// Fila de notificações do app (H06.2, ADR-021): reducer puro com `now` injetado.
// O componente agenda o timer a partir de `proximaExpiracao` e despacha `expirar`.
import type { View } from './views'

export const TIPOS_NOTIFICACAO = ['erro', 'aviso', 'sucesso', 'info', 'conquista'] as const
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number]

/** Tempo na tela por tipo, em ms. Erro não tem prazo: só sai quando o usuário fecha. */
export const DURACAO_MS: Readonly<Record<TipoNotificacao, number | null>> = {
  sucesso: 4000,
  info: 5000,
  conquista: 6000,
  aviso: 8000,
  erro: null
}

export const TETO_VISIVEIS = 3
export const JANELA_DEDUPE_MS = 5000
export const LIMITE_HISTORICO = 20
export const MIN_ERROS_FECHAR_TODOS = 2

/**
 * Operações que a ação "repetir" pode disparar: só leitura ou recarga, mapeadas em
 * `repetir(op)` no store. Nunca aprovar, ligar "Sempre", executar comando nem gravar
 * (garantido em tests/unit/renderer/notifications.test.ts).
 */
export const RETRY_OPS = ['recarregarGit', 'recarregarSessoes', 'recarregarCustos', 'recarregarAgenda', 'recarregarPerfil'] as const
export type RetryOp = (typeof RETRY_OPS)[number]

/** No máximo uma ação por notificação, de uma união fechada (sem callback livre). */
export type AcaoNotificacao = { tipo: 'navegar'; destino: View } | { tipo: 'repetir'; op: RetryOp }

export interface NovaNotificacao {
  tipo: TipoNotificacao
  texto: string
  acao?: AcaoNotificacao
}

export interface Notificacao extends NovaNotificacao {
  id: string
  criadaEm: number
  /** Última vez que a mesma mensagem chegou (base do dedupe). */
  ultimaEm: number
  /** Quantas vezes chegou dentro da janela de dedupe ("×2" na tela quando > 1). */
  repeticoes: number
  /** Quando sai sozinha; null para erro e enquanto pausada. */
  expiraEm: number | null
  /** Pausada por mouse ou foco em cima: guarda o tempo que faltava. */
  restanteMs: number | null
}

export interface EstadoNotificacoes {
  /** Na tela, da mais antiga para a mais nova (no máximo TETO_VISIVEIS). */
  visiveis: Notificacao[]
  /** Erros que não couberam com 3 erros na tela ("+N erros"), da mais antiga para a mais nova. */
  errosRecolhidos: Notificacao[]
  /** Últimas LIMITE_HISTORICO notificações da sessão, da mais antiga para a mais nova. */
  historico: Notificacao[]
  proximoId: number
}

export type AcaoFila =
  | { type: 'adicionar'; notificacao: NovaNotificacao; now: number }
  | { type: 'fechar'; id: string }
  | { type: 'fecharTodos' }
  | { type: 'expirar'; now: number }
  | { type: 'pausar'; id: string; now: number }
  | { type: 'retomar'; id: string; now: number }

export const ESTADO_INICIAL: EstadoNotificacoes = { visiveis: [], errosRecolhidos: [], historico: [], proximoId: 1 }

function noHistorico(historico: Notificacao[], n: Notificacao): Notificacao[] {
  const i = historico.findIndex((h) => h.id === n.id)
  if (i >= 0) return historico.map((h, j) => (j === i ? n : h))
  return [...historico, n].slice(-LIMITE_HISTORICO)
}

/** Sobe erros recolhidos enquanto houver vaga na tela. */
function promover(s: EstadoNotificacoes): EstadoNotificacoes {
  if (!s.errosRecolhidos.length || s.visiveis.length >= TETO_VISIVEIS) return s
  const vagas = TETO_VISIVEIS - s.visiveis.length
  return {
    ...s,
    visiveis: [...s.visiveis, ...s.errosRecolhidos.slice(0, vagas)],
    errosRecolhidos: s.errosRecolhidos.slice(vagas)
  }
}

function adicionar(s: EstadoNotificacoes, nova: NovaNotificacao, now: number): EstadoNotificacoes {
  const duracao = DURACAO_MS[nova.tipo]
  // Dedupe: mesmo tipo e texto há menos de 5 s soma no contador e renova o prazo.
  const igual = (n: Notificacao): boolean => n.tipo === nova.tipo && n.texto === nova.texto && now - n.ultimaEm < JANELA_DEDUPE_MS
  const repetida = s.visiveis.find(igual) ?? s.errosRecolhidos.find(igual)
  if (repetida) {
    const pausada = repetida.restanteMs !== null
    const atual: Notificacao = {
      ...repetida,
      ultimaEm: now,
      repeticoes: repetida.repeticoes + 1,
      expiraEm: duracao === null || pausada ? null : now + duracao,
      restanteMs: pausada ? duracao : null
    }
    const troca = (n: Notificacao): Notificacao => (n.id === atual.id ? atual : n)
    return {
      ...s,
      visiveis: s.visiveis.map(troca),
      errosRecolhidos: s.errosRecolhidos.map(troca),
      historico: noHistorico(s.historico, atual)
    }
  }

  const n: Notificacao = {
    tipo: nova.tipo,
    texto: nova.texto,
    ...(nova.acao ? { acao: nova.acao } : {}),
    id: `n${s.proximoId}`,
    criadaEm: now,
    ultimaEm: now,
    repeticoes: 1,
    expiraEm: duracao === null ? null : now + duracao,
    restanteMs: null
  }
  const base = { ...s, proximoId: s.proximoId + 1, historico: noHistorico(s.historico, n) }

  if (s.visiveis.length < TETO_VISIVEIS) return { ...base, visiveis: [...s.visiveis, n] }
  // Teto cheio: sai a mais antiga que não é erro.
  const sai = s.visiveis.find((v) => v.tipo !== 'erro')
  if (sai) return { ...base, visiveis: [...s.visiveis.filter((v) => v.id !== sai.id), n] }
  // Três erros na tela: erro novo fica recolhido; os outros tipos ficam só no histórico,
  // porque nenhum erro sai sem ação do usuário.
  if (n.tipo === 'erro') return { ...base, errosRecolhidos: [...s.errosRecolhidos, n] }
  return base
}

export function notificacoesReducer(s: EstadoNotificacoes, a: AcaoFila): EstadoNotificacoes {
  switch (a.type) {
    case 'adicionar':
      return adicionar(s, a.notificacao, a.now)
    case 'fechar':
      return promover({
        ...s,
        visiveis: s.visiveis.filter((n) => n.id !== a.id),
        errosRecolhidos: s.errosRecolhidos.filter((n) => n.id !== a.id)
      })
    case 'fecharTodos':
      return { ...s, visiveis: [], errosRecolhidos: [] }
    case 'expirar': {
      // Só sai o que tem prazo vencido; erro (expiraEm null) e pausada nunca saem por tempo.
      const visiveis = s.visiveis.filter((n) => n.tipo === 'erro' || n.expiraEm === null || n.expiraEm > a.now)
      return visiveis.length === s.visiveis.length ? s : promover({ ...s, visiveis })
    }
    case 'pausar':
      return {
        ...s,
        visiveis: s.visiveis.map((n) =>
          n.id === a.id && n.expiraEm !== null ? { ...n, restanteMs: Math.max(0, n.expiraEm - a.now), expiraEm: null } : n
        )
      }
    case 'retomar':
      return {
        ...s,
        visiveis: s.visiveis.map((n) =>
          n.id === a.id && n.restanteMs !== null ? { ...n, expiraEm: a.now + n.restanteMs, restanteMs: null } : n
        )
      }
  }
}

/** "+N erros": erros que não couberam na tela. */
export function errosRecolhidos(s: EstadoNotificacoes): number {
  return s.errosRecolhidos.length
}

/** "Fechar todos" aparece a partir de 2 erros (na tela ou recolhidos). */
export function mostrarFecharTodos(s: EstadoNotificacoes): boolean {
  return s.visiveis.filter((n) => n.tipo === 'erro').length + s.errosRecolhidos.length >= MIN_ERROS_FECHAR_TODOS
}

/** Próximo instante em que alguma notificação vence (para agendar o `expirar`), ou null. */
export function proximaExpiracao(s: EstadoNotificacoes): number | null {
  const prazos = s.visiveis.map((n) => n.expiraEm).filter((t): t is number => t !== null)
  return prazos.length ? Math.min(...prazos) : null
}
