// Notas do rascunho de release a partir do CHANGELOG (TR1 da Sprint 07, ADR-019).
// Uso no CI: node scripts/release-notes.mts "$TAG" out/NOTES.md
// Escreve as notas num arquivo (o `gh` lê com --notes-file: nada do CHANGELOG passa pelo shell) e, no
// Actions, grava `prerelease=true|false` em $GITHUB_OUTPUT. Sem a seção da versão no CHANGELOG, falha.
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'

/** 0.x ou com sufixo (`-rc.1`, `-beta`) é pre-release; só X.Y.Z ≥ 1 sem sufixo é estável. */
export function isPrerelease(tag: string): boolean {
  return /^v0\./.test(tag) || tag.includes('-')
}

/**
 * Corpo da seção `## [X.Y.Z]` (sem o título), até a próxima `## [`. null quando a seção não existe ou está vazia.
 * Compara a versão exata: `[0.6.1]` não casa com `[0.6.10]`.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n')
  const head = `## [${version}]`
  const start = lines.findIndex((l) => l === head || l.startsWith(`${head} `))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  // Termina no próximo título de nível 2 ou nos links de referência do rodapé (`[0.6.0]: https://…`).
  // Dentro de bloco de código nada encerra a seção (security review da TR1).
  let fence = false
  const end = rest.findIndex((l) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence
    return !fence && (/^## /.test(l) || /^\[[^\]]+\]: /.test(l))
  })
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return body === '' ? null : body
}

export const VERIFY_TEXT =
  'Rascunho gerado pelo CI. Antes de publicar: conferir SHA256SUMS.txt, a attestation (`gh attestation verify`), o VirusTotal e os links e @menções destas notas.'

/** Motivos do "scan pendente" que o job do VirusTotal grava (H07.5). Texto fixo: nada do VT vai para as notas. */
export const MOTIVO_PENDENTE: Readonly<Record<string, string>> = {
  'sem-chave': 'sem chave da API no CI',
  api: 'a API do VirusTotal não respondeu',
  cota: 'limite de uso da API do VirusTotal atingido',
  tempo: 'a análise não terminou em 10 minutos',
  invalido: 'resultado do scan ausente ou inválido'
}

export const AVISO_AMOSTRA_PUBLICA = 'O instalador enviado ao VirusTotal fica público lá (o projeto é aberto).'

const SHA256_RE = /^[0-9a-f]{64}$/
const contagem = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000

/**
 * Seção "VirusTotal" das notas (H07.5, D5). `raw` é o vt.json do job de scan: dado não confiável.
 * Só números validados e o sha256 calculado no próprio job de release entram no texto; sha que não
 * bate, contagens que não são inteiras, total zero ou formato estranho viram "scan pendente".
 */
export function vtSection(raw: unknown, shaEsperado: string): string {
  if (!SHA256_RE.test(shaEsperado)) throw new Error('sha256 do instalador inválido')
  const link = `https://www.virustotal.com/gui/file/${shaEsperado}`
  const pendente = (motivo: string): string =>
    `### VirusTotal\n**Scan pendente** (${MOTIVO_PENDENTE[motivo] ?? MOTIVO_PENDENTE.invalido}). Confira antes de publicar: ${link}\n\n${AVISO_AMOSTRA_PUBLICA}`
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  if (!r || r.sha256 !== shaEsperado) return pendente('invalido')
  if (r.status === 'pendente') return pendente(typeof r.motivo === 'string' && Object.hasOwn(MOTIVO_PENDENTE, r.motivo) ? r.motivo : 'invalido')
  const s = r.status === 'ok' && typeof r.stats === 'object' && r.stats !== null ? (r.stats as Record<string, unknown>) : null
  if (!s) return pendente('invalido')
  const { malicious: m, suspicious: su, undetected: u, harmless: h } = s
  if (!contagem(m) || !contagem(su) || !contagem(u) || !contagem(h) || m + su + u + h === 0) return pendente('invalido')
  const total = m + su + u + h
  return `### VirusTotal\n**${m + su} de ${total}** antivírus marcaram o instalador como malicioso ou suspeito (${m} malicioso(s), ${su} suspeito(s)). Relatório: ${link}\n\n${AVISO_AMOSTRA_PUBLICA}`
}

export function releaseNotes(section: string, vt?: string): string {
  return `${section}\n\n${vt ? `${vt}\n\n` : ''}---\n\n${VERIFY_TEXT}\n`
}

// Node sem import.meta.main (anterior ao 24) cai no nome do arquivo: nunca vira no-op silencioso.
const isMain = import.meta.main ?? (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/release-notes.mts')
if (isMain) {
  const tag = process.argv[2] ?? ''
  const out = process.argv[3] ?? ''
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag) || !out) {
    console.error('Uso: node scripts/release-notes.mts vX.Y.Z[-pre] <arquivo-de-saída>')
    process.exit(1)
  }
  const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), tag.slice(1))
  if (!section) {
    console.error(`CHANGELOG.md sem a seção "## [${tag.slice(1)}]" (ou ela está vazia): o rascunho não é criado.`)
    process.exit(1)
  }
  // Com o sha256 do instalador (4º argumento), entra a seção do VirusTotal lida do vt.json (3º); arquivo ausente
  // ou ilegível vira "scan pendente" e o release segue.
  const vtPath = process.argv[4] ?? ''
  const sha = process.argv[5]
  let vt: string | undefined
  if (sha !== undefined) {
    let raw: unknown = null
    try {
      // Teto de tamanho antes de ler (Sec): o vt.json legítimo tem ~200 bytes.
      if (statSync(vtPath).size <= 64 * 1024) raw = JSON.parse(readFileSync(vtPath, 'utf8'))
    } catch {
      raw = null
    }
    vt = vtSection(raw, sha)
  }
  writeFileSync(out, releaseNotes(section, vt))
  const pre = isPrerelease(tag)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `prerelease=${pre}\n`)
  console.log(`release-notes: ${tag} → ${out} (${section.length} caracteres, prerelease=${pre})`)
}
