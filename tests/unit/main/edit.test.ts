import { describe, expect, it } from 'vitest'
import { applyEdit, makePatch, revertText } from '../../../src/main/lib/edit'

describe('applyEdit', () => {
  it('troca só a primeira ocorrência', () => {
    expect(applyEdit('a b a', { old_string: 'a', new_string: 'x' })).toBe('x b a')
  })
  it('replace_all troca todas', () => {
    expect(applyEdit('a b a', { old_string: 'a', new_string: 'x', replace_all: true })).toBe('x b x')
  })
  it('old_string ausente → texto igual', () => {
    expect(applyEdit('abc', { old_string: 'zzz', new_string: 'x' })).toBe('abc')
  })
  it('new_string com padrões de replace é literal', () => {
    expect(applyEdit('foo', { old_string: 'foo', new_string: "$&-$1-$'" })).toBe("$&-$1-$'")
  })
  it.todo('Sprint 04: old_string vazio gera prévia coerente com o Edit real')
})

describe('makePatch + revertText', () => {
  const before = Array.from({ length: 20 }, (_, i) => `linha ${i + 1}`).join('\n') + '\n'
  const after = before.replace('linha 10', 'linha DEZ')
  const patch = makePatch('src/a.ts', before, after)

  it('reverte para o original', () => {
    expect(revertText(after, patch)).toEqual({ ok: true, text: before })
  })

  it('preserva edição do usuário em outro trecho', () => {
    const userEdited = after.replace('linha 1\n', 'linha UM\n')
    const r = revertText(userEdited, patch)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.text).toContain('linha UM')
      expect(r.text).toContain('linha 10')
    }
  })

  it('conflito quando o usuário editou o mesmo trecho', () => {
    const r = revertText(after.replace('linha DEZ', 'linha 10 do usuário'), patch)
    expect(r.ok).toBe(false)
  })

  it('arquivo criado: reverter devolve vazio (quem chama apaga)', () => {
    const created = makePatch('novo.ts', '', 'export const x = 1\n')
    expect(revertText('export const x = 1\n', created)).toEqual({ ok: true, text: '' })
  })

  it('patch sem mudanças → erro "nada a reverter"', () => {
    const r = revertText('igual\n', makePatch('a.ts', 'igual\n', 'igual\n'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Nada a reverter/)
  })

  it('duas alterações no mesmo arquivo revertidas em ordem inversa', () => {
    const a1 = before.replace('linha 3', 'linha TRÊS')
    const p1 = makePatch('a.ts', before, a1)
    const a2 = a1.replace('linha 15', 'linha QUINZE')
    const p2 = makePatch('a.ts', a1, a2)
    const r2 = revertText(a2, p2)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(revertText(r2.text, p1)).toEqual({ ok: true, text: before })
  })

  it.todo('Sprint 04: patch gravado a partir do conteúdo real do disco (CRLF) continua reversível')
})
