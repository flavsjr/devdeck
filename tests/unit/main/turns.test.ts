import { describe, expect, it } from 'vitest'
import { countsAsTurn } from '../../../src/main/lib/turns'

describe('countsAsTurn', () => {
  it('turno concluído conta', () => {
    expect(countsAsTurn({ subtype: 'success', is_error: false })).toBe(true)
    expect(countsAsTurn({ subtype: 'success' })).toBe(true)
  })
  it('falha de autenticação (success com is_error) não conta', () => {
    expect(countsAsTurn({ subtype: 'success', is_error: true })).toBe(false)
  })
  it('erros de execução, limite de turnos e orçamento não contam', () => {
    for (const subtype of ['error_during_execution', 'error_max_turns', 'error_max_budget_usd']) expect(countsAsTurn({ subtype, is_error: true }), subtype).toBe(false)
  })
})
