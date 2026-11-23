import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Teste-guarda: módulos em lib/ precisam continuar puros (testáveis sem Electron, disco ou estado global).
const LIB_DIRS = ['src/main/lib', 'src/renderer/src/lib'].map((d) => resolve(__dirname, '../..', d))
const FORBIDDEN = [/from ['"]electron['"]/, /from ['"](node:)?fs(\/promises)?['"]/, /from ['"]\.\.?\/(\.\.\/)*store['"]/, /from ['"]\.\.?\/(\.\.\/)*events['"]/, /require\(/]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : []
  })
}

describe('pureza de lib/', () => {
  const all = LIB_DIRS.flatMap(files)
  it('existem módulos para verificar', () => {
    expect(all.length).toBeGreaterThan(0)
  })
  it.each(all)('%s não importa electron, fs, store ou events', (file) => {
    const src = readFileSync(file, 'utf8')
    for (const re of FORBIDDEN) expect(src, `${file} casa ${re}`).not.toMatch(re)
  })
})
