import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVISO_AMOSTRA_PUBLICA, changelogSection, isPrerelease, releaseNotes, VERIFY_TEXT, vtSection } from '../../../scripts/release-notes.mjs'

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

describe('seção do VirusTotal (H07.5)', () => {
  const SHA = 'c'.repeat(64)
  const LINK = `https://www.virustotal.com/gui/file/${SHA}`
  const ok = { status: 'ok', sha256: SHA, stats: { malicious: 1, suspicious: 2, undetected: 60, harmless: 3 } }

  it('ok: detecções sobre o total, link pelo sha do próprio job e aviso de amostra pública', () => {
    const t = vtSection(ok, SHA)
    expect(t).toContain('**3 de 66** antivírus')
    expect(t).toContain('(1 malicioso(s), 2 suspeito(s))')
    expect(t).toContain(LINK)
    expect(t).toContain(AVISO_AMOSTRA_PUBLICA)
  })

  it('pendente: motivo de lista fechada, link para conferir e aviso', () => {
    for (const [motivo, texto] of [
      ['sem-chave', 'sem chave da API no CI'],
      ['api', 'não respondeu'],
      ['cota', 'limite de uso'],
      ['tempo', 'não terminou em 10 minutos']
    ]) {
      const t = vtSection({ status: 'pendente', sha256: SHA, motivo }, SHA)
      expect(t).toContain('**Scan pendente**')
      expect(t).toContain(texto)
      expect(t).toContain(LINK)
      expect(t).toContain(AVISO_AMOSTRA_PUBLICA)
    }
  })

  it('dado do scan não confiável: sha que não bate, formato estranho, contagens ruins → pendente "inválido"', () => {
    const invalidos: unknown[] = [
      null,
      'x',
      { ...ok, sha256: 'd'.repeat(64) },
      { ...ok, status: 'talvez' },
      { ...ok, stats: { ...ok.stats, malicious: '1' } },
      { ...ok, stats: { ...ok.stats, harmless: 2.5 } },
      { ...ok, stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } },
      { status: 'pendente', sha256: SHA, motivo: '<script>' },
      { status: 'pendente', sha256: SHA, motivo: 'constructor' }
    ]
    for (const raw of invalidos) {
      const t = vtSection(raw, SHA)
      expect(t, JSON.stringify(raw)).toContain('resultado do scan ausente ou inválido')
      expect(t).not.toContain('<script>')
    }
  })

  it('nenhum texto vindo do VT entra nas notas', () => {
    const t = vtSection({ ...ok, extra: '@todos [clique](https://evil.example)', stats: { ...ok.stats, nome: 'ataque' } }, SHA)
    expect(t).not.toContain('evil')
    expect(t).not.toContain('@todos')
    expect(t).not.toContain('ataque')
  })

  it('sha do próprio job inválido é erro (bug do workflow, não dado do VT)', () => {
    expect(() => vtSection(ok, 'abc')).toThrow()
  })

  it('notas com VT: seção do CHANGELOG, VirusTotal e o texto de verificação, nessa ordem', () => {
    const n = releaseNotes('- item', vtSection(ok, SHA))
    expect(n.indexOf('- item')).toBeLessThan(n.indexOf('### VirusTotal'))
    expect(n.indexOf('### VirusTotal')).toBeLessThan(n.indexOf(VERIFY_TEXT))
  })
})
