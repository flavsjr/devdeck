// Fila de notificações do app (H06.2, ADR-021): reducer puro com `now` injetado.
// O componente agenda o timer a partir de `proximaExpiracao` e despacha `expirar`.
//
// Regras (debate da Sprint 06 + decisões do PO sobre as propostas do UX):
// - Pilha principal com no máximo 3 na tela; erro conta no teto e só sai com "fechar"/"fecharTodos".
// - Teto cheio: sai a não-erro mais antiga. Com 3 erros na tela, um não-erro novo entra e o erro
//   mais antigo vai para o início dos recolhidos ("+N erros"); volta quando abrir vaga, sem ser
//   anunciado de novo. Erro novo com 3 erros na tela vai para o fim dos recolhidos.
// - Conquista fica fora do teto: fila própria, uma visível por vez, prazo contado só na vez dela.
// - Dedupe: mesmo tipo e texto ainda na tela, recolhido ou na fila soma "×N" e renova o prazo,
//   sem limite de tempo (erro só soma). Depois de fechada, uma ocorrência nova abre card novo.
import type { ChatItem } from '@shared/types'
import { erroDoUltimoTurno, textoErroNoChat } from './agentErrorCard'
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

/** Dados da conquista para o visual próprio (título e XP). Só vale com tipo 'conquista'. */
export interface DadosConquista {
  titulo: string
  xp?: number
}

export interface NovaNotificacao {
  tipo: TipoNotificacao
  texto: string
  acao?: AcaoNotificacao
  conquista?: DadosConquista
}

export interface Notificacao extends NovaNotificacao {
  id: string
  criadaEm: number
  /** Última vez que a mesma mensagem chegou. */
  ultimaEm: number
  /** Quantas vezes chegou enquanto estava aberta ("×2" na tela quando > 1). */
  repeticoes: number
  /** Quando sai sozinha; null para erro, enquanto pausada e para conquista esperando a vez. */
  expiraEm: number | null
  /** Pausada por mouse ou foco em cima: guarda o tempo que faltava. */
  restanteMs: number | null
  /** Já esteve na tela (e foi anunciada). */
  anunciada: boolean
  /**
   * Renderizar o texto em role="alert": só erro na primeira vez que entra na tela. Erro que volta
   * dos recolhidos fica com false para o leitor de tela não anunciar de novo.
   */
  alerta: boolean
}

export interface EstadoNotificacoes {
  /** Pilha principal na tela, da mais antiga para a mais nova (no máximo TETO_VISIVEIS; sem conquista). */
  visiveis: Notificacao[]
  /** Erros fora da tela ("+N erros"); o primeiro é o próximo a voltar. */
  errosRecolhidos: Notificacao[]
  /** Fila das conquistas: a primeira está na tela, as outras esperam a vez. */
  conquistas: Notificacao[]
  /** Últimas LIMITE_HISTORICO notificações da sessão, da mais antiga para a mais nova. */
  historico: Notificacao[]
  proximoId: number
}

export type AcaoFila =
  | { type: 'adicionar'; notificacao: NovaNotificacao; now: number }
  | { type: 'fechar'; id: string; now: number }
  | { type: 'fecharTodos' }
  | { type: 'expirar'; now: number }
  | { type: 'pausar'; id: string; now: number }
  | { type: 'retomar'; id: string; now: number }

export const ESTADO_INICIAL: EstadoNotificacoes = { visiveis: [], errosRecolhidos: [], conquistas: [], historico: [], proximoId: 1 }

function noHistorico(historico: Notificacao[], n: Notificacao): Notificacao[] {
  const i = historico.findIndex((h) => h.id === n.id)
  if (i >= 0) return historico.map((h, j) => (j === i ? n : h))
  return [...historico, n].slice(-LIMITE_HISTORICO)
}

/** Marca a entrada na tela: erro inédito vai em role="alert"; quem já foi anunciado, não. */
function naTela(n: Notificacao): Notificacao {
  return { ...n, alerta: n.tipo === 'erro' && !n.anunciada, anunciada: true }
}

/** Começa a contar o prazo de uma conquista que acabou de chegar à frente da fila. */
function vezDaConquista(n: Notificacao, now: number): Notificacao {
  const duracao = DURACAO_MS.conquista ?? 0
  return { ...naTela(n), expiraEm: now + duracao, restanteMs: null }
}

