// Confere se a tag do release bate com a versão do package.json (H05.3).
// Uso no CI: node scripts/check-tag.mts "$GITHUB_REF_NAME"  (Node 24 roda TypeScript sem build)
import { readFileSync } from 'node:fs'

const TAG = /^v(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

/** null = ok; senão, o motivo da recusa. */
export function checkTag(tag: string, version: string): string | null {
  if (!TAG.test(tag)) return `Tag "${tag}" fora do formato vX.Y.Z[-pre].`
  if (tag !== `v${version}`) return `Tag "${tag}" não bate com a versão do package.json (${version}): esperado "v${version}".`
  return null
}

if (import.meta.main) {
  const tag = process.argv[2] ?? ''
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
  const err = checkTag(tag, version)
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`check-tag: ${tag} = package.json ${version}`)
}
