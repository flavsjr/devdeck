// Regras de origem: quem pode falar com o main, para onde a janela pode navegar e quais
// permissões do Chromium cada origem recebe. Puro: testável sem Electron.

export const SPOTIFY_ORIGIN = 'https://open.spotify.com'

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** URL da própria UI do DevDeck (dev server do Vite ou index.html empacotado). */
export function isAppUrl(url: string, devRendererUrl?: string): boolean {
  const u = parse(url)
  if (!u) return false
  if (devRendererUrl) {
    const dev = parse(devRendererUrl)
    return Boolean(dev) && u.origin === dev!.origin
  }
  if (u.protocol !== 'file:') return false
  const path = decodeURIComponent(u.pathname).replace(/\\/g, '/')
  return path.endsWith('/out/renderer/index.html')
}

/** Subframes permitidos: só o player embutido do Spotify. */
export function isAllowedSubframeUrl(url: string): boolean {
  const u = parse(url)
  return Boolean(u) && u!.origin === SPOTIFY_ORIGIN
}

const APP_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write'])
const SPOTIFY_PERMISSIONS = new Set(['mediaKeySystem'])

/** Permissões do Chromium: nega por padrão. */
export function isPermissionAllowed(permission: string, requestingUrl: string, devRendererUrl?: string): boolean {
  if (isAppUrl(requestingUrl, devRendererUrl)) return APP_PERMISSIONS.has(permission)
  if (isAllowedSubframeUrl(requestingUrl)) return SPOTIFY_PERMISSIONS.has(permission)
  return false
}
