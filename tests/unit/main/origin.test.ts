import { describe, expect, it } from 'vitest'
import { isAllowedSubframeUrl, isAppUrl, isPermissionAllowed } from '../../../src/main/lib/origin'

const DEV = 'http://localhost:5173'
const PROD = 'file:///C:/Users/dev/AppData/Local/Programs/DevDeck/resources/app.asar/out/renderer/index.html'

describe('isAppUrl', () => {
  it('dev: só a origem do Vite', () => {
    expect(isAppUrl('http://localhost:5173/#profile', DEV)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', DEV)).toBe(false)
    expect(isAppUrl('https://evil.example/', DEV)).toBe(false)
  })
  it('produção: só o index.html empacotado', () => {
    expect(isAppUrl(PROD)).toBe(true)
    expect(isAppUrl(`${PROD}#agenda`)).toBe(true)
    expect(isAppUrl('file:///C:/Users/dev/Downloads/evil.html')).toBe(false)
    expect(isAppUrl('https://open.spotify.com/embed/playlist/x')).toBe(false)
    expect(isAppUrl('não é url')).toBe(false)
  })
})

describe('isAllowedSubframeUrl', () => {
  it('só o embed do Spotify', () => {
    expect(isAllowedSubframeUrl('https://open.spotify.com/embed/playlist/abc')).toBe(true)
    expect(isAllowedSubframeUrl('https://open.spotify.com.evil.example/')).toBe(false)
    expect(isAllowedSubframeUrl('http://open.spotify.com/')).toBe(false)
  })
})

describe('isPermissionAllowed', () => {
  it('app: notificações e cópia; nada de câmera/microfone', () => {
    expect(isPermissionAllowed('notifications', PROD)).toBe(true)
    expect(isPermissionAllowed('clipboard-sanitized-write', `${DEV}/`, DEV)).toBe(true)
    expect(isPermissionAllowed('media', PROD)).toBe(false)
    expect(isPermissionAllowed('geolocation', PROD)).toBe(false)
  })
  it('Spotify: só DRM de áudio', () => {
    expect(isPermissionAllowed('mediaKeySystem', 'https://open.spotify.com/embed/x')).toBe(true)
    expect(isPermissionAllowed('notifications', 'https://open.spotify.com/embed/x')).toBe(false)
  })
  it('qualquer outra origem: nega', () => {
    expect(isPermissionAllowed('notifications', 'https://evil.example/')).toBe(false)
  })
})
