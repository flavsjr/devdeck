// Confere o SHA-256 dos arquivos do Claude Agent SDK contra scripts/sdk-hashes.json (H05.2).
// - afterPack do electron-builder: confere o que foi empacotado (app.asar.unpacked e o asar).
// - CLI (`node scripts/verify-sdk.cjs [pasta-do-app]`): sem argumento, confere node_modules.
// Divergência → exceção / código de saída ≠ 0: o build não segue com um SDK diferente do revisado.
const { createHash } = require('node:crypto')
const { createReadStream, existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const expected = JSON.parse(readFileSync(join(__dirname, 'sdk-hashes.json'), 'utf8'))

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('error', reject)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
  })
}

/** Lê um arquivo de dentro do asar (pickle: tamanho do cabeçalho, JSON do cabeçalho, dados). */
function readFromAsar(asarPath, rel) {
  if (!existsSync(asarPath)) return null
  const buf = readFileSync(asarPath)
  const headerPickleSize = buf.readUInt32LE(4)
  const jsonSize = buf.readUInt32LE(12)
  const header = JSON.parse(buf.subarray(16, 16 + jsonSize).toString('utf8'))
  let node = header
  for (const part of rel.split('/')) node = node && node.files ? node.files[part] : undefined
  if (!node || node.offset === undefined) return null
  const start = 8 + headerPickleSize + Number(node.offset)
  return buf.subarray(start, start + node.size)
}

/** Confere os arquivos. `resourcesDir` = pasta resources do app empacotado (ou null para node_modules). */
async function verify(resourcesDir) {
  const problems = []
  for (const [rel, hash] of Object.entries(expected.files)) {
    let actual = null
    if (!resourcesDir) {
      if (existsSync(rel)) actual = await sha256File(rel)
    } else {
      const unpacked = join(resourcesDir, 'app.asar.unpacked', rel)
      if (existsSync(unpacked)) actual = await sha256File(unpacked)
      else {
        const data = readFromAsar(join(resourcesDir, 'app.asar'), rel)
        if (data) actual = createHash('sha256').update(data).digest('hex')
      }
    }
    if (actual === null) problems.push(`${rel}: ausente`)
    else if (actual !== hash) problems.push(`${rel}: sha256 ${actual} difere do esperado ${hash}`)
  }
  if (problems.length) throw new Error(`SDK ${expected.version} diverge do revisado:\n  ${problems.join('\n  ')}`)
  return Object.keys(expected.files).length
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') throw new Error('Empacotamento só para Windows (o SDK traz binário nativo da plataforma).')
  const n = await verify(join(context.appOutDir, 'resources'))
  console.log(`  • verify-sdk: ${n} arquivo(s) conferido(s)`)
}
module.exports.verify = verify

if (require.main === module) {
  verify(process.argv[2] ? join(process.argv[2], 'resources') : null)
    .then((n) => console.log(`verify-sdk: ${n} arquivo(s) conferido(s)`))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
