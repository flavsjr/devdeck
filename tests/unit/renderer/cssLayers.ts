// Leitura mínima de CSS para o teste de camadas (H05.9): sem dependência, só o que o teste precisa.

/** Remove comentários e conteúdo de strings (que podem ter chaves ou pontos). */
export function stripCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
}

/** Blocos de topo: `@layer x { … }` e qualquer regra fora de camada. */
export function topLevelBlocks(css: string): string[] {
  const src = stripCss(css)
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        out.push(src.slice(start, i + 1).trim())
        start = i + 1
      }
    } else if (c === ';' && depth === 0) {
      out.push(src.slice(start, i + 1).trim())
      start = i + 1
    }
  }
  const rest = src.slice(start).trim()
  if (rest) out.push(rest)
  return out.filter(Boolean)
}

/** Nomes de classe usados em seletores (prelúdios antes de `{`), sem olhar valores de propriedades. */
export function selectorClasses(css: string): Set<string> {
  const src = stripCss(css)
  const names = new Set<string>()
  let prelude = ''
  for (const c of src) {
    if (c === '{') {
      for (const m of prelude.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1])
      prelude = ''
    } else if (c === '}' || c === ';') prelude = ''
    else prelude += c
  }
  return names
}
