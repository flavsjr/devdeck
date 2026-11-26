import { describe, expect, it } from 'vitest'
import { proximoTema, rotuloAlternarTema } from '../../../src/renderer/src/lib/tema'

describe('"Alternar tema" na paleta (T47)', () => {
  it('alterna pelo tema na tela: claro → Escuro, escuro → Claro (também saindo de "Sistema")', () => {
    expect(proximoTema(true)).toBe('dark')
    expect(proximoTema(false)).toBe('light')
  })

  it('nunca devolve "system" (voltar ao Sistema é em Configurações)', () => {
    expect([proximoTema(true), proximoTema(false)]).not.toContain('system')
  })

  it('rótulo diz o destino, coerente com o tema gravado', () => {
    expect(rotuloAlternarTema(true)).toBe('Alternar tema: usar Escuro')
    expect(rotuloAlternarTema(false)).toBe('Alternar tema: usar Claro')
    expect(rotuloAlternarTema(true)).toContain(proximoTema(true) === 'dark' ? 'Escuro' : 'Claro')
  })
})
