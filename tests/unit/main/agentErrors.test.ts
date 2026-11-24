import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentErrorCode } from '../../../src/shared/types'
import { AGENT_ERROR_CODES, KNOWN_SDK_ERRORS, classifyAgentError } from '../../../src/main/lib/agentErrors'

// H06.3/H06.7: o classificador contra as mensagens reais do SDK 0.3.330 (spike T01).
// Fixture nova sem código esperado, ou enum do SDK diferente do conhecido, quebra o teste.

interface Fixture {
  scenario: string
  sdk: string
  origem: string
  init: { apiKeySource: string }
  assistant: { error: string; text: string }
  result: { subtype: string; is_error: boolean; result: string; api_error_status: number | null }
  thrown: { message: string }
}

const DIR = resolve(__dirname, '../../fixtures/agent-errors')
const SDK_DIR = resolve(__dirname, '../../../node_modules/@anthropic-ai/claude-agent-sdk')
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture)

/** Código esperado por cenário. Fixture nova precisa entrar aqui. */
const ESPERADO: Record<string, AgentErrorCode> = {
  billing: 'billing',
  invalid_key: 'auth_invalid_key',
  missing_credentials: 'auth_missing',
  no_network: 'network',
  oauth_expired: 'auth_expired',
  overloaded: 'overloaded',
  rate_limit: 'rate_limit'
}

/** Chave salva no DevDeck nos cenários capturados: quando o init diz ANTHROPIC_API_KEY. */
const hasKey = (f: Fixture): boolean => f.init.apiKeySource === 'ANTHROPIC_API_KEY'

describe('classifyAgentError com as fixtures do SDK', () => {
  it('todas as fixtures são do SDK instalado e têm código esperado', () => {
    const pkg = JSON.parse(readFileSync(join(SDK_DIR, 'package.json'), 'utf8')) as { version: string }
    expect(fixtures.length).toBeGreaterThanOrEqual(7)
    for (const f of fixtures) {
      expect(f.sdk, `${f.scenario}: regravar a fixture ao atualizar o SDK`).toBe(pkg.version)
      expect(ESPERADO[f.scenario], `${f.scenario} sem código esperado`).toBeDefined()
    }
  })

  it.each(fixtures.map((f) => [f.scenario, f] as const))('%s', (_nome, f) => {
    const base = { error: f.assistant.error, apiKeySource: f.init.apiKeySource, hasApiKey: hasKey(f) }
    // Na mensagem do assistente ainda não há status; no result, há.
    expect(classifyAgentError({ ...base, text: f.assistant.text })).toBe(
      // 529 chega como server_error: só o status do result revela a sobrecarga.
      f.scenario === 'overloaded' ? 'unknown' : ESPERADO[f.scenario]
    )
    expect(classifyAgentError({ ...base, text: f.result.result, apiErrorStatus: f.result.api_error_status })).toBe(ESPERADO[f.scenario])
  })

  it('o código sai do enum e do status, não do texto, quando eles bastam', () => {
    for (const f of fixtures) {
      if (f.scenario === 'missing_credentials' || f.scenario === 'oauth_expired' || f.scenario === 'no_network') continue
      const semTexto = classifyAgentError({ error: f.assistant.error, apiKeySource: f.init.apiKeySource, hasApiKey: hasKey(f), apiErrorStatus: f.result.api_error_status })
      expect(semTexto, f.scenario).toBe(ESPERADO[f.scenario])
    }
  })
})

describe('classifyAgentError: desempate de authentication_failed', () => {
  const auth = 'authentication_failed'
  it('chave salva ou origem de chave → chave recusada, qualquer que seja o texto', () => {
    expect(classifyAgentError({ error: auth, hasApiKey: true, apiKeySource: 'none', text: 'Not logged in' })).toBe('auth_invalid_key')
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'ANTHROPIC_API_KEY' })).toBe('auth_invalid_key')
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'apiKeyHelper' })).toBe('auth_invalid_key')
  })
  it('sem chave: texto só como fallback', () => {
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'none', text: 'Not logged in · Please run /login' })).toBe('auth_missing')
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'none', text: 'OAuth token has expired' })).toBe('auth_expired')
  })
  it('sem chave: os três textos documentados de sessão expirada → auth_expired (sem caixa)', () => {
    const textos = [
      'OAuth session expired and could not be refreshed',
      'Login reached its time limit',
      'Login expired',
      'LOGIN REACHED ITS TIME LIMIT · Please run /login',
      'login expired'
    ]
    for (const text of textos) {
      expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'none', text }), text).toBe('auth_expired')
    }
    // "Not logged in" continua sendo sem conta, mesmo em outra caixa.
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'none', text: 'NOT LOGGED IN' })).toBe('auth_missing')
  })
  it('sem chave e texto desconhecido → sessão expirada (falha segura)', () => {
    expect(classifyAgentError({ error: auth, hasApiKey: false, apiKeySource: 'none', text: 'algo novo' })).toBe('auth_expired')
    expect(classifyAgentError({ error: auth, hasApiKey: false })).toBe('auth_expired')
  })
  it('401 sem enum: com chave → chave recusada; sem chave → sessão expirada', () => {
    expect(classifyAgentError({ apiErrorStatus: 401, hasApiKey: true })).toBe('auth_invalid_key')
    expect(classifyAgentError({ apiErrorStatus: 401, hasApiKey: false, apiKeySource: 'none' })).toBe('auth_expired')
  })
})

