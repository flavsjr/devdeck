import { readFile } from 'node:fs/promises'
import type { GitStatus } from '@shared/types'
import { headBlob, restoreFile, statusOf } from './gitcore'
import { gitContext, gitGate, requestGitTrust } from './gitTrust'
import { getRoot, safeResolve } from './workspace'

// Visão das alterações do workspace via git (revisão pós-aplicação). Toda chamada passa pelo gate (H05.1).

export const GIT_PAUSED = 'Git pausado neste workspace: revise as configurações do git para usar status, diff e descarte.'

function requireRoot(): string {
  const r = getRoot()
  if (!r) throw new Error('Nenhum workspace aberto.')
  return r
}

async function allowedContext(): Promise<ReturnType<typeof gitContext>> {
  const root = requireRoot()
  const gate = await gitGate(root)
  if (!gate.summary.isRepo) throw new Error('Este workspace não é um repositório git.')
  if (!gate.allowed) throw new Error(GIT_PAUSED)
  return gitContext(root)
}

export async function gitStatus(): Promise<GitStatus> {
  const root = getRoot()
  if (!root) return { isRepo: false, files: [] }
  const gate = await gitGate(root)
  if (!gate.summary.isRepo) return { isRepo: false, files: [] }
  if (!gate.allowed) return { isRepo: true, files: [], paused: { reasons: gate.summary.reasons } }
  const st = await statusOf(gitContext(root))
  return { isRepo: true, branch: st.branch, files: st.files }
}

export async function gitDiff(relPath: string): Promise<{ before: string; after: string }> {
  const abs = safeResolve(relPath)
  const ctx = await allowedContext()
  const before = await headBlob(ctx, relPath)
  let after = ''
  try {
    after = await readFile(abs, 'utf8')
  } catch {
    after = '' // arquivo removido
  }
  return { before, after }
}

/** Descarta alterações de um arquivo rastreado (volta ao HEAD). */
export async function gitRestore(relPath: string): Promise<void> {
  safeResolve(relPath)
  await restoreFile(await allowedContext(), relPath)
}

/** Botão "Revisar configurações…": o diálogo é nativo, no main; o renderer só pede. */
export async function gitTrust(): Promise<boolean> {
  return requestGitTrust(requireRoot())
}
