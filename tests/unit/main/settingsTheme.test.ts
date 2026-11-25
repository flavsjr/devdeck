import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../../src/shared/types'

// H06.1 (T29): normalização do `theme` na leitura do settings.json, rodando o store.ts de verdade
// numa pasta temporária (electron simulado só no necessário para o store carregar).

const h = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  safeStorage: {
    isEncryptionAvailable: () => false,
    getSelectedStorageBackend: () => 'basic_text',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

// store.ts fica fora do tsconfig.test (importa electron): import dinâmico com a forma mínima usada aqui.
interface StoreModule {
  getSettings(): AppSettings
  updateSettings(patch: Partial<AppSettings>): AppSettings
  migrateSettings(): void
}
const MAIN = '../../../src/main/'
const store = (await import(/* @vite-ignore */ MAIN + 'store')) as StoreModule

const base = mkdtempSync(join(tmpdir(), 'devdeck-theme-'))
let n = 0
const settingsFile = (): string => join(h.userData, 'settings.json')
const writeSettings = (data: unknown): void => writeFileSync(settingsFile(), typeof data === 'string' ? data : JSON.stringify(data), 'utf8')
const readDisk = (): Record<string, unknown> => JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown>

beforeEach(() => {
  // Pasta nova por teste: instalação nova até alguém gravar o settings.json.
  h.userData = mkdtempSync(join(base, `u${n++}-`))
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('store: theme no settings', () => {
  it('instalação nova (sem settings.json) segue o sistema', () => {
    expect(existsSync(settingsFile())).toBe(false)
    expect(store.getSettings().theme).toBe('system')
  })

  it('settings existente sem theme fica escuro', () => {
    writeSettings({ model: 'claude-opus-5-5', settingsVersion: 3 })
    expect(store.getSettings().theme).toBe('dark')
  })

  it('settings existente mas ilegível conta como existente (escuro), sem lançar', () => {
    writeSettings('{ isto não é json')
    expect(() => store.getSettings()).not.toThrow()
    expect(store.getSettings().theme).toBe('dark')
  })

  it('settings.json com "null" não derruba a leitura', () => {
    writeSettings('null')
    expect(store.getSettings().theme).toBe('dark')
  })

  it.each([['azul'], [42], [null], [''], [{ x: 1 }]])('theme inválido no disco (%j) vira system sem lançar', (theme) => {
    writeSettings({ theme, settingsVersion: 3 })
    expect(() => store.getSettings()).not.toThrow()
    expect(store.getSettings().theme).toBe('system')
  })

  it.each([['system'], ['dark'], ['light']])('theme válido no disco (%s) passa', (theme) => {
    writeSettings({ theme, settingsVersion: 3 })
    expect(store.getSettings().theme).toBe(theme)
  })

  it('a primeira escrita grava o padrão resolvido: existente sem theme continua escuro', () => {
    writeSettings({ settingsVersion: 3 })
    store.updateSettings({ spotifyUrl: '' })
    expect(readDisk().theme).toBe('dark')
    expect(store.getSettings().theme).toBe('dark')
  })

  it('a primeira escrita em instalação nova grava system', () => {
    store.updateSettings({ lastWorkspace: null })
    expect(readDisk().theme).toBe('system')
  })

  it('updateSettings troca e persiste o tema', () => {
    writeSettings({ settingsVersion: 3 })
    expect(store.updateSettings({ theme: 'light' }).theme).toBe('light')
    expect(readDisk().theme).toBe('light')
    expect(store.getSettings().theme).toBe('light')
  })

  it('migrateSettings não inventa theme (a ausência continua significando "existente → escuro")', () => {
    writeSettings({ loadProjectSettings: true })
    store.migrateSettings()
    expect(readDisk().theme).toBeUndefined()
    expect(store.getSettings().theme).toBe('dark')
  })
})
