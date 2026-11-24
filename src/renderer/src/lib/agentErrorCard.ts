// Card de erro do turno do Claude no chat (H06.3, H06.7, ADR-021; microcopy da T22 em
// docs/sprints/sprint-06/ux-notificacoes.md). Puro: o componente só monta o JSX.
// O texto é fixo por código: a mensagem original do SDK nunca vira texto de interface
// (ela só aparece, redigida no main, em "Detalhes técnicos").
import type { AgentErrorCode, ChatItem } from '@shared/types'

export type ItemErro = Extract<ChatItem, { kind: 'error' }>

/** Ações possíveis de um card de erro (lista fechada). */
export type AcaoCartaoErro = 'entrarDeNovo' | 'entrar' | 'usarChave' | 'trocarChave' | 'adicionarChave' | 'repetir'

/** Cor do card: autenticação, créditos e desconhecido em --bad; limite, sobrecarga e rede em --warn. */
export type TomErro = 'bad' | 'warn'

export interface CartaoErro {
  titulo: string
  /** Corpo; trechos entre crases viram código (`claude`, `/login`). */
  corpo: string
  /** Primária primeiro. */
  acoes: readonly AcaoCartaoErro[]
  tom: TomErro
}

const CORPO_LOGIN_FIM =
  'Entre de novo pelo terminal (rode `claude` e digite `/login`) ou use uma chave da API, que é cobrada por uso. Depois, clique em Tentar de novo.'

export const CARTAO_ERRO: Readonly<Record<AgentErrorCode, CartaoErro>> = {
  auth_expired: {
    titulo: 'Sua sessão do Claude expirou',
    corpo: `O login do Claude Code usado pelo DevDeck não vale mais, e o Claude não recebeu sua última mensagem. ${CORPO_LOGIN_FIM}`,
    acoes: ['entrarDeNovo', 'usarChave', 'repetir'],
    tom: 'bad'
  },
  auth_invalid_key: {
    titulo: 'A chave da API foi recusada',
    corpo:
      'A Anthropic não aceitou a chave da API salva no DevDeck. Ela pode ter sido revogada, digitada errada ou ser de outra organização. Troque a chave em Configurações e clique em Tentar de novo.',
    acoes: ['trocarChave', 'repetir'],
    tom: 'bad'
  },
  auth_missing: {
    titulo: 'Nenhuma conta do Claude conectada',
    corpo:
      'O DevDeck não encontrou login do Claude Code nem chave da API, então o Claude não recebeu sua mensagem. Entre pelo terminal (rode `claude` e digite `/login`) ou adicione uma chave da API.',
    acoes: ['entrar', 'adicionarChave', 'repetir'],
    tom: 'bad'
  },
  rate_limit: {
    titulo: 'Limite de uso do Claude atingido',
    corpo: 'O Claude não processou sua última mensagem. Espere alguns minutos e clique em Tentar de novo.',
    acoes: ['repetir'],
    tom: 'warn'
  },
  overloaded: {
    titulo: 'O Claude está sobrecarregado agora',
    corpo: 'O problema é do lado da Anthropic, não da sua conta. Espere alguns instantes e clique em Tentar de novo.',
    acoes: ['repetir'],
    tom: 'warn'
  },
  billing: {
    titulo: 'Os créditos da sua chave da API acabaram',
    corpo: 'A Anthropic recusou a mensagem por falta de saldo. Adicione créditos no Console da Anthropic ou troque por outra chave.',
    acoes: ['trocarChave', 'repetir'],
    tom: 'bad'
  },
  network: {
    titulo: 'Sem conexão com o Claude',
    corpo: 'Confira a internet, a VPN ou o proxy e clique em Tentar de novo.',
    acoes: ['repetir'],
    tom: 'warn'
  },
  unknown: {
    titulo: 'O Claude não conseguiu responder',
    corpo:
      'Aconteceu um erro que o DevDeck não reconhece. Tente de novo. Se continuar, abra Detalhes técnicos e copie o texto para relatar o problema.',
    acoes: ['repetir'],
    tom: 'bad'
  }
}

