import { app, BrowserWindow, dialog } from 'electron'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describeGitRisk, gitAllowedBy, summarizeGitConfig, type GitRiskSummary } from './lib/gitconfig'
import { pickGitBinary } from './lib/gitproc'
import { gitSignature, inspectRepo, readGitShape, type GitContext } from './gitcore'
import { getGitTrustedHash, trustGit } from './store'
import { resolveReal } from './realpath'

// Gate do git do workspace (H05.1 / B3): reavaliado antes de cada chamada. Sem confiança num
// repositório arriscado, nenhum git do DevDeck nem do agente roda.

const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

const binaries = new Map<string, string | null>()

/** git absoluto, resolvido uma vez por workspace (o PATH exclui pastas dentro dele). */
export function gitBinary(root: string): string {
  if (!binaries.has(root)) binaries.set(root, pickGitBinary(process.env.PATH, process.platform, root, isFile))
  const bin = binaries.get(root)
  if (!bin) throw new Error('Git não encontrado no PATH.')
  return bin
}

function appDir(name: string): string {
  const dir = join(app.getPath('userData'), name)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Pasta vazia usada como core.hooksPath em toda chamada. */
export const emptyHooksDir = (): string => appDir('empty-hooks')
/** GIT_DIR inexistente para o agente quando o git está pausado. */
export const noGitDir = (): string => join(app.getPath('userData'), 'no-git-here')

/** Config global vazia para a inspeção (o Git for Windows recusa o os.devNull em GIT_CONFIG_GLOBAL). */
function emptyGitConfig(): string {
  const file = join(appDir('git-inspect'), 'empty.gitconfig')
  if (!existsSync(file)) writeFileSync(file, '')
  return file
}

export function gitContext(root: string): GitContext {
  return { root, binary: gitBinary(root), hooksDir: emptyHooksDir() }
}

const cache = new Map<string, { sig: string; summary: GitRiskSummary }>()
/** Confiança que vale só nesta execução (estrutura que o DevDeck não confere). */
const sessionTrust = new Set<string>()
/** O usuário escolheu "Abrir sem git" nesta execução: não perguntar de novo a cada chat. */
const declined = new Set<string>()

const keyOf = (rootReal: string, hash: string): string => `${process.platform === 'win32' ? rootReal.toLowerCase() : rootReal}\n${hash}`

export interface GitGate {
  summary: GitRiskSummary
  allowed: boolean
  declined: boolean
}

export async function gitGate(root: string): Promise<GitGate> {
  // Sem .git na raiz: nada a decidir e nenhum processo (nem a busca do binário: quem não tem git não recebe aviso).
  // O teto (GIT_CEILING_DIRECTORIES) impede o git do agente de achar repositório acima: `.gitmodules` solto não importa.
  if (readGitShape(root).dotGit === 'missing') {
    return { summary: summarizeGitConfig({ shape: { dotGit: 'missing' }, configList: null, configText: null, attributesText: null }), allowed: true, declined: false }
  }
  const sig = gitSignature(root)
  let hit = cache.get(root)
  if (!hit || hit.sig !== sig) {
    const summary = await inspectRepo(root, gitBinary(root), appDir('git-inspect'), emptyGitConfig())
    hit = { sig, summary }
    // Inspeção que passou do tempo (H07.3) não fica no cache: a próxima consulta tenta de novo.
    if (summary.incomplete) cache.delete(root)
    else cache.set(root, hit)
  }
  const { summary } = hit
  const rootReal = resolveReal(root)
  const key = keyOf(rootReal, summary.hash)
  // Bloqueado (H07.3): nenhuma confiança libera, nem a gravada nem a da sessão.
  const allowed = gitAllowedBy(summary, sessionTrust.has(key), getGitTrustedHash(rootReal))
  return { summary, allowed, declined: declined.has(key) }
}

/** Grava a decisão do usuário. */
export function recordGitDecision(root: string, summary: GitRiskSummary, trusted: boolean): void {
  const rootReal = resolveReal(root)
  const key = keyOf(rootReal, summary.hash)
  if (!trusted || summary.blocked) {
    declined.add(key)
    return
  }
  declined.delete(key)
  if (summary.sessionOnly) sessionTrust.add(key)
  else trustGit(rootReal, summary.hash)
}

export const GIT_BLOCKED_FOOTER = 'Você usa o chat, a árvore e a prévia normalmente; o git fica pausado. Para liberar, remova essas configurações do .git/config.'

export const GIT_FOOTER ='Sem confiar, você usa o chat, a árvore e a prévia normalmente. Só o git fica pausado. Se esses arquivos mudarem, o DevDeck pergunta de novo.'

async function showDialog(opts: Electron.MessageBoxOptions): Promise<number> {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { response } = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts)
  return response
}

/** Diálogo nativo só do git (botão "Revisar configurações…" da aba Alterações). */
export async function requestGitTrust(root: string): Promise<boolean> {
  const gate = await gitGate(root)
  if (gate.allowed) return true
  if (gate.summary.blocked) {
    // Sem botão de confiar: só o que mudar no .git/config libera (H07.3).
    await showDialog({
      type: 'warning',
      title: `Git bloqueado em "${basename(root)}"`,
      message: 'Este repositório tem configurações do git que o DevDeck não aceita.',
      detail: `${describeGitRisk(gate.summary)}\n${GIT_BLOCKED_FOOTER}`,
      buttons: ['Entendi'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    return false
  }
  const response = await showDialog({
    type: 'warning',
    title: `Abrir "${basename(root)}" com segurança?`,
    message: 'Este repositório tem configurações do git que podem executar programas quando o DevDeck lê o status ou o diff.',
    detail: `${describeGitRisk(gate.summary)}\n${GIT_FOOTER}`,
    buttons: ['Abrir sem git', 'Confiar e usar git'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  recordGitDecision(root, gate.summary, response === 1)
  return response === 1
}

export { showDialog }
