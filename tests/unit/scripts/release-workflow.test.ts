// Guarda do release.yml (H07.5, D5): a chave do VirusTotal só existe no job `scan`, restrito ao environment
// `release`, sem npm e sem token de escrita. Texto, não YAML: sem dependência nova.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Sem as linhas de comentário (elas citam a chave e os jobs).
const yml = readFileSync(resolve(__dirname, '../../../.github/workflows/release.yml'), 'utf8')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n')

/** Bloco de um job: da linha `  nome:` até o próximo job de mesmo nível. */
function job(nome: string): string {
  const ini = yml.indexOf(`\n  ${nome}:\n`)
  if (ini < 0) throw new Error(`job ${nome} não existe`)
  const resto = yml.slice(ini + 1)
  const fim = resto.slice(1).search(/\n {2}[a-z][\w-]*:\n/)
  return fim < 0 ? resto : resto.slice(0, fim + 1)
}

describe('release.yml (H07.5)', () => {
  it('VT_API_KEY só aparece no job scan', () => {
    const usos = yml.split('secrets.VT_API_KEY').length - 1
    expect(usos).toBe(1)
    expect(job('scan')).toContain('secrets.VT_API_KEY')
    expect(job('build')).not.toContain('VT_API_KEY')
    expect(job('release')).not.toContain('VT_API_KEY')
  })

  it('scan: environment release, só contents: read, checkout esparso sem credencial, sem npm', () => {
    const s = job('scan')
    expect(s).toContain('environment: release')
    expect(s).toMatch(/permissions:\n\s+contents: read\n/)
    expect(s).not.toMatch(/: write/)
    expect(s).toContain('persist-credentials: false')
    expect(s).toMatch(/sparse-checkout: \|\n\s+\.nvmrc\n\s+scripts\/vt-scan\.mts\n/)
    expect(s).not.toMatch(/\bnpm\b|\bnpx\b|cache:/)
    expect(s).toContain("if: github.event_name == 'push'")
  })

  it('release segue sem o scan, mas nunca sem o build', () => {
    const r = job('release')
    expect(r).toContain('needs: [build, scan]')
    expect(r).toContain("needs.build.result == 'success'")
    expect(r).toContain('out/vt/vt.json "$sha"')
  })

  it('controle: o guarda acha os três jobs', () => {
    for (const j of ['build', 'scan', 'release']) expect(job(j).length).toBeGreaterThan(50)
  })
})
