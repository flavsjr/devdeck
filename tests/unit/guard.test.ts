import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Teste-guarda: módulos em lib/ precisam continuar puros (testáveis sem Electron, disco ou estado global).
const ROOT = resolve(__dirname, '../..')
const LIB_DIRS = ['src/main/lib', 'src/renderer/src/lib'].map((d) => resolve(ROOT, d))
const FORBIDDEN = [/from ['"]electron['"]/, /from ['"](node:)?fs(\/promises)?['"]/, /from ['"]\.\.?\/(\.\.\/)*store['"]/, /from ['"]\.\.?\/(\.\.\/)*events['"]/, /require\(/]

// src/shared/lib roda nos dois processos (ADR-020): além do acima, nada de DOM nem de estado
// de qualquer lado, por caminho relativo longo ou por alias (@renderer/store, ../../main/events).
const SHARED_LIB = resolve(ROOT, 'src/shared/lib')
const SHARED_FORBIDDEN = [
  ...FORBIDDEN,
  /from ['"](@renderer\/|[^'"]*\/)store['"]/,
  /from ['"](@renderer\/|[^'"]*\/)events['"]/,
  /from ['"](node:)?events['"]/,
  /\bwindow\b/,
  /\bdocument\b/
]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : []
  })
}

/** Tira comentários (de bloco e de linha) para "window"/"document" em comentário não contar. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
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

describe('pureza de src/shared/lib/', () => {
  const all = existsSync(SHARED_LIB) ? files(SHARED_LIB) : []
  it('existem módulos para verificar', () => {
    expect(all.length).toBeGreaterThan(0)
  })
  it.each(all)('%s não importa electron, fs, store, events nem usa window/document', (file) => {
    const src = semComentarios(readFileSync(file, 'utf8'))
    for (const re of SHARED_FORBIDDEN) expect(src, `${file} casa ${re}`).not.toMatch(re)
  })
  it('controle positivo: as regras pegam o que devem pegar', () => {
    const casos = [
      "import { app } from 'electron'",
      "import { readFileSync } from 'node:fs'",
      "import { useStore } from '@renderer/store'",
      "import { emit } from '../../main/events'",
      "import { EventEmitter } from 'node:events'",
      'const w = window.innerWidth',
      'document.hasFocus()'
    ]
    for (const c of casos) expect(SHARED_FORBIDDEN.some((re) => re.test(semComentarios(c))), c).toBe(true)
    expect(SHARED_FORBIDDEN.some((re) => re.test(semComentarios('// a window do app\nconst x = 1')))).toBe(false)
  })
})
