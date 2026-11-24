// Regras de origem: quem pode falar com o main, para onde a janela pode navegar e quais
// permissões do Chromium cada origem recebe. Puro: testável sem Electron.

export const SPOTIFY_ORIGIN = 'https://open.spotify.com'

/** Esquema próprio da UI empacotada (H05.2): file:// perde acesso ao asar com a fuse GrantFileProtocolExtraPrivileges desligada. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'devdeck'
export const APP_INDEX = `${APP_SCHEME}://${APP_HOST}/index.html`

/** Onde a UI do app está: dev server do Vite (só fora do app empacotado), o esquema app:// ou o index.html do build. */
export interface AppLocation {
  devUrl?: string
  /** UI servida por app://devdeck (app empacotado). */
  appScheme?: boolean
  /** URL file:// exata do index.html do app (pathToFileURL). */
  fileUrl?: string
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Caminho normalizado; null se o percent-encoding for inválido (ex.: %ZZ) — quem chama recusa. */
function normalizeFilePath(u: URL): string | null {
  let p: string
  try {
    p = decodeURIComponent(u.pathname).replace(/\\/g, '/')
  } catch {
    return null
  }
  // Windows: unidade e caminho sem diferenciar maiúsculas.
  return /^\/[A-Za-z]:\//.test(p) ? p.toLowerCase() : p
}

/** URL da própria UI do DevDeck. Em produção, só o index.html exato do build (sem host UNC e sem query). */
export function isAppUrl(url: string, loc: AppLocation): boolean {
  const u = parse(url)
  if (!u) return false
  if (loc.devUrl) {
    const dev = parse(loc.devUrl)
    return Boolean(dev) && u.origin === dev!.origin
  }
  if (loc.appScheme) return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST && u.pathname === '/index.html' && u.search === '' && u.username === '' && u.port === ''
  if (!loc.fileUrl) return false
  const app = parse(loc.fileUrl)
  if (!app || u.protocol !== 'file:' || app.protocol !== 'file:') return false
  if (u.host !== '' || u.host !== app.host) return false // file://servidor/compartilhamento (UNC/WebDAV) recusado
  if (u.search !== '') return false
  const got = normalizeFilePath(u)
  return got !== null && got === normalizeFilePath(app)
}

/** Subframes permitidos: só o player embutido do Spotify. */
export function isAllowedSubframeUrl(url: string): boolean {
  const u = parse(url)
  return Boolean(u) && u!.origin === SPOTIFY_ORIGIN
}

const APP_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write'])
const SPOTIFY_PERMISSIONS = new Set(['mediaKeySystem'])

/** Permissões do Chromium: nega por padrão. */
export function isPermissionAllowed(permission: string, requestingUrl: string, loc: AppLocation): boolean {
  if (isAppUrl(requestingUrl, loc)) return APP_PERMISSIONS.has(permission)
  if (isAllowedSubframeUrl(requestingUrl)) return SPOTIFY_PERMISSIONS.has(permission)
  return false
}

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff'
}

/**
 * Pedido ao esquema app:// → caminho relativo dentro da pasta do renderer, ou null (recusa).
 * Só o host do app, sem query, sem `..`, sem barra invertida, sem percent-encoding inválido e só tipos conhecidos.
 */
export function resolveAppAsset(url: string): { rel: string; mime: string } | null {
  const u = parse(url)
  if (!u || u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST || u.search !== '' || u.username !== '' || u.port !== '') return null
  let path: string
  try {
    path = decodeURIComponent(u.pathname)
  } catch {
    return null
  }
  if (path === '/') path = '/index.html'
  if (path.includes('\\') || path.includes('\u0000') || !path.startsWith('/')) return null
  const parts = path.slice(1).split('/')
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.includes(':'))) return null
  const ext = parts[parts.length - 1].split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME[ext]
  return mime ? { rel: parts.join('/'), mime } : null
}
