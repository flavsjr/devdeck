import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseTokens, resolveColor, tokenContrast } from '../../../src/renderer/src/lib/contrast'

const css = readFileSync(resolve(__dirname, '../../../src/renderer/src/styles/tokens.css'), 'utf8')
const tokens = parseTokens(css)

describe('lib/contrast', () => {
  it('fórmula WCAG: preto × branco = 21, igual × igual = 1', () => {
    expect(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5)
    expect(contrastRatio([10, 20, 30, 1], [10, 20, 30, 1])).toBeCloseTo(1, 5)
  })
  it('resolve var() encadeado e color-mix com transparente', () => {
    const t = parseTokens(':root { --a: #ffffff; --b: var(--a); --c: color-mix(in srgb, var(--b) 50%, transparent); }')
    expect(resolveColor('--b', t)).toEqual([255, 255, 255, 1])
    expect(resolveColor('--c', t)[3]).toBeCloseTo(0.5)
  })
  it('acusa token inexistente e valor não suportado', () => {
    expect(() => resolveColor('--nada', tokens)).toThrow(/não existe/)
    expect(() => resolveColor('--x', { '--x': 'hsl(1 2% 3%)' })).toThrow(/não suportado/)
  })
})

// Pares realmente usados na UI. Texto ≥ 4,5:1 (AA); componentes e foco ≥ 3:1 (WCAG 1.4.11).
const SURFACES = ['--bg', '--bg-1', '--bg-2', '--bg-3']
const TEXT = ['--fg', '--fg-2', '--muted', '--accent', '--ok', '--bad', '--warn']

describe('tokens "Índigo Noturno" passam AA', () => {
  for (const fg of TEXT)
    for (const bg of SURFACES)
      it(`${fg} sobre ${bg} ≥ 4,5`, () => {
        expect(tokenContrast(fg, bg, tokens)).toBeGreaterThanOrEqual(4.5)
      })

  it.each([
    ['--on-accent', '--accent'],
    ['--on-accent', '--accent-2'],
    ['--on-warn', '--warn'],
    ['--fg', '--accent-bg'],
    ['--accent', '--accent-bg'],
    ['--fg', '--warn-bg'],
    ['--bad', '--bad-bg'],
    ['--ok', '--ok-bg'],
    ['--fg', '--add-bg'],
    ['--fg', '--del-bg']
  ])('%s sobre %s ≥ 4,5', (fg, bg) => {
    expect(tokenContrast(fg, bg, tokens)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--bg', '--bg-1', '--bg-2', '--bg-3'])('anel de foco sobre %s ≥ 3', (bg) => {
    expect(tokenContrast('--focus', bg, tokens)).toBeGreaterThanOrEqual(3)
  })

  it('borda de campo (--line-strong) sobre o fundo do campo (--bg) ≥ 3', () => {
    expect(tokenContrast('--line-strong', '--bg', tokens)).toBeGreaterThanOrEqual(3)
  })

  it('branco sobre accent reprovaria (por isso --on-accent é escuro)', () => {
    const t = { ...tokens, '--white': '#ffffff' }
    expect(tokenContrast('--white', '--accent', t)).toBeLessThan(4.5)
  })
})
