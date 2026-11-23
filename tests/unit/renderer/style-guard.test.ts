import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Teste-guarda da identidade visual (H04.2, ADR-014):
// - cor literal só em styles/tokens.css;
// - a paleta antiga (terracota do Claude) não volta em lugar nenhum do código.
const ROOT = resolve(__dirname, '../../..')
const RENDERER = join(ROOT, 'src/renderer')
const TOKENS = join(RENDERER, 'src/styles/tokens.css')

function files(dir: string, re: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p, re) : re.test(name) ? [p] : []
  })
}

const LITERAL = /(?<![&\w])#[0-9a-f]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d/i

describe('cores só em tokens.css', () => {
  const all = files(join(RENDERER, 'src'), /\.(css|ts|tsx)$/).filter((f) => f !== TOKENS)
  it('existem arquivos para verificar', () => {
    expect(all.length).toBeGreaterThan(10)
  })
  it.each(all.map((f) => relative(ROOT, f)))('%s sem cor literal', (rel) => {
    const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n')
    const bad = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => LITERAL.test(l))
    expect(bad, bad.map(([n, l]) => `${rel}:${n}: ${l.trim()}`).join('\n')).toEqual([])
  })
})

describe('paleta antiga banida', () => {
  const OLD = /d97757|e8936f|e6e2da|d95926|217,\s*119,\s*87|◆/i
  const code = [...files(join(ROOT, 'src'), /\.(css|ts|tsx|html)$/), join(ROOT, 'electron.vite.config.mjs')]
  it.each(code.map((f) => relative(ROOT, f)))('%s sem terracota/creme/◆', (rel) => {
    expect(readFileSync(join(ROOT, rel), 'utf8')).not.toMatch(OLD)
  })
})
