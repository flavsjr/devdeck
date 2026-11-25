// Contraste WCAG 2.x a partir do CSS de tokens (H04.2). Puro: recebe o texto do CSS, não lê arquivo.

export type Rgba = [number, number, number, number]

/** Lê as custom properties `--x: valor;` de um CSS (última definição vence). */
export function parseTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of noComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const LIGHT_MEDIA = /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{/

/**
 * Separa o bloco `@media (prefers-color-scheme: light) { … }` (chaves balanceadas) do resto do CSS (H06.1).
 * `light` é o CSS de dentro do bloco, ou null se não houver tema claro.
 */
export function splitLightBlock(css: string): { dark: string; light: string | null } {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const m = LIGHT_MEDIA.exec(src)
  if (!m) return { dark: src, light: null }
  const open = m.index + m[0].length
  let depth = 1
  let i = open
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
  }
  if (depth !== 0) throw new Error('Bloco @media (prefers-color-scheme: light) sem fechar')
  return { dark: src.slice(0, m.index) + src.slice(i), light: src.slice(open, i - 1) }
}

/**
 * Tokens de cada tema: o claro herda os primitivos do :root e redefine os semânticos, então resolve com os
 * dois juntos (claro por cima).
 */
export function themeTokens(css: string): { dark: Record<string, string>; light: Record<string, string> | null } {
  const { dark, light } = splitLightBlock(css)
  const darkTokens = parseTokens(dark)
  return { dark: darkTokens, light: light === null ? null : { ...darkTokens, ...parseTokens(light) } }
}

function parseHex(hex: string): Rgba | null {
  const h = hex.replace('#', '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const n = (i: number): number => parseInt(full.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1]
}

/**
 * Resolve um token para RGBA. Entende hex, `var(--x)` encadeado e
 * `color-mix(in srgb, var(--x) N%, transparent)` (a forma usada em tokens.css).
 */
export function resolveColor(name: string, tokens: Record<string, string>, depth = 0): Rgba {
  if (depth > 20) throw new Error(`Ciclo ao resolver ${name}`)
  const raw = tokens[name]
  if (raw === undefined) throw new Error(`Token ${name} não existe`)
  return resolveValue(raw, tokens, depth)
}

function resolveValue(raw: string, tokens: Record<string, string>, depth: number): Rgba {
  const v = raw.trim()
  if (v === 'transparent') return [0, 0, 0, 0]
  const hex = v.startsWith('#') ? parseHex(v) : null
  if (hex) return hex
  const ref = /^var\((--[\w-]+)\)$/.exec(v)
  if (ref) return resolveColor(ref[1], tokens, depth + 1)
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/.exec(v)
  if (mix) {
    const [r, g, b, a] = resolveValue(mix[1], tokens, depth + 1)
    return [r, g, b, a * (Number(mix[2]) / 100)]
  }
  throw new Error(`Valor de cor não suportado: ${v}`)
}

/** Compõe uma cor (possivelmente translúcida) sobre um fundo opaco. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3]
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]
}

export function luminance([r, g, b]: Rgba): number {
  const ch = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Contraste entre dois tokens; o fundo translúcido é composto sobre `base` (padrão: --bg). */
export function tokenContrast(fg: string, bg: string, tokens: Record<string, string>, base = '--bg'): number {
  const baseColor = resolveColor(base, tokens)
  const back = over(resolveColor(bg, tokens), baseColor)
  return contrastRatio(over(resolveColor(fg, tokens), back), back)
}
