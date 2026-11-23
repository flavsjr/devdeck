import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regressão da H03.5: o Electron não implementa window.prompt — chamar devolve null e a ação some sem aviso.
const RENDERER = resolve(__dirname, '../../../src/renderer/src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : []
  })
}

describe('renderer sem window.prompt', () => {
  it.each(files(RENDERER))('%s não chama prompt(', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\bprompt\(/)
  })
})
