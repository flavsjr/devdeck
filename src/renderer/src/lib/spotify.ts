// Links do Spotify do Modo Flow (embed oficial, sem OAuth). Puro: o componente passa o tema efetivo.

/** Tipo e id do conteúdo a partir de link ou URI do Spotify. */
export function parseSpotify(url: string): { type: string; id: string } | null {
  const uri = /^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)/.exec(url.trim())
  if (uri) return { type: uri[1], id: uri[2] }
  const m = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/.exec(url)
  return m ? { type: m[1], id: m[2] } : null
}

/**
 * URL do embed. O Spotify não tem embed claro: `theme=0` é o player escuro; sem o parâmetro, ele usa a cor
 * da capa, que combina melhor com o tema claro (H06.1).
 */
export function toEmbed(url: string, escuro: boolean): string | null {
  const p = parseSpotify(url)
  if (!p) return null
  const base = `https://open.spotify.com/embed/${p.type}/${p.id}`
  return escuro ? `${base}?theme=0` : base
}

/** Forma canônica salva nas configurações (o main só aceita https://open.spotify.com/...). */
export function toCanonical(url: string): string | null {
  const p = parseSpotify(url)
  return p ? `https://open.spotify.com/${p.type}/${p.id}` : null
}