/** Sobe erros recolhidos enquanto houver vaga na tela. */
function promover(s: EstadoNotificacoes): EstadoNotificacoes {
  if (!s.errosRecolhidos.length || s.visiveis.length >= TETO_VISIVEIS) return s
  const vagas = TETO_VISIVEIS - s.visiveis.length
  return {
    ...s,
    visiveis: [...s.visiveis, ...s.errosRecolhidos.slice(0, vagas).map(naTela)],
    errosRecolhidos: s.errosRecolhidos.slice(vagas)
  }
}

/** Tira a conquista `id` da fila; se era a da tela, a próxima começa a contar em `now`. */
function semConquista(s: EstadoNotificacoes, id: string, now: number): EstadoNotificacoes {
  const i = s.conquistas.findIndex((n) => n.id === id)
  if (i < 0) return s
  const resto = s.conquistas.filter((n) => n.id !== id)
  if (i === 0 && resto.length) resto[0] = vezDaConquista(resto[0], now)
  return { ...s, conquistas: resto }
}

function adicionar(s: EstadoNotificacoes, nova: NovaNotificacao, now: number): EstadoNotificacoes {
  const duracao = DURACAO_MS[nova.tipo]
  // Dedupe sem limite de tempo: mesma mensagem ainda aberta soma no contador e renova o prazo.
  const igual = (n: Notificacao): boolean => n.tipo === nova.tipo && n.texto === nova.texto
  const repetida = s.visiveis.find(igual) ?? s.errosRecolhidos.find(igual) ?? s.conquistas.find(igual)
  if (repetida) {
    const esperando = nova.tipo === 'conquista' && s.conquistas[0]?.id !== repetida.id
    const pausada = repetida.restanteMs !== null
    const atual: Notificacao = esperando
      ? { ...repetida, ultimaEm: now, repeticoes: repetida.repeticoes + 1 }
      : {
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
      conquistas: s.conquistas.map(troca),
      historico: noHistorico(s.historico, atual)
    }
  }

  const n: Notificacao = {
    tipo: nova.tipo,
    texto: nova.texto,
    ...(nova.acao ? { acao: nova.acao } : {}),
    ...(nova.tipo === 'conquista' && nova.conquista ? { conquista: { ...nova.conquista } } : {}),
    id: `n${s.proximoId}`,
    criadaEm: now,
    ultimaEm: now,
    repeticoes: 1,
    expiraEm: duracao === null ? null : now + duracao,
    restanteMs: null,
    anunciada: false,
    alerta: false
  }
  const base = { ...s, proximoId: s.proximoId + 1, historico: noHistorico(s.historico, n) }

  // Conquista: fila própria, fora do teto. Só conta o prazo quando chega a vez dela.
  if (n.tipo === 'conquista') {
    if (!s.conquistas.length) return { ...base, conquistas: [naTela(n)] }
    return { ...base, conquistas: [...s.conquistas, { ...n, expiraEm: null }] }
  }

  if (s.visiveis.length < TETO_VISIVEIS) return { ...base, visiveis: [...s.visiveis, naTela(n)] }
  // Teto cheio: sai a mais antiga que não é erro.
  const sai = s.visiveis.find((v) => v.tipo !== 'erro')
  if (sai) return { ...base, visiveis: [...s.visiveis.filter((v) => v.id !== sai.id), naTela(n)] }
  // Três erros na tela. Erro novo fica recolhido (no fim).
  if (n.tipo === 'erro') return { ...base, errosRecolhidos: [...s.errosRecolhidos, n] }
  // Não-erro novo entra; o erro mais antigo vai para o início dos recolhidos e volta primeiro.
  const [maisAntigo, ...outros] = s.visiveis
  return { ...base, visiveis: [...outros, naTela(n)], errosRecolhidos: [maisAntigo, ...s.errosRecolhidos] }
}

function pausar(n: Notificacao, now: number): Notificacao {
  return n.expiraEm !== null ? { ...n, restanteMs: Math.max(0, n.expiraEm - now), expiraEm: null } : n
}

function retomar(n: Notificacao, now: number): Notificacao {
  return n.restanteMs !== null ? { ...n, expiraEm: now + n.restanteMs, restanteMs: null } : n
}

