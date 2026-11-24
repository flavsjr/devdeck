// Lê as fuses do executável gerado e falha se alguma não estiver como decidido (H05.2 / ADR-011).
// Uso: node scripts/verify-fuses.mjs [dist/win-unpacked/DevDeck.exe]
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'

const exe = process.argv[2] ?? 'dist/win-unpacked/DevDeck.exe'

const EXPECTED = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  GrantFileProtocolExtraPrivileges: false,
  EnableCookieEncryption: true,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true
}

const wire = await getCurrentFuseWire(exe)
const problems = []
for (const [name, want] of Object.entries(EXPECTED)) {
  const state = wire[FuseV1Options[name]]
  if (state === undefined) {
    problems.push(`${name}: ausente neste Electron`)
    continue
  }
  // Removida conta como desligada; qualquer outro estado (ex.: INHERIT) falha.
  const on = state === FuseState.ENABLE
  const off = state === FuseState.DISABLE || state === FuseState.REMOVED
  if (!on && !off) problems.push(`${name}: estado ${state} inesperado`)
  else if (on !== want) problems.push(`${name}: ${on ? 'ligada' : 'desligada'} (esperado ${want ? 'ligada' : 'desligada'})`)
}
if (problems.length) {
  console.error(`verify-fuses: ${exe}\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`verify-fuses: ${Object.keys(EXPECTED).length} fuses conferidas em ${exe}`)