/**
 * Variante de `auth_expired` para quando o main não reconheceu o texto da expiração (falha segura
 * do classificador). O item de chat ainda não diz qual das duas é, então o card usa o título
 * principal; esta variante fica pronta para quando o main mandar a distinção.
 */
export const CARTAO_SESSAO_INVALIDA: CartaoErro = {
  ...CARTAO_ERRO.auth_expired,
  titulo: 'Sua sessão do Claude não é válida',
  corpo: `O login do Claude Code usado pelo DevDeck não foi aceito, e o Claude não recebeu sua última mensagem. ${CORPO_LOGIN_FIM}`
}

export const ROTULO_ACAO_ERRO: Readonly<Record<AcaoCartaoErro, string>> = {
  entrarDeNovo: 'Como entrar de novo',
  entrar: 'Como entrar',
  usarChave: 'Usar chave da API',
  trocarChave: 'Trocar chave',
  adicionarChave: 'Adicionar chave da API',
  repetir: 'Tentar de novo'
}

/** Ações que abrem a página de ajuda no navegador (ícone de link externo e aviso no rótulo). */
export function acaoExterna(acao: AcaoCartaoErro): boolean {
  return acao === 'entrarDeNovo' || acao === 'entrar'
}

/** Ações que abrem Configurações com foco no campo da chave. */
export function acaoChave(acao: AcaoCartaoErro): boolean {
  return acao === 'usarChave' || acao === 'trocarChave' || acao === 'adicionarChave'
}

/** Rótulo acessível: o das ações externas avisa que abre no navegador. */
export function rotuloAcessivelAcao(acao: AcaoCartaoErro): string {
  const r = ROTULO_ACAO_ERRO[acao]
  return acaoExterna(acao) ? `${r} (abre no navegador)` : r
}

export const DICA_REPETIR_OCUPADO = 'Aguarde a resposta atual terminar.'
export const SUCESSO_COPIAR = 'Detalhes copiados.'
export const ERRO_COPIAR = 'Não foi possível copiar.'

/** Card do código; item antigo, sem código, conta como 'unknown'. */
export function cartaoErro(code: AgentErrorCode | undefined): CartaoErro {
  return (code && CARTAO_ERRO[code]) || CARTAO_ERRO.unknown
}

/** Trechos do corpo: texto comum e código (entre crases). */
export function trechosCorpo(corpo: string): { texto: string; codigo: boolean }[] {
  return corpo
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((t) => (t.startsWith('`') && t.endsWith('`') && t.length > 1 ? { texto: t.slice(1, -1), codigo: true } : { texto: t, codigo: false }))
}

function inicialMinuscula(s: string): string {
  return s ? s[0].toLocaleLowerCase('pt-BR') + s.slice(1) : s
}

/**
 * Notificação quando o erro chega fora da aba do chat (T21). Nunca leva a mensagem original:
 * só o título fixo do card, com inicial minúscula. De sessão que não é a ativa, cita o título dela.
 */
export function textoErroNoChat(code: AgentErrorCode | undefined, tituloSessao?: string): string {
  const titulo = inicialMinuscula(cartaoErro(code).titulo)
  const nome = tituloSessao?.trim()
  return nome ? `Erro no chat "${nome}": ${titulo}.` : `Erro no chat: ${titulo}.`
}

/** Item de erro com código do último turno (depois da última mensagem do usuário), ou null. */
export function erroDoUltimoTurno(items: readonly ChatItem[]): ItemErro | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'user') return null
    if (it.kind === 'error' && it.code) return it
  }
  return null
}

/**
 * Mensagem que "Tentar de novo" reenvia: a do usuário que originou o turno do erro. Só existe
 * quando o erro é do último turno (nenhuma mensagem do usuário depois dele): card antigo não repete.
 */
export function mensagemParaRepetir(items: readonly ChatItem[], erroId: string): Extract<ChatItem, { kind: 'user' }> | null {
  const i = items.findIndex((it) => it.id === erroId)
  if (i < 0) return null
  if (items.slice(i + 1).some((it) => it.kind === 'user')) return null
  for (let j = i - 1; j >= 0; j--) {
    const it = items[j]
    if (it.kind === 'user') return it
  }
  return null
}
