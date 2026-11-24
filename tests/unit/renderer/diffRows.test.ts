import { describe, expect, it } from 'vitest'
import { buildDiff, collapse, DIFF_LIMITS, gapLabel, rowsFromPatch, rowsFromTexts, toSplit, type Row } from '../../../src/renderer/src/lib/diffRows'
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
})

describe('buildDiff: arquivo grande não congela a tela (H05.4)', () => {
  const lines = (n: number, tag: string): string => Array.from({ length: n }, (_, i) => `${tag} ${i}`).join(String.fromCharCode(10)) + String.fromCharCode(10)

  it('edição pequena num arquivo de 20 mil linhas: diff completo e rápido (prefixo/sufixo cortados)', () => {
    const before = lines(20_000, 'linha')
    const after = before.replace('linha 10000\n', 'linha DEZ MIL\n')
    const t = performance.now()
    const r = buildDiff(before, after)
    expect(performance.now() - t).toBeLessThan(500)
    expect(r.partial).toBe(false)
    expect(r.rows.filter((x) => x.type === 'del').map((x) => [x.oldNo, x.text])).toEqual([[10001, 'linha 10000']])
    expect(r.rows.filter((x) => x.type === 'add').map((x) => [x.newNo, x.text])).toEqual([[10001, 'linha DEZ MIL']])
  })

  it('dois arquivos de 50 mil linhas totalmente diferentes: prévia parcial, numeração correta, < 500 ms', () => {
    const t = performance.now()
    const r = buildDiff(lines(50_000, 'a'), lines(50_000, 'b'))
    expect(performance.now() - t).toBeLessThan(500)
    expect(r.partial).toBe('size')
    expect(r.rows[0]).toEqual({ type: 'del', oldNo: 1, text: 'a 0' })
    expect(r.rows).toHaveLength(DIFF_LIMITS.renderRows + 1)
    expect(r.rows.at(-1)?.text).toMatch(/linhas não exibidas/)
  })

  it('linha gigante (minificado) é cortada', () => {
    const r = buildDiff('x\n', `${'y'.repeat(20_000)}\n`)
    const add = r.rows.find((x) => x.type === 'add')
    expect(add?.text.length).toBeLessThan(DIFF_LIMITS.lineChars + 30)
    expect(add?.text).toMatch(/linha cortada/)
  })

  it('mesmo resultado do diff antigo em arquivos pequenos', () => {
    expect(buildDiff('a\nb\nc\n', 'a\nx\nc\n')).toEqual({ rows: rowsFromTexts('a\nb\nc\n', 'a\nx\nc\n'), partial: false })
    expect(buildDiff('', 'novo\n').rows).toEqual([{ type: 'add', newNo: 1, text: 'novo' }])
    expect(buildDiff('igual\n', 'igual\n').rows).toEqual([{ type: 'gap', text: 'Sem diferenças' }])
  })
})
