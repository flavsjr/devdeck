import { describe, expect, it } from 'vitest'
import { APP_INDEX, isAllowedSubframeUrl, isAppUrl, isPermissionAllowed, resolveAppAsset, type AppLocation } from '../../../src/main/lib/origin'

const DEV: AppLocation = { devUrl: 'http://localhost:5173' }
const APP_FILE = 'file:///C:/Users/dev/AppData/Local/Programs/DevDeck/resources/app.asar/out/renderer/index.html'
const PROD: AppLocation = { fileUrl: APP_FILE }

describe('isAppUrl', () => {
  it('dev: só a origem do Vite', () => {
    expect(isAppUrl('http://localhost:5173/#profile', DEV)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', DEV)).toBe(false)
    expect(isAppUrl('https://evil.example/', DEV)).toBe(false)
  })

  it('produção: só o index.html exato do build', () => {
    expect(isAppUrl(APP_FILE, PROD)).toBe(true)
    expect(isAppUrl(`${APP_FILE}#agenda`, PROD)).toBe(true)
    expect(isAppUrl(APP_FILE.replace('C:/Users', 'c:/users'), PROD)).toBe(true) // Windows ignora maiúsculas
  })

  it('produção: recusa outro index.html com o mesmo sufixo (repo clonado, Downloads)', () => {
    expect(isAppUrl('file:///C:/Users/dev/source/repos/evil/out/renderer/index.html', PROD)).toBe(false)
    expect(isAppUrl('file:///C:/Users/dev/Downloads/out/renderer/index.html', PROD)).toBe(false)
    expect(isAppUrl('file:///C:/Users/dev/Downloads/evil.html', PROD)).toBe(false)
  })

  it('produção: percent-encoding inválido é recusado sem lançar erro', () => {
    expect(() => isAppUrl('file:///C:/repo/evil%ZZ.html', PROD)).not.toThrow()
    expect(isAppUrl('file:///C:/repo/evil%ZZ.html', PROD)).toBe(false)
  })

  it('produção: recusa host UNC/WebDAV e query', () => {
    expect(isAppUrl('file://servidor/share/DevDeck/resources/app.asar/out/renderer/index.html', PROD)).toBe(false)
    expect(isAppUrl(`${APP_FILE}?x=1`, PROD)).toBe(false)
  })

  it('sem localização conhecida ou URL inválida → falso', () => {
    expect(isAppUrl(APP_FILE, {})).toBe(false)
    expect(isAppUrl('não é url', PROD)).toBe(false)
    expect(isAppUrl('https://open.spotify.com/embed/playlist/x', PROD)).toBe(false)
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
    expect(isPermissionAllowed('notifications', APP_FILE, PROD)).toBe(true)
    expect(isPermissionAllowed('clipboard-sanitized-write', 'http://localhost:5173/', DEV)).toBe(true)
    expect(isPermissionAllowed('media', APP_FILE, PROD)).toBe(false)
    expect(isPermissionAllowed('geolocation', APP_FILE, PROD)).toBe(false)
  })
  it('origem "file://" sozinha não basta (precisa da URL completa do app)', () => {
    expect(isPermissionAllowed('notifications', 'file://', PROD)).toBe(false)
  })
  it('Spotify: só DRM de áudio', () => {
    expect(isPermissionAllowed('mediaKeySystem', 'https://open.spotify.com/embed/x', PROD)).toBe(true)
    expect(isPermissionAllowed('notifications', 'https://open.spotify.com/embed/x', PROD)).toBe(false)
  })
  it('qualquer outra origem: nega', () => {
    expect(isPermissionAllowed('notifications', 'https://evil.example/', PROD)).toBe(false)
  })
})

describe('esquema app:// (H05.2)', () => {
  const APP: AppLocation = { appScheme: true }
  it('só o index.html do host do app conta como UI', () => {
    expect(isAppUrl(APP_INDEX, APP)).toBe(true)
    expect(isAppUrl(`${APP_INDEX}#agenda`, APP)).toBe(true)
    expect(isAppUrl('app://devdeck/assets/x.js', APP)).toBe(false)
    expect(isAppUrl('app://outro/index.html', APP)).toBe(false)
    expect(isAppUrl('app://devdeck/index.html?x=1', APP)).toBe(false)
    expect(isAppUrl('app://user@devdeck/index.html', APP)).toBe(false)
    expect(isAppUrl('file:///C:/x/index.html', APP)).toBe(false)
    expect(isPermissionAllowed('notifications', APP_INDEX, APP)).toBe(true)
  })
  it('resolveAppAsset: assets do build com tipo certo', () => {
    expect(resolveAppAsset('app://devdeck/')).toEqual({ rel: 'index.html', mime: 'text/html; charset=utf-8' })
    expect(resolveAppAsset('app://devdeck/assets/index-AB12.js')?.mime).toBe('text/javascript; charset=utf-8')
    expect(resolveAppAsset('app://devdeck/assets/inter-latin.woff2')?.rel).toBe('assets/inter-latin.woff2')
  })
  it('resolveAppAsset: recusa fuga, host errado, query, tipo desconhecido', () => {
    // `..` literal é colapsado pela própria URL na raiz: continua dentro da pasta do renderer.
    expect(resolveAppAsset('app://devdeck/../main/index.js')?.rel).toBe('main/index.js')
    expect(resolveAppAsset('app://devdeck/assets/%2e%2e/%2e%2e/main/index.js')?.rel).toBe('main/index.js')
    for (const u of [
      'app://devdeck/assets/..%2F..%2Fmain%2Findex.js',
      'app://devdeck/assets/..%5C..%5Cmain%5Cindex.js',
      'app://devdeck/C:/Windows/win.ini',
      'app://devdeck//etc/passwd',
      'app://devdeck/assets/x.js?v=1',
      'app://outro/index.html',
      'app://devdeck/%ZZ.js',
      'app://devdeck/assets/a%00.js',
      'app://devdeck/main/index.exe',
      'file:///C:/x/index.html'
    ])
      expect(resolveAppAsset(u), u).toBeNull()
  })
})
