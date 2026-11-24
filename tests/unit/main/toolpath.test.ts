import { describe, expect, it } from 'vitest'
import { pathArgsOf, toolScope } from '../../../src/main/lib/toolpath'
import type { EditVerdict } from '../../../src/main/lib/paths'

// Classificador falso: só /w/** fica dentro; /w/.git é sensível.
const classify = (p: string): EditVerdict => (p.startsWith('/w/.git') ? 'sensitive' : p.startsWith('/w/') || p === '/w' ? 'inside' : 'outside')

describe('pathArgsOf (H05.5)', () => {
  it('tools conhecidas usam o campo delas', () => {
    expect(pathArgsOf('NotebookEdit', { notebook_path: '/w/a.ipynb', new_source: 'x' })).toEqual(['/w/a.ipynb'])
    expect(pathArgsOf('Read', { file_path: '/home/u/.ssh/id_ed25519' })).toEqual(['/home/u/.ssh/id_ed25519'])
    expect(pathArgsOf('Grep', { pattern: 'x' })).toEqual([])
  })
  it('tool desconhecida: qualquer campo com nome de caminho', () => {
    expect(pathArgsOf('Futura', { target_path: '/x', source_paths: ['/a', 3], other: '/y' })).toEqual(['/x', '/a', ''])
  })
  it('valor que não é texto vira vazio (falha fechada)', () => {
    expect(pathArgsOf('Read', { file_path: { evil: 1 } })).toEqual([''])
  })
})

describe('toolScope', () => {
  it('sem caminho ou tudo dentro: pode "sempre"', () => {
    expect(toolScope([], classify)).toEqual({ scope: 'inside', allowAlways: true })
    expect(toolScope(['/w/a', '/w/b'], classify)).toEqual({ scope: 'inside', allowAlways: true })
  })
  it('um caminho fora ou sensível tira o "sempre"; vale o pior', () => {
    expect(toolScope(['/w/a', '/w/.git/config'], classify)).toEqual({ scope: 'sensitive', allowAlways: false })
    expect(toolScope(['/w/.git/x', '/home/u/.ssh/id'], classify)).toEqual({ scope: 'outside', allowAlways: false })
    expect(toolScope([''], classify)).toEqual({ scope: 'outside', allowAlways: false })
  })
})
