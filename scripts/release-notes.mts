// Notas do rascunho de release a partir do CHANGELOG (TR1 da Sprint 07, ADR-019).
// Uso no CI: node scripts/release-notes.mts "$TAG" out/NOTES.md
// Escreve as notas num arquivo (o `gh` lê com --notes-file: nada do CHANGELOG passa pelo shell) e, no
// Actions, grava `prerelease=true|false` em $GITHUB_OUTPUT. Sem a seção da versão no CHANGELOG, falha.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

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

export function releaseNotes(section: string): string {
  return `${section}\n\n---\n\n${VERIFY_TEXT}\n`
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
  writeFileSync(out, releaseNotes(section))
  const pre = isPrerelease(tag)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `prerelease=${pre}\n`)
  console.log(`release-notes: ${tag} → ${out} (${section.length} caracteres, prerelease=${pre})`)
}