describe('classifyAgentError: demais códigos', () => {
  it('limite: enum ou 429', () => {
    expect(classifyAgentError({ error: 'rate_limit', hasApiKey: true })).toBe('rate_limit')
    expect(classifyAgentError({ error: 'server_error', apiErrorStatus: 429, hasApiKey: true })).toBe('rate_limit')
    expect(classifyAgentError({ apiErrorStatus: 429, hasApiKey: false })).toBe('rate_limit')
  })
  it('sobrecarga: enum overloaded ou 529 (que chega como server_error)', () => {
    expect(classifyAgentError({ error: 'overloaded', hasApiKey: true })).toBe('overloaded')
    expect(classifyAgentError({ error: 'server_error', apiErrorStatus: 529, hasApiKey: true })).toBe('overloaded')
  })
  it('créditos: billing_error', () => {
    expect(classifyAgentError({ error: 'billing_error', apiErrorStatus: 400, hasApiKey: true })).toBe('billing')
  })
  it('sem rede: server_error, status nulo e código de rede no texto', () => {
    for (const t of ['connect ECONNREFUSED 127.0.0.1:443', 'getaddrinfo ENOTFOUND api.anthropic.com', 'ETIMEDOUT', 'Connection refused']) {
      expect(classifyAgentError({ error: 'server_error', apiErrorStatus: null, hasApiKey: true, text: t }), t).toBe('network')
    }
    // Com status HTTP não é falta de rede; sem texto de rede também não.
    expect(classifyAgentError({ error: 'server_error', apiErrorStatus: 500, hasApiKey: true, text: 'ECONNREFUSED' })).toBe('unknown')
    expect(classifyAgentError({ error: 'server_error', apiErrorStatus: null, hasApiKey: true, text: 'Internal error' })).toBe('unknown')
  })
  it('enum desconhecido vira unknown, mesmo com status que daria outro código', () => {
    expect(classifyAgentError({ error: 'quota_exhausted_v2', apiErrorStatus: 429, hasApiKey: true })).toBe('unknown')
    expect(classifyAgentError({ error: '__proto__', hasApiKey: true })).toBe('unknown')
    expect(classifyAgentError({ error: 'toString', hasApiKey: true })).toBe('unknown')
  })
  it('enum conhecido sem card próprio e erro sem nada → unknown', () => {
    for (const e of ['invalid_request', 'model_not_found', 'max_output_tokens', 'unknown', 'oauth_org_not_allowed']) {
      expect(classifyAgentError({ error: e, hasApiKey: true }), e).toBe('unknown')
    }
    expect(classifyAgentError({ hasApiKey: false })).toBe('unknown')
  })
  it('a saída é sempre um dos códigos da lista', () => {
    const entradas = [...KNOWN_SDK_ERRORS, 'xyz', undefined].flatMap((error) =>
      [undefined, null, 401, 429, 529, 500].flatMap((apiErrorStatus) => [true, false].map((hasApiKey) => ({ error, apiErrorStatus, hasApiKey })))
    )
    for (const i of entradas) expect(AGENT_ERROR_CODES).toContain(classifyAgentError(i))
  })
})

describe('enum do SDK instalado = enum conhecido pelo classificador', () => {
  it('SDKAssistantMessageError no sdk.d.ts tem exatamente os valores mapeados', () => {
    const dts = readFileSync(join(SDK_DIR, 'sdk.d.ts'), 'utf8')
    const m = /export declare type SDKAssistantMessageError =([^;]+);/.exec(dts)
    expect(m, 'tipo SDKAssistantMessageError sumiu do sdk.d.ts').not.toBeNull()
    const doSdk = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    expect(doSdk).toEqual([...KNOWN_SDK_ERRORS].sort())
  })
})
