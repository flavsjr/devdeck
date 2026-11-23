import { describe, expect, it } from 'vitest'
import { collapse, gapLabel, rowsFromPatch, rowsFromTexts, toSplit, type Row } from '../../../src/renderer/src/lib/diffRows'
import { makePatch } from '../../../src/main/lib/edit'

describe('rowsFromTexts', () => {
  it('ctx, del e add com numeração', () => {
    expect(rowsFromTexts('a\nb\n', 'a\nc\n')).toEqual([
      { type: 'ctx', oldNo: 1, newNo: 1, text: 'a' },
      { type: 'del', oldNo: 2, text: 'b' },
      { type: 'add', newNo: 2, text: 'c' }
    ])
  })
  it('textos iguais ou vazios → "Sem diferenças"', () => {
    expect(rowsFromTexts('x\n', 'x\n')).toEqual([{ type: 'gap', text: 'Sem diferenças' }])
    expect(rowsFromTexts('', '')).toEqual([{ type: 'gap', text: 'Sem diferenças' }])
  })
  it('remove \\r de arquivos CRLF', () => {
    const rows = rowsFromTexts('a\r\nb\r\n', 'a\r\nc\r\n')
    expect(rows.every((r) => !r.text.includes('\r'))).toBe(true)
  })
})

describe('collapse', () => {
  it('mantém 3 linhas de contexto e recolhe o resto', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n') + '\n'
    const rows = rowsFromTexts(before, before.replace('l10\n', 'L10\n'))
    expect(rows[0]).toEqual({ type: 'gap', text: gapLabel(6) })
    expect(rows.filter((r) => r.type === 'ctx')).toHaveLength(6)
    expect(rows[rows.length - 1]).toEqual({ type: 'gap', text: gapLabel(7) })
  })
  it('singular e plural', () => {
    expect(gapLabel(1)).toBe('… 1 linha sem alteração')
    expect(gapLabel(2)).toBe('… 2 linhas sem alteração')
  })
  it('lista vazia → "Sem diferenças"', () => {
    expect(collapse([])).toEqual([{ type: 'gap', text: 'Sem diferenças' }])
  })
})

describe('toSplit', () => {
  it('pareia remoções e adições; contexto igual dos dois lados', () => {
    const rows: Row[] = [
      { type: 'ctx', oldNo: 1, newNo: 1, text: 'a' },
      { type: 'del', oldNo: 2, text: 'b' },
      { type: 'del', oldNo: 3, text: 'c' },
      { type: 'add', newNo: 2, text: 'B' }
    ]
    const split = toSplit(rows)
    expect(split[0].left).toBe(split[0].right)
    expect(split[1]).toEqual({ left: rows[1], right: rows[3] })
    expect(split[2]).toEqual({ left: rows[2], right: undefined })
  })
})

describe('rowsFromPatch', () => {
  it('lê o patch unificado gravado no chat', () => {
    const rows = rowsFromPatch(makePatch('a.ts', 'x\ny\n', 'x\nz\n'))
    expect(rows.map((r) => r.type)).toEqual(['ctx', 'del', 'add'])
  })
  it.todo('Sprint 04: diff de arquivo grande não congela a tela (limite de edição)')
})
