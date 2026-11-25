import { describe, expect, it } from 'vitest'
import { parseSpotify, toCanonical, toEmbed } from '../../../src/renderer/src/lib/spotify'

describe('lib/spotify', () => {
  it('entende link, link com intl e URI', () => {
    expect(parseSpotify('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS?si=x')).toEqual({ type: 'playlist', id: '37i9dQZF1DX8Uebhn9wzrS' })
    expect(parseSpotify('https://open.spotify.com/intl-pt/album/1A2b3C')).toEqual({ type: 'album', id: '1A2b3C' })
    expect(parseSpotify(' spotify:track:abc123 ')).toEqual({ type: 'track', id: 'abc123' })
    expect(parseSpotify('https://evil.example/playlist/abc')).toBeNull()
  })

  it('embed segue o tema: theme=0 só no escuro (H06.1)', () => {
    expect(toEmbed('spotify:playlist:abc', true)).toBe('https://open.spotify.com/embed/playlist/abc?theme=0')
    expect(toEmbed('spotify:playlist:abc', false)).toBe('https://open.spotify.com/embed/playlist/abc')
    expect(toEmbed('não é link', true)).toBeNull()
  })

  it('forma canônica sem parâmetros', () => {
    expect(toCanonical('https://open.spotify.com/intl-pt/track/xyz?si=1')).toBe('https://open.spotify.com/track/xyz')
  })
})
