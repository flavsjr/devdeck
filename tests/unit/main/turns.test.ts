import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countsAsTurn, type TurnOutcome } from '../../../src/main/lib/turns'

describe('countsAsTurn', () => {
  it('turno concluído conta', () => {
    expect(countsAsTurn({ subtype: 'success', is_error: false })).toBe(true)
    expect(countsAsTurn({ subtype: 'success' })).toBe(true)
  })
  it('falha de autenticação (success com is_error) não conta', () => {
    expect(countsAsTurn({ subtype: 'success', is_error: true })).toBe(false)
  })
  it('regressão H06.3: result real das falhas de autenticação do SDK (fixtures) não conta', () => {
    const dir = resolve(__dirname, '../../fixtures/agent-errors')
    const auth = readdirSync(dir)
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { scenario: string; assistant: { error: string }; result: TurnOutcome })
      .filter((f) => f.assistant.error === 'authentication_failed')
    expect(auth.map((f) => f.scenario).sort()).toEqual(['invalid_key', 'missing_credentials', 'oauth_expired'])
    for (const f of auth) expect(countsAsTurn(f.result), f.scenario).toBe(false)
  })
  it('erros de execução, limite de turnos e orçamento não contam', () => {
    for (const subtype of ['error_during_execution', 'error_max_turns', 'error_max_budget_usd']) expect(countsAsTurn({ subtype, is_error: true }), subtype).toBe(false)
  })
})
