// Busca aproximada da paleta de comandos (H04.6). Pura: sem DOM, sem store.

/** Minúsculas e sem acento: "Agênda" e "agenda" casam. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

const isBoundary = (text: string, i: number): boolean => i === 0 || /[\s\-_/.:@(]/.test(text[i - 1])

/**
 * Pontua `query` contra `text` como subsequência. null = não casa.
 * Bônus para letras consecutivas, início de palavra e começo do texto; penaliza buracos.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normalize(query).replace(/\s+/g, '')
  const t = normalize(text)
  if (!q) return 0
  let score = 0
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return null
    score += 1
    if (found === prev + 1) score += 4
    if (isBoundary(t, found)) score += 3
    if (found === 0) score += 2
    score -= Math.min(3, found - ti) * 0.25
    prev = found
    ti = found + 1
  }
  // Texto mais curto ganha no empate (casamento mais "denso").
  return score - t.length * 0.01
}

export interface Ranked<T> {
  item: T
  score: number
}

/**
 * Filtra e ordena. Empates mantêm a ordem original (estável), então a lista vazia mostra a ordem
 * definida pelo app. Pesquisa em `keywords` também (sinônimos), com peso menor.
 */
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string, keywords?: (item: T) => string, limit = 50): T[] {
  const ranked: (Ranked<T> & { i: number })[] = []
  items.forEach((item, i) => {
    const main = fuzzyScore(query, text(item))
    const extra = keywords ? fuzzyScore(query, keywords(item)) : null
    const best = main ?? (extra === null ? null : extra - 2)
    if (best !== null) ranked.push({ item, score: best, i })
  })
  ranked.sort((a, b) => b.score - a.score || a.i - b.i)
  return ranked.slice(0, limit).map((r) => r.item)
}
