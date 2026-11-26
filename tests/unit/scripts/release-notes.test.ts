import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { changelogSection, isPrerelease, releaseNotes, VERIFY_TEXT } from '../../../scripts/release-notes.mjs'

const CL = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '## [0.6.10] — 2026-12-01',
  '- dez',
  '',
  '## [0.6.1] — 2026-11-25 · hotfix',
  '',
  '### Segurança',
  '- um `$(rm -rf /)` que não pode virar comando',
  '',
  '## [0.6.0] — 2026-11-25',
  '- zero',
  ''
].join('\r\n')

describe('release-notes (TR1)', () => {
  it('pre-release: 0.x ou sufixo; 1.0.0 sem sufixo é estável', () => {
    expect(isPrerelease('v0.6.1')).toBe(true)
    expect(isPrerelease('v1.0.0-rc.1')).toBe(true)
    expect(isPrerelease('v2.3.4-beta')).toBe(true)
    expect(isPrerelease('v1.0.0')).toBe(false)
    expect(isPrerelease('v10.0.0')).toBe(false)
  })

  it('seção exata da versão, sem título, até a próxima versão (CRLF aceito)', () => {
    expect(changelogSection(CL, '0.6.1')).toBe('### Segurança\n- um `$(rm -rf /)` que não pode virar comando')
    expect(changelogSection(CL, '0.6.10')).toBe('- dez')
    expect(changelogSection(CL, '0.6.0')).toBe('- zero')
  })

  it('`## [` dentro de bloco de código não corta a seção', () => {
    const cl = ['## [0.7.0]', '- antes', '```md', '## [0.0.1] exemplo', '```', '- depois', '## [0.6.0]', '- x'].join('\n')
    expect(changelogSection(cl, '0.7.0')).toBe('- antes\n```md\n## [0.0.1] exemplo\n```\n- depois')
  })

  it('última seção não leva os links de referência do rodapé', () => {
    const cl = ['## [0.6.0] — x', '- zero', '', '[0.6.0]: https://github.com/o/r/releases/tag/v0.6.0'].join('\n')
    expect(changelogSection(cl, '0.6.0')).toBe('- zero')
  })

  it('sem a seção ou seção vazia → null (o job falha)', () => {
    expect(changelogSection(CL, '0.7.0')).toBeNull()
    expect(changelogSection(CL, '0.6')).toBeNull()
    expect(changelogSection('## [0.7.0]\n\n## [0.6.0]\n- x', '0.7.0')).toBeNull()
  })

  it('notas = seção + texto de verificação', () => {
    const n = releaseNotes('- item')
    expect(n.startsWith('- item\n\n---\n\n')).toBe(true)
    expect(n).toContain(VERIFY_TEXT)
  })

  it('CHANGELOG real tem a seção da versão publicada mais recente', () => {
    const real = readFileSync(resolve(__dirname, '../../../CHANGELOG.md'), 'utf8')
    expect(changelogSection(real, '0.6.1')).not.toBeNull()
  })
})
