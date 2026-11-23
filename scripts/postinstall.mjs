// Baixa o binário do Electron após o npm install (nem toda máquina roda o postinstall do pacote).
// ELECTRON_SKIP_BINARY_DOWNLOAD=1 pula o download: o CI de checagem não precisa do Electron.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === '1') {
  console.log('[postinstall] ELECTRON_SKIP_BINARY_DOWNLOAD=1 — download do Electron pulado.')
  process.exit(0)
}

const script = 'node_modules/electron/install.js'
if (!existsSync(script)) process.exit(0)
const r = spawnSync(process.execPath, [script], { stdio: 'inherit' })
process.exit(r.status ?? 1)
