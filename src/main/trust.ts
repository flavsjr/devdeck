import { BrowserWindow, dialog } from 'electron'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { SettingSource } from '@anthropic-ai/claude-agent-sdk'
import { classifyEditPath, type EditVerdict } from './lib/paths'
import { describeSummary, summarizeProjectConfig } from './lib/trust'
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
export async function projectSettingSources(cwd: string, enabled: boolean): Promise<SettingSource[]> {
  if (!enabled) return []
  const summary = summarizeProjectConfig(readIfExists(join(cwd, '.claude', 'settings.json')), readIfExists(join(cwd, '.mcp.json')))
  if (!summary.risky) return ['project']

  const root = resolveReal(cwd)
  if (getTrustedHash(root) === summary.hash) return ['project']

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
  trustWorkspace(root, summary.hash)
  return ['project']
}
