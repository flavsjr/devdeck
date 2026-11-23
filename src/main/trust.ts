import { BrowserWindow, dialog } from 'electron'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import type { SettingSource } from '@anthropic-ai/claude-agent-sdk'
import { classifyEditPath, type EditVerdict } from './lib/paths'
import { CLAUDE_DIR_LIMITS, describeSummary, summarizeProjectConfig, type ClaudeDirEntry, type ClaudeDirScan } from './lib/trust'
import { getTrustedHash, trustWorkspace } from './store'

// Confiança em workspaces de terceiros (B1) e confinamento de edições (B2).

/** realpath que funciona para arquivos ainda inexistentes (resolve o ancestral existente mais próximo). */
export function resolveReal(p: string): string {
  const tail: string[] = []
  let cur = p
  for (let i = 0; i < 256; i++) {
    try {
      return join(realpathSync.native(cur), ...tail.reverse())
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return p
      tail.push(basename(cur))
      cur = parent
    }
  }
  return p
}

export function classifyEditTarget(cwd: string, filePath: string): EditVerdict {
  if (!filePath) return 'outside'
  return classifyEditPath(resolveReal(cwd), resolveReal(filePath))
}

function readIfExists(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * Fontes de configuração do projeto para o SDK. Hooks, permissões, env, helpers e MCPs do repositório
 * executam código sem passar pela aprovação do DevDeck: só carregam depois de o usuário confiar
 * no workspace, e a confiança cai se esses arquivos mudarem.
 */
/**
 * Varre .claude/ sem seguir links (lstat): arquivo entra pelo sha256 do conteúdo, link pelo alvo.
 * Passou dos limites → overflow (o diálogo aparece sempre; falha fechada).
 */
export function scanClaudeDir(cwd: string): ClaudeDirScan {
  const base = join(cwd, '.claude')
  const entries: ClaudeDirEntry[] = []
  let bytes = 0
  let overflow = false
  const walk = (dir: string, rel: string, depth: number): void => {
    if (overflow) return
    if (depth > CLAUDE_DIR_LIMITS.depth) {
      overflow = true
      return
    }
    let names: string[]
    try {
      names = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const name of names) {
      if (entries.length >= CLAUDE_DIR_LIMITS.files) {
        overflow = true
        return
      }
      const abs = join(dir, name)
      const path = rel ? `${rel}/${name}` : name
      let st
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) {
        let target = '?'
        try {
          target = readlinkSync(abs)
        } catch {
          // alvo ilegível: entra como '?'
        }
        entries.push({ path, kind: 'link', digest: target })
      } else if (st.isDirectory()) {
        walk(abs, path, depth + 1)
      } else if (st.isFile()) {
        bytes += st.size
        if (bytes > CLAUDE_DIR_LIMITS.bytes) {
          overflow = true
          return
        }
        let digest = '?'
        try {
          digest = createHash('sha256').update(readFileSync(abs)).digest('hex')
        } catch {
          // ilegível: o hash muda quando voltar a ser legível
        }
        entries.push({ path, kind: 'file', digest })
      } else {
        entries.push({ path, kind: 'other', digest: String(st.mode) })
      }
    }
  }
  if (existsSync(base)) walk(base, '', 0)
  return { entries, overflow }
}

export async function projectSettingSources(cwd: string, enabled: boolean): Promise<SettingSource[]> {
  if (!enabled) return []
  const summary = summarizeProjectConfig(readIfExists(join(cwd, '.claude', 'settings.json')), readIfExists(join(cwd, '.mcp.json')), scanClaudeDir(cwd))
  if (!summary.risky) return ['project']

  const root = resolveReal(cwd)
  if (!summary.overflow && getTrustedHash(root) === summary.hash) return ['project']

  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const opts = {
    type: 'warning' as const,
    title: 'Confiar neste workspace?',
    message: `"${basename(root)}" quer carregar configurações que executam comandos sem passar pela aprovação do DevDeck.`,
    detail: `${describeSummary(summary)}\nSó confie em repositórios que você conhece. Se esses arquivos mudarem, o DevDeck pergunta de novo.`,
    buttons: ['Não carregar', 'Confiar e carregar'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts)
  if (response !== 1) return []
  // Com overflow a confiança vale só desta vez: não dá para saber se o conteúdo muda depois.
  if (!summary.overflow) trustWorkspace(root, summary.hash)
  return ['project']
}
