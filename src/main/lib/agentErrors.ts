import type { SDKAssistantMessageError } from '@anthropic-ai/claude-agent-sdk'
import type { AgentErrorCode } from '@shared/types'

// Classificador dos erros de turno do agente (H06.3, H06.7, ADR-021). Puro: recebe o que o SDK
// mandou (enum tipado de SDKAssistantMessage.error, api_error_status do result, apiKeySource do
// init) e devolve um código fechado. O renderer mostra texto fixo por código; a mensagem original
// nunca vira texto de interface.
//
// Contrato com o SDK 0.3.330: as fixtures de tests/fixtures/agent-errors/ (spike T01). Atualizar o
// SDK obriga a regravar as fixtures (ADR-011/ADR-021); o mapa abaixo usa `satisfies` sobre o enum
// do SDK, então valor novo ou removido quebra o typecheck, e o teste confere o enum no sdk.d.ts.

export const AGENT_ERROR_CODES = [
  'auth_expired',
  'auth_invalid_key',
  'auth_missing',
  'rate_limit',
  'overloaded',
  'billing',
  'network',
  'unknown'
] as const satisfies readonly AgentErrorCode[]

// Garante que a lista acima cobre a união de shared/types (e só ela).
type Faltando = Exclude<AgentErrorCode, (typeof AGENT_ERROR_CODES)[number]>
const _cobreTodos: Faltando extends never ? true : never = true
void _cobreTodos

export interface AgentErrorInput {
  /** `SDKAssistantMessage.error`. Ausente quando o erro não veio de uma mensagem do assistente. */
  error?: SDKAssistantMessageError | string
  /** `result.api_error_status` (null quando não houve resposta HTTP, ex.: sem rede). */
  apiErrorStatus?: number | null
  /** `system/init.apiKeySource` ('none' vale tanto para OAuth quanto para sem credencial). */
  apiKeySource?: string
  /** Há chave da API salva no DevDeck (repassada ao SDK como ANTHROPIC_API_KEY). */
  hasApiKey: boolean
  /** Texto da mensagem do SDK: só desempate de último caso, nunca a regra principal. */
  text?: string
}

/** Como cada valor do enum do SDK entra na classificação. */
type Regra = 'auth' | 'rate_limit' | 'overloaded' | 'billing' | 'server' | 'unknown'

const REGRA_POR_ERRO = {
  authentication_failed: 'auth',
  rate_limit: 'rate_limit',
  overloaded: 'overloaded',
  billing_error: 'billing',
  // 529 e falta de rede chegam como server_error: o status e o texto desempatam.
  server_error: 'server',
  // Sem card próprio nesta sprint: texto genérico (falha segura).
  oauth_org_not_allowed: 'unknown',
  account_on_hold: 'unknown',
  verification_required: 'unknown',
  invalid_request: 'unknown',
  model_not_found: 'unknown',
  unknown: 'unknown',
  max_output_tokens: 'unknown',
  cloud_credential_error: 'unknown'
} as const satisfies Record<SDKAssistantMessageError, Regra>

/** Valores do enum do SDK conhecidos por esta versão do classificador. */
export const KNOWN_SDK_ERRORS = Object.keys(REGRA_POR_ERRO) as SDKAssistantMessageError[]

/** Origens do init que significam chave da API (e não login OAuth ou sem credencial). */
const ORIGENS_DE_CHAVE = new Set(['ANTHROPIC_API_KEY', 'apiKeyHelper'])

const RE_SEM_LOGIN = /not logged in/i
// Textos documentados da sessão OAuth expirada ("OAuth session expired and could not be refreshed",
// "Login reached its time limit", "Login expired"), mais o genérico oauth/expired.
const RE_OAUTH_EXPIRADA = /login reached its time limit|login expired|oauth|expired/i
const RE_SEM_REDE = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|Connection refused/i

function usaChave(i: AgentErrorInput): boolean {
  return i.hasApiKey || (i.apiKeySource !== undefined && ORIGENS_DE_CHAVE.has(i.apiKeySource))
}

function regraDe(error: string): Regra | null {
  return Object.hasOwn(REGRA_POR_ERRO, error) ? REGRA_POR_ERRO[error as SDKAssistantMessageError] : null
}

/** Falha de autenticação: chave recusada, sessão expirada ou nenhuma conta. */
function classificarAuth(i: AgentErrorInput): AgentErrorCode {
  if (usaChave(i)) return 'auth_invalid_key'
  const texto = i.text ?? ''
  if (RE_SEM_LOGIN.test(texto)) return 'auth_missing'
  if (RE_OAUTH_EXPIRADA.test(texto)) return 'auth_expired'
  // Sem chave e sem texto reconhecido: "sessão não é válida". As ações do card de sessão
  // expirada (usar chave, entrar de novo) servem também para quem nunca entrou.
  return 'auth_expired'
}

/** Classifica o erro de um turno. Valor do enum desconhecido por esta versão vira 'unknown'. */
export function classifyAgentError(i: AgentErrorInput): AgentErrorCode {
  const status = i.apiErrorStatus ?? null
  let regra: Regra | null = null
  if (i.error !== undefined) {
    regra = regraDe(i.error)
    // Enum novo (SDK atualizado sem regravar as fixtures): falha segura.
    if (regra === null) return 'unknown'
  }

  if (regra === 'auth' || status === 401) {
    // 401 sem chave é token OAuth recusado: mesmo desempate de authentication_failed.
    return regra === 'auth' ? classificarAuth(i) : usaChave(i) ? 'auth_invalid_key' : 'auth_expired'
  }
  if (regra === 'rate_limit' || status === 429) return 'rate_limit'
  if (regra === 'overloaded' || status === 529) return 'overloaded'
  if (regra === 'billing') return 'billing'
  if (regra === 'server' && status === null && RE_SEM_REDE.test(i.text ?? '')) return 'network'
  return 'unknown'
}
