import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isUuid } from '../../../src/shared/lib/ids'

describe('isUuid (H07.4)', () => {
  it('aceita o que o main gera (randomUUID), em minúsculas ou maiúsculas', () => {
    const id = randomUUID()
    expect(isUuid(id)).toBe(true)
    expect(isUuid(id.toUpperCase())).toBe(true)
  })

  it('recusa o que não é UUID canônico', () => {
    for (const v of [
      '',
      'n1',
      '../sessions/x',
      '00000000-0000-0000-0000-000000000000', // nil: versão 0
      '123e4567-e89b-12d3-a456-42661417400', // curto
      '123e4567-e89b-12d3-a456-4266141740000', // longo
      '123e4567e89b12d3a456426614174000', // sem hífens
      '{123e4567-e89b-12d3-a456-426614174000}',
      '123e4567-e89b-12d3-c456-426614174000', // variante fora da RFC
      ' 123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174000\n',
      'g23e4567-e89b-12d3-a456-426614174000'
    ]) {
      expect(isUuid(v), JSON.stringify(v)).toBe(false)
    }
  })

  it('recusa o que não é string', () => {
    for (const v of [undefined, null, 1, {}, ['123e4567-e89b-12d3-a456-426614174000']]) expect(isUuid(v)).toBe(false)
  })

  it('controle: um v4 válido escrito à mão passa', () => {
    expect(isUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true)
  })
})
