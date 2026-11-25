import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Instância única (achado da Sprint 05, trilha rápida da Sprint 06). O ciclo de vida do Electron não roda no
// Vitest, então o teste confere a ordem no código do main: o lock vem antes de qualquer escrita em userData e a
// segunda instância não migra nem abre nada.
const src = readFileSync(join(__dirname, '../../../src/main/index.ts'), 'utf8')
const pos = (trecho: string): number => {
  const i = src.indexOf(trecho)
  expect(i, trecho).toBeGreaterThanOrEqual(0)
  return i
}

describe('instância única do app', () => {
  it('pede o lock depois de fixar userData e antes de migrar dados', () => {
    const lock = pos('app.requestSingleInstanceLock()')
    expect(lock).toBeGreaterThan(pos("app.setPath('userData'"))
    expect(lock).toBeLessThan(pos('migrateLegacyData()'))
    expect(lock).toBeLessThan(pos('migrateSettings()'))
  })

  it('segunda instância sai sem migrar nem abrir janela', () => {
    expect(src).toMatch(/if \(!primeiraInstancia\) app\.exit\(0\)/)
    expect(src).toMatch(/if \(primeiraInstancia\) \{\s*migrateLegacyData\(\)\s*migrateSettings\(\)\s*\}/)
    expect(src).toMatch(/app\.whenReady\(\)\.then\(\(\) => \{\s*if \(!primeiraInstancia\) return/)
  })

  it('second-instance só traz a janela para a frente e ignora a linha de comando', () => {
    const m = /app\.on\('second-instance', \(([^)]*)\) => \{([\s\S]*?)\n\}\)/.exec(src)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('')
    expect(m![2]).toContain('mostrarJanelaPrincipal()')
  })
})
