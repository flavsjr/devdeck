// Dicionário único de mensagens de erro para o usuário (ADR-020, ADR-021).
// Puro: roda no main (fs e rede, com contexto, antes do throw) e no renderer (Supabase e prefixo do IPC).
// Sem electron, fs, DOM ou estado; testado em tests/unit/shared/errorText.test.ts.

export const TEXTO_GENERICO = 'Não foi possível concluir. Tente de novo.'

/** Textos fixos por motivo conhecido. */
export const TEXTOS_ERRO = {
  duplicado: 'Isso já existe.',
  limiteCurtidas: 'Limite de 120 curtidas por hora atingido. Tente de novo mais tarde.',
  limiteDenuncias: 'Limite de 10 denúncias por dia atingido.',
  naoEncontrado: 'Arquivo ou pasta não encontrado.',
  semPermissao: 'Sem permissão para acessar esse arquivo ou pasta.',
  semConexao: 'Sem conexão. Confira a internet e tente de novo.'
} as const

/**
 * Códigos do Supabase Auth (`AuthError.code`, minúsculos com `_`) que o login da comunidade pode
 * devolver (auth-js 2.x, `lib/error-codes.ts`). O `message` deles vem em inglês e nunca vai para a tela.
 */
export const TEXTOS_AUTH_SUPABASE: Readonly<Record<string, string>> = {
  otp_expired: 'Código inválido ou expirado. Confira os 6 dígitos ou peça um novo código.',
  over_email_send_rate_limit: 'Muitos pedidos de código. Espere alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  email_address_invalid: 'Esse e-mail não é aceito. Confira o endereço e tente de novo.',
  email_address_not_authorized: 'Esse e-mail não pode receber o código neste servidor. Use outro endereço.',
  signup_disabled: 'O cadastro de novas contas está desligado na comunidade.',
  email_provider_disabled: 'O login por e-mail está desligado na comunidade.',
  otp_disabled: 'O login por código está desligado na comunidade.',
  user_banned: 'Esta conta está bloqueada na comunidade.',
  captcha_failed: 'A verificação anti-robô falhou. Tente de novo.',
  request_timeout: 'O servidor da comunidade demorou para responder. Tente de novo.',
  session_expired: 'Sua sessão na comunidade expirou. Entre de novo.',
  session_not_found: 'Sua sessão na comunidade expirou. Entre de novo.',
  refresh_token_not_found: 'Sua sessão na comunidade expirou. Entre de novo.',
  refresh_token_already_used: 'Sua sessão na comunidade expirou. Entre de novo.'
}

// Forma dos códigos do Supabase Auth (ex.: otp_expired). Não confunde com SQLSTATE nem errno.
const CODIGO_AUTH = /^[a-z]+(?:_[a-z]+)+$/

// Prefixo que o Electron põe na mensagem quando um handler do main lança:
// "Error invoking remote method 'canal': Error: <mensagem>" (o nome pode ser TypeError etc.).
const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(?:([A-Za-z]*Error):\s*)?/

// Erros do motor JS: mensagem técnica em inglês, nunca vai para o usuário.
const ERROS_DO_MOTOR = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError'])

const CODIGOS_REDE = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

// Mensagens de rede do fetch do Chromium, do undici (Node) e do net do Electron.
const MENSAGEM_REDE =
  /^(TypeError: )?(Failed to fetch|fetch failed|Load failed)$|NetworkError when attempting to fetch|net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_[A-Z_]+|TIMED_OUT|NETWORK_CHANGED|ADDRESS_UNREACHABLE|PROXY_CONNECTION_FAILED)\b/

// Código de erro do Node escrito na mensagem (o IPC perde a propriedade `code`, só sobra o texto).
const ERRNO_NA_MENSAGEM = /\b(E[A-Z]{2,}(?:_[A-Z]+)*):/

