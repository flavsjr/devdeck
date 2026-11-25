import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_BG, THEME_PREFS, resolveTheme, themeBg } from '../../../src/main/lib/theme'
import { resolveColor, themeTokens } from '../../../src/renderer/src/lib/contrast'

describe('resolveTheme', () => {
  it.each(THEME_PREFS)('valor válido "%s" passa, exista ou não o settings', (pref) => {
    expect(resolveTheme(pref, true)).toBe(pref)
    expect(resolveTheme(pref, false)).toBe(pref)
  })

  it.each([['azul'], [''], ['DARK'], [1], [null], [true], [{}], [['dark']]])('valor inválido %j vira "system" sem lançar', (raw) => {
    expect(resolveTheme(raw, true)).toBe('system')
    expect(resolveTheme(raw, false)).toBe('system')
  })

  it('ausente com settings existente fica "dark" (quem já usava não leva susto)', () => {
    expect(resolveTheme(undefined, true)).toBe('dark')
  })

  it('ausente em instalação nova segue o sistema', () => {
    expect(resolveTheme(undefined, false)).toBe('system')
  })
})

describe('themeBg', () => {
  it('escolhe pelo shouldUseDarkColors', () => {
    expect(themeBg(true)).toBe(THEME_BG.dark)
    expect(themeBg(false)).toBe(THEME_BG.light)
  })
  it('cores são hex opacos #rrggbb (formato aceito pelo BrowserWindow)', () => {
    for (const c of Object.values(THEME_BG)) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

// THEME_BG precisa ser igual ao --bg de cada tema no tokens.css; senão a janela pisca numa cor e o CSS pinta outra.
const { dark, light } = themeTokens(readFileSync(resolve(__dirname, '../../../src/renderer/src/styles/tokens.css'), 'utf8'))
const hexToRgba = (hex: string): ReturnType<typeof resolveColor> => resolveColor('--x', { '--x': hex })

describe('THEME_BG × tokens.css', () => {
  it('escuro: THEME_BG.dark é o --bg do bloco escuro (primitivos resolvidos)', () => {
    expect(resolveColor('--bg', dark)).toEqual(hexToRgba(THEME_BG.dark))
  })

  it('claro: THEME_BG.light é o --bg do bloco claro (primitivos resolvidos)', () => {
    expect(light).not.toBeNull()
    expect(resolveColor('--bg', light!)).toEqual(hexToRgba(THEME_BG.light))
  })
})
