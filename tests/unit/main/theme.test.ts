import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_BG, THEME_PREFS, resolveTheme, themeBg } from '../../../src/main/lib/theme'
import { parseTokens, resolveColor } from '../../../src/renderer/src/lib/contrast'

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
const css = readFileSync(resolve(__dirname, '../../../src/renderer/src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const LIGHT_MEDIA = /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{/

/** Separa o bloco `@media (prefers-color-scheme: light) { … }` (chaves balanceadas) do resto do CSS. */
function splitLight(src: string): { dark: string; light: string | null } {
  const m = LIGHT_MEDIA.exec(src)
  if (!m) return { dark: src, light: null }
  const open = m.index + m[0].length
  let depth = 1
  let i = open
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
  }
  if (depth !== 0) throw new Error('Bloco @media (prefers-color-scheme: light) sem fechar no tokens.css')
  return { dark: src.slice(0, m.index) + src.slice(i), light: src.slice(open, i - 1) }
}

const { dark, light } = splitLight(css)
const darkTokens = parseTokens(dark)
const hexToRgba = (hex: string): ReturnType<typeof resolveColor> => resolveColor('--x', { '--x': hex })

describe('THEME_BG × tokens.css', () => {
  it('escuro: THEME_BG.dark é o --bg do bloco escuro (primitivos resolvidos)', () => {
    expect(resolveColor('--bg', darkTokens)).toEqual(hexToRgba(THEME_BG.dark))
  })

  // O bloco claro chega na T31 (Front). Enquanto o tokens.css não tiver
  // `@media (prefers-color-scheme: light)`, este teste é pulado; quando tiver, passa a conferir sozinho.
  // O claro herda os primitivos do :root e redefine os semânticos, então resolve com os dois juntos.
  it.skipIf(light === null)('claro: THEME_BG.light é o --bg do bloco claro (primitivos resolvidos)', () => {
    const lightTokens = { ...darkTokens, ...parseTokens(light ?? '') }
    expect(resolveColor('--bg', lightTokens)).toEqual(hexToRgba(THEME_BG.light))
  })
})