export function notificacoesReducer(s: EstadoNotificacoes, a: AcaoFila): EstadoNotificacoes {
  switch (a.type) {
    case 'adicionar':
      return adicionar(s, a.notificacao, a.now)
    case 'fechar': {
      const semElas = semConquista(s, a.id, a.now)
      return promover({
        ...semElas,
        visiveis: semElas.visiveis.filter((n) => n.id !== a.id),
        errosRecolhidos: semElas.errosRecolhidos.filter((n) => n.id !== a.id)
      })
    }
    case 'fecharTodos':
      // A faixa da conquista não é afetada.
      return { ...s, visiveis: [], errosRecolhidos: [] }
    case 'expirar': {
      // Só sai o que tem prazo vencido; erro (expiraEm null) e pausada nunca saem por tempo.
      const vence = (n: Notificacao): boolean => n.tipo !== 'erro' && n.expiraEm !== null && n.expiraEm <= a.now
      const visiveis = s.visiveis.filter((n) => !vence(n))
      const frente = s.conquistas[0]
      const semConquistaVencida = frente && vence(frente) ? semConquista(s, frente.id, a.now) : s
      if (visiveis.length === s.visiveis.length && semConquistaVencida === s) return s
      return promover({ ...semConquistaVencida, visiveis })
    }
    case 'pausar':
    case 'retomar': {
      const f = a.type === 'pausar' ? pausar : retomar
      const troca = (n: Notificacao): Notificacao => (n.id === a.id ? f(n, a.now) : n)
      // Conquista esperando a vez não está na tela: não pausa nem retoma.
      return { ...s, visiveis: s.visiveis.map(troca), conquistas: s.conquistas.map((n, i) => (i === 0 ? troca(n) : n)) }
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

/** N de "Fechar todos (N)": pilha principal na tela + recolhidos (a conquista não entra). */
export function totalFecharTodos(s: EstadoNotificacoes): number {
  return s.visiveis.length + s.errosRecolhidos.length
}

/** Conquista na tela (a primeira da fila), ou null. */
export function conquistaVisivel(s: EstadoNotificacoes): Notificacao | null {
  return s.conquistas[0] ?? null
}

/** Próximo instante em que alguma notificação na tela vence (para agendar o `expirar`), ou null. */
export function proximaExpiracao(s: EstadoNotificacoes): number | null {
  const frente = conquistaVisivel(s)
  const prazos = [...s.visiveis, ...(frente ? [frente] : [])].map((n) => n.expiraEm).filter((t): t is number => t !== null)
  return prazos.length ? Math.min(...prazos) : null
}

/** O que o fim de um turno sabe para decidir o aviso do erro (T21; regra pura da H07.2). */
export interface ContextoErroDoTurno {
  sessionId: string
  activeId: string | null
  view: View
  items: readonly ChatItem[]
  /** Título da sessão do turno (citado quando ela não é a ativa). */
  tituloSessao?: string
  /** Ids de erro já tratados: o fim do turno pode chegar duas vezes (result e finally). */
  avisados: ReadonlySet<string>
}

/**
 * Aviso do erro do último turno. null: sem erro com código no último turno, ou erro já tratado.
 * Senão, `erroId` para marcar como tratado e `aviso`, que é null quando o card no chat basta
 * (sessão ativa com o chat na tela): o erro nunca vira card e toast ao mesmo tempo.
 * - sessão ativa em outra aba: "Erro no chat: …" com "Ver no chat";
 * - outra sessão: cita o título, sem ação.
 * Nunca leva a mensagem original: só o título fixo do card.
 */
export function avisoErroDoTurno(c: ContextoErroDoTurno): { erroId: string; aviso: NovaNotificacao | null } | null {
  const erro = erroDoUltimoTurno(c.items)
  if (!erro || c.avisados.has(erro.id)) return null
  if (c.sessionId === c.activeId) {
    return {
      erroId: erro.id,
      aviso: c.view === 'chat' ? null : { tipo: 'erro', texto: textoErroNoChat(erro.code), acao: { tipo: 'navegar', destino: 'chat' } }
    }
  }
  return { erroId: erro.id, aviso: { tipo: 'erro', texto: textoErroNoChat(erro.code, c.tituloSessao) } }
}