interface Lido {
  mensagem: string
  nome: string
  codigos: string[]
  mensagens: string[]
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Junta mensagem, nome e códigos do erro e da cadeia de `cause` (até 3 níveis). */
function ler(err: unknown): Lido {
  const lido: Lido = { mensagem: '', nome: '', codigos: [], mensagens: [] }
  let atual: unknown = err
  for (let nivel = 0; nivel < 4 && atual != null; nivel++) {
    if (typeof atual === 'string') {
      if (nivel === 0) lido.mensagem = atual
      lido.mensagens.push(atual)
      break
    }
    if (typeof atual !== 'object') break
    const o = atual as { message?: unknown; name?: unknown; code?: unknown; cause?: unknown }
    const msg = texto(o.message)
    if (nivel === 0) {
      lido.mensagem = msg
      lido.nome = texto(o.name)
    }
    if (msg) lido.mensagens.push(msg)
    if (texto(o.code)) lido.codigos.push(texto(o.code))
    atual = o.cause
  }
  // Sem o prefixo do IPC; o nome que vinha nele (TypeError…) vale como nome do erro.
  const m = IPC_PREFIX.exec(lido.mensagem)
  if (m) {
    lido.mensagem = lido.mensagem.slice(m[0].length)
    if (m[1]) lido.nome = m[1]
    lido.mensagens[0] = lido.mensagem
  }
  lido.mensagem = lido.mensagem.trim()
  for (const msg of lido.mensagens) {
    const errno = ERRNO_NA_MENSAGEM.exec(msg)
    if (errno) lido.codigos.push(errno[1])
  }
  return lido
}

/** Tira o prefixo "Error invoking remote method '…': Error: " de uma mensagem vinda do IPC. */
export function semPrefixoIpc(mensagem: string): string {
  return mensagem.replace(IPC_PREFIX, '').trim()
}

/** Código do Postgres (SQLSTATE, 5 caracteres) ou do PostgREST, como o Supabase devolve em `error.code`. */
function codigoSupabase(codigo: string): boolean {
  return /^PGRST\d+$/.test(codigo) || (/^[0-9A-Z]{5}$/.test(codigo) && !/^E[A-Z]+$/.test(codigo))
}

/**
 * Tradução de um motivo conhecido (código do Node, rede, Supabase) ou null.
 * Use quando só interessa o que o dicionário conhece, sem repassar texto livre.
 */
export function motivoConhecido(err: unknown): string | null {
  const { codigos, mensagens } = ler(err)
  if (codigos.includes('ENOENT')) return TEXTOS_ERRO.naoEncontrado
  if (codigos.includes('EACCES') || codigos.includes('EPERM')) return TEXTOS_ERRO.semPermissao
  if (codigos.some((c) => CODIGOS_REDE.has(c)) || mensagens.some((m) => MENSAGEM_REDE.test(m))) return TEXTOS_ERRO.semConexao
  if (codigos.includes('23505')) return TEXTOS_ERRO.duplicado
  const auth = codigos.find((c) => Object.hasOwn(TEXTOS_AUTH_SUPABASE, c))
  if (auth) return TEXTOS_AUTH_SUPABASE[auth]
  // Limite da migration 0002: raise com errcode P0001 e mensagem fixa, distinguida pela ação.
  if (codigos.includes('P0001')) {
    const msg = mensagens[0] ?? ''
    if (/^Limite de \d+ curtidas/.test(msg)) return TEXTOS_ERRO.limiteCurtidas
    if (/^Limite de \d+ denúncias/.test(msg)) return TEXTOS_ERRO.limiteDenuncias
  }
  return null
}

/**
 * Texto para o usuário a partir de qualquer erro.
 * Ordem: motivo conhecido → mensagem já escrita para o usuário (ex.: as que o main lança em
 * português, sem o prefixo do IPC) → genérico. Vira genérico: erro do Supabase com código não
 * mapeado, código do Node não mapeado, erro do motor JS (TypeError…), vazio, null e não-erro.
 */
export function errorText(err: unknown): string {
  const conhecido = motivoConhecido(err)
  if (conhecido) return conhecido
  const { mensagem, nome, codigos } = ler(err)
  if (!mensagem) return TEXTO_GENERICO
  if (ERROS_DO_MOTOR.has(nome)) return TEXTO_GENERICO
  // Erro do Supabase Auth (AuthApiError, AuthSessionMissingError…): mensagem em inglês.
  if (/^Auth[A-Za-z]*Error$/.test(nome)) return TEXTO_GENERICO
  if (codigos.some((c) => codigoSupabase(c) || CODIGO_AUTH.test(c) || /^E[A-Z]{2,}/.test(c))) return TEXTO_GENERICO
  return mensagem
}

/**
 * Para o main montar a mensagem com contexto antes do throw:
 * erroComContexto('Não foi possível ler config.json', err) →
 * "Não foi possível ler config.json: Arquivo ou pasta não encontrado."
 * Motivo desconhecido não repassa o texto cru: "Não foi possível ler config.json. Tente de novo."
 */
export function erroComContexto(contexto: string, err: unknown): string {
  const base = contexto.trim().replace(/[.:\s]+$/, '')
  const motivo = motivoConhecido(err)
  return motivo ? `${base}: ${motivo}` : `${base}. Tente de novo.`
}
