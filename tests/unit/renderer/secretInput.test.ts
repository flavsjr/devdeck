import { describe, expect, it } from 'vitest'
import { keepAll, textToSecrets } from '../../../src/renderer/src/lib/secretInput'

const MASKED = { GITHUB_TOKEN: '••••WXYZ', DEBUG: '••••' }

describe('textToSecrets', () => {
  it('linha igual à máscara vira null (manter); valor novo passa', () => {
    const text = ['GITHUB_TOKEN=••••WXYZ', 'DEBUG=1'].join('\n')
    expect(textToSecrets(text, '=', MASKED)).toEqual({ GITHUB_TOKEN: null, DEBUG: '1' })
  })
  it('linha apagada some (remover) e linha sem separador é ignorada', () => {
    expect(textToSecrets('GITHUB_TOKEN=••••WXYZ\nlixo\n=sem chave', '=', MASKED)).toEqual({ GITHUB_TOKEN: null })
  })
  it('headers com ":" e CRLF', () => {
    expect(textToSecrets('Authorization: Bearer x\r\nX-Id: 1', ':', undefined)).toEqual({ Authorization: 'Bearer x', 'X-Id': '1' })
  })
  it('máscara digitada numa chave nova não vira null (o main recusa a máscara)', () => {
    expect(textToSecrets('OUTRA=••••WXYZ', '=', MASKED)).toEqual({ OUTRA: '••••WXYZ' })
  })
  it('valor com o separador dentro é preservado', () => {
    expect(textToSecrets('URL=a=b=c', '=', undefined)).toEqual({ URL: 'a=b=c' })
  })
})

describe('keepAll', () => {
  it('todas as chaves como null', () => {
    expect(keepAll(MASKED)).toEqual({ GITHUB_TOKEN: null, DEBUG: null })
    expect(keepAll(undefined)).toBeUndefined()
  })
})
