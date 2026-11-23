import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore, normalize } from '../../../src/renderer/src/lib/fuzzy'

const label = (s: string): string => s

describe('normalize', () => {
  it('tira acento e caixa', () => {
    expect(normalize('Configurações')).toBe('configuracoes')
    expect(normalize('AGÊNDA')).toBe('agenda')
  })
})

describe('fuzzyScore', () => {
  it('subsequência casa; fora de ordem não', () => {
    expect(fuzzyScore('agd', 'Agenda')).not.toBeNull()
    expect(fuzzyScore('dga', 'Agenda')).toBeNull()
  })
  it('ignora acento e espaço na busca', () => {
    expect(fuzzyScore('config', 'Ir para Configurações')).not.toBeNull()
    expect(fuzzyScore('alteracoes', 'Alterações')).not.toBeNull()
    expect(fuzzyScore('novo chat', 'Novo chat')).not.toBeNull()
  })
  it('consecutivo e início de palavra pontuam mais', () => {
    expect(fuzzyScore('age', 'Agenda')!).toBeGreaterThan(fuzzyScore('age', 'mAnaGEr')!)
    expect(fuzzyScore('nc', 'Novo chat')!).toBeGreaterThan(fuzzyScore('nc', 'financeiro')!)
  })
  it('query vazia casa tudo com 0', () => {
    expect(fuzzyScore('', 'qualquer')).toBe(0)
  })
})

describe('fuzzyFilter', () => {
  const items = ['Ir para Chat', 'Ir para Agenda', 'Novo chat', 'Ir para Custos', 'Atalhos de teclado']
  it('query vazia mantém a ordem original', () => {
    expect(fuzzyFilter(items, '', label)).toEqual(items)
  })
  it('sem resultado → lista vazia', () => {
    expect(fuzzyFilter(items, 'xyzw', label)).toEqual([])
  })
  it('melhor casamento primeiro', () => {
    expect(fuzzyFilter(items, 'agen', label)[0]).toBe('Ir para Agenda')
    expect(fuzzyFilter(items, 'novo', label)[0]).toBe('Novo chat')
  })
  it('procura em palavras-chave com peso menor', () => {
    const r = fuzzyFilter(items, 'atalho', label, (s) => (s === 'Ir para Chat' ? 'atalho' : ''))
    expect(r[0]).toBe('Atalhos de teclado')
    expect(r).toContain('Ir para Chat')
  })
  it('respeita o limite e aguenta 1000 itens', () => {
    const many = Array.from({ length: 1000 }, (_, i) => `sessão ${i} refatorar módulo`)
    const t0 = performance.now()
    const r = fuzzyFilter(many, 'refmod', label, undefined, 20)
    expect(r).toHaveLength(20)
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
