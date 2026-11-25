import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseTokens, resolveColor, splitLightBlock, themeTokens, tokenContrast } from '../../../src/renderer/src/lib/contrast'

const css = readFileSync(resolve(__dirname, '../../../src/renderer/src/styles/tokens.css'), 'utf8')
const { dark, light } = themeTokens(css)

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
    expect(() => resolveColor('--nada', dark)).toThrow(/não existe/)
    expect(() => resolveColor('--x', { '--x': 'hsl(1 2% 3%)' })).toThrow(/não suportado/)
  })
  it('separa o bloco claro com chaves aninhadas e o claro herda os primitivos', () => {
    const src = ':root { --p: #000000; --bg: var(--p); } @media (prefers-color-scheme: light) { :root { --q: #ffffff; --bg: var(--q); } } .x { --y: 1; }'
    const s = splitLightBlock(src)
    expect(s.light).toContain('--bg: var(--q)')
    expect(s.dark).toContain('.x')
    expect(s.dark).not.toContain('--q')
    const t = themeTokens(src)
    expect(resolveColor('--bg', t.dark)).toEqual([0, 0, 0, 1])
    expect(resolveColor('--bg', t.light!)).toEqual([255, 255, 255, 1])
  })
  it('sem bloco claro: light é null; bloco sem fechar lança', () => {
    expect(themeTokens(':root { --a: #000000; }').light).toBeNull()
    expect(() => splitLightBlock('@media (prefers-color-scheme: light) { :root { --a: #fff;')).toThrow(/sem fechar/)
  })
})

it('tokens.css tem tema claro (H06.1)', () => {
  expect(light).not.toBeNull()
})

// Todo semântico (valor que referencia outro token) do escuro precisa existir no claro; forma e tipo não mudam.
const FORMA = new Set(['--radius'])
it('todo semântico de cor do escuro é redefinido no bloco claro', () => {
  const lightOnly = parseTokens(splitLightBlock(css).light ?? '')
  const semanticos = Object.entries(dark)
    .filter(([k, v]) => v.includes('var(') && !FORMA.has(k))
    .map(([k]) => k)
  for (const k of semanticos) expect(Object.keys(lightOnly), k).toContain(k)
})

// Pares realmente usados na UI. Texto ≥ 4,5:1 (AA); componentes e foco ≥ 3:1 (WCAG 1.4.11).
const SURFACES = ['--bg', '--bg-1', '--bg-2', '--bg-3']
const TEXT = ['--fg', '--fg-2', '--muted', '--accent', '--ok', '--bad', '--warn']
const TEMAS: [string, Record<string, string>][] = [
  ['escuro', dark],
  ['claro', light ?? dark]
]

describe.each(TEMAS)('tokens do tema %s passam AA', (tema, tokens) => {
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
    ['--fg', '--del-bg'],
    // Sinal do diff (H06.1): + e − coloridos sobre o fundo da própria linha.
    ['--ok', '--add-bg'],
    ['--bad', '--del-bg']
  ])('%s sobre %s ≥ 4,5', (fg, bg) => {
    expect(tokenContrast(fg, bg, tokens)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--bg', '--bg-1', '--bg-2', '--bg-3'])('anel de foco sobre %s ≥ 3', (bg) => {
    expect(tokenContrast('--focus', bg, tokens)).toBeGreaterThanOrEqual(3)
  })

  it('borda de campo (--line-strong) sobre o fundo do campo (--bg) ≥ 3', () => {
    expect(tokenContrast('--line-strong', '--bg', tokens)).toBeGreaterThanOrEqual(3)
  })

  // Notificações (H06.2): texto e ícone sobre o cartão opaco; conquista sobre o fundo tingido composto no cartão.
  it.each(['--fg', '--fg-2', '--notify-erro', '--notify-aviso', '--notify-sucesso', '--notify-info', '--notify-conquista'])(
    '%s sobre --notify-surface ≥ 4,5',
    (fg) => {
      expect(tokenContrast(fg, '--notify-surface', tokens)).toBeGreaterThanOrEqual(4.5)
    }
  )

  it.each(['--fg', '--fg-2', '--notify-conquista'])('%s sobre --notify-conquista-bg (no cartão) ≥ 4,5', (fg) => {
    expect(tokenContrast(fg, '--notify-conquista-bg', tokens, '--notify-surface')).toBeGreaterThanOrEqual(4.5)
  })

  it('anel de foco sobre --notify-surface ≥ 3', () => {
    expect(tokenContrast('--focus', '--notify-surface', tokens)).toBeGreaterThanOrEqual(3)
  })

  // Escuro: accent claro, texto branco reprovaria (--on-accent é escuro). Claro: accent escuro, branco passa.
  // Dataviz (H06.1): a célula com pouca atividade se separa da vazia (--bg-3) como no escuro, a escala é
  // ordenada com degraus visíveis e a cor categórica é componente gráfico (≥ 3 sobre o fundo).
  it('escala --viz-heat: passo 1 separado da célula vazia e degraus ≥ 1,25', () => {
    expect(tokenContrast('--viz-heat-1', '--bg-3', tokens)).toBeGreaterThanOrEqual(1.25)
    for (const [a, b] of [['--viz-heat-2', '--viz-heat-1'], ['--viz-heat-3', '--viz-heat-2'], ['--viz-heat-4', '--viz-heat-3']])
      expect(tokenContrast(a, b, tokens), `${a} × ${b}`).toBeGreaterThanOrEqual(1.25)
  })

  it.each(['--viz-cat-1', '--viz-cat-2', '--viz-cat-3', '--viz-cat-4', '--viz-cat-5'])('%s sobre --bg ≥ 3', (c) => {
    expect(tokenContrast(c, '--bg', tokens)).toBeGreaterThanOrEqual(3)
  })

  it(`branco sobre accent ${tema === 'escuro' ? 'reprovaria' : 'passa'}`, () => {
    const t = { ...tokens, '--branco': '#ffffff' }
    if (tema === 'escuro') expect(tokenContrast('--branco', '--accent', t)).toBeLessThan(4.5)
    else expect(tokenContrast('--branco', '--accent', t)).toBeGreaterThanOrEqual(4.5)
  })
})
