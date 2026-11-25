import { describe, expect, it } from 'vitest'
import type { AgentErrorCode, ChatItem } from '@shared/types'
import { TEXTO_ESTADO_AUTH, chipAuth, estadoAuth } from '../../../src/renderer/src/lib/authStatus'

let seq = 0
const user = (text = 'oi'): ChatItem => ({ kind: 'user', id: `u${++seq}`, text, ts: seq })
const erro = (code?: AgentErrorCode): ChatItem => ({ kind: 'error', id: `e${++seq}`, text: 'Erro no turno do Claude.', code, ts: seq })
const result = (isError: boolean): ChatItem => ({ kind: 'result', id: `r${++seq}`, costUsd: 0, durationMs: 1, turns: 1, isError, ts: seq })
const assistant = (): ChatItem => ({ kind: 'assistant', id: `a${++seq}`, text: 'ok', ts: seq })

describe('estadoAuth', () => {
  it('sessão vazia ou sem erro → null', () => {
    expect(estadoAuth([])).toBeNull()
    expect(estadoAuth([user(), assistant(), result(false)])).toBeNull()
  })

  it.each([
    ['auth_expired', 'sessao_expirada'],
    ['auth_invalid_key', 'chave_recusada'],
    ['auth_missing', 'sem_conta'],
    ['billing', 'sem_creditos']
  ] as const)('%s → %s', (code, estado) => {
    expect(estadoAuth([user(), erro(code), result(true)])).toBe(estado)
  })

  it.each(['rate_limit', 'overloaded', 'network', 'unknown'] as const)('%s não vira estado da conta', (code) => {
    expect(estadoAuth([user(), erro(code), result(true)])).toBeNull()
  })

  it('erro sem código (item antigo) não vira estado', () => {
    expect(estadoAuth([user(), erro(undefined)])).toBeNull()
  })

  it('some no próximo turno concluído', () => {
    expect(estadoAuth([user(), erro('auth_expired'), result(true), user(), assistant(), result(false)])).toBeNull()
  })

  it('turno que falhou de novo (sem concluir) mantém o estado', () => {
    expect(estadoAuth([user(), erro('auth_expired'), result(true), user(), erro('rate_limit'), result(true)])).toBe('sessao_expirada')
  })

  it('vale o último erro de conta', () => {
    expect(estadoAuth([user(), erro('auth_expired'), result(true), user(), erro('auth_invalid_key'), result(true)])).toBe('chave_recusada')
  })

  it('erro de conta depois de um turno concluído aparece', () => {
    expect(estadoAuth([user(), assistant(), result(false), user(), erro('billing')])).toBe('sem_creditos')
  })
})

describe('chipAuth', () => {
  it('texto e rótulo com "Ver no chat"', () => {
    expect(chipAuth([user(), erro('auth_expired')])).toEqual({ texto: 'Claude: sessão expirada', rotulo: 'Claude: sessão expirada. Ver no chat' })
  })
  it('sem estado → null', () => {
    expect(chipAuth([user(), result(false)])).toBeNull()
  })
  it('textos da barra de status (UX)', () => {
    expect(TEXTO_ESTADO_AUTH).toEqual({
      sessao_expirada: 'Claude: sessão expirada',
      chave_recusada: 'Claude: chave recusada',
      sem_conta: 'Claude: sem conta',
      sem_creditos: 'Claude: sem créditos'
    })
  })
})
