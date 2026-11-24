import { describe, expect, it } from 'vitest'
import { applyEdit, makePatch, previewEdit, revertText } from '../../../src/main/lib/edit'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const CRLF = CR + LF

describe('applyEdit', () => {
  it('ocorrência única é trocada', () => {
    expect(applyEdit('a b c', { old_string: 'b', new_string: 'x' })).toBe('a x c')
  })
  it('repetida sem replace_all: o Edit real falha, a prévia não muda e avisa', () => {
    expect(previewEdit('a b a', { old_string: 'a', new_string: 'x' })).toEqual({ after: 'a b a', error: expect.stringContaining('2 vezes') })
  })
  it('replace_all troca todas', () => {
    expect(applyEdit('a b a', { old_string: 'a', new_string: 'x', replace_all: true })).toBe('x b x')
  })
  it('old_string ausente → texto igual, com aviso', () => {
    expect(applyEdit('abc', { old_string: 'zzz', new_string: 'x' })).toBe('abc')
    expect(previewEdit('abc', { old_string: 'zzz', new_string: 'x' }).error).toContain('não encontrado')
  })
  it('new_string com padrões de replace é literal', () => {
    expect(applyEdit('foo', { old_string: 'foo', new_string: "$&-$1-$'" })).toBe("$&-$1-$'")
  })
  it('old_string vazio gera prévia coerente com o Edit real', () => {
    // Arquivo novo ou vazio: cria com new_string.
    expect(previewEdit('', { old_string: '', new_string: 'oi' })).toEqual({ after: 'oi' })
    // Com conteúdo: o Edit real falha; a prévia não finge mudança.
    expect(previewEdit('já existe', { old_string: '', new_string: 'oi' })).toEqual({ after: 'já existe', error: expect.stringContaining('old_string vazio') })
  })
  it('arquivo CRLF com old_string em LF: troca e mantém CRLF', () => {
    const before = ['a', 'b', 'c', ''].join(CRLF)
    expect(previewEdit(before, { old_string: ['a', 'b'].join(LF), new_string: ['A', 'B'].join(LF) })).toEqual({ after: ['A', 'B', 'c', ''].join(CRLF) })
  })
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

  it('patch gravado a partir do conteúdo real do disco (CRLF) continua reversível', () => {
    const disk = Array.from({ length: 12 }, (_, i) => `linha ${i + 1}`).join(CRLF) + CRLF
    const edited = previewEdit(disk, { old_string: ['linha 5', 'linha 6'].join(LF), new_string: ['linha CINCO', 'linha 6'].join(LF) }).after
    expect(edited).toContain(`linha CINCO${CRLF}linha 6`)
    const p = makePatch('a.ts', disk, edited)
    expect(revertText(edited, p)).toEqual({ ok: true, text: disk })
  })
})
