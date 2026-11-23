import { readFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import type { GitStatus } from '@shared/types'
import { getRoot, safeResolve } from './workspace'

// Visão das alterações do workspace via git (revisão pós-aplicação).

function git() {
  const r = getRoot()
  if (!r) throw new Error('Nenhum workspace aberto.')
  return simpleGit(r)
}

export async function gitStatus(): Promise<GitStatus> {
  if (!getRoot()) return { isRepo: false, files: [] }
  const g = git()
  if (!(await g.checkIsRepo())) return { isRepo: false, files: [] }
  const st = await g.status()
  return {
    isRepo: true,
    branch: st.current ?? undefined,
    files: st.files.map((f) => ({
      path: f.path.replace(/\\/g, '/'),
      status: f.index === '?' ? '??' : `${f.index}${f.working_dir}`.trim() || 'M'
    }))
  }
}

export async function gitDiff(relPath: string): Promise<{ before: string; after: string }> {
  const g = git()
  let before = ''
  try {
    before = await g.show([`HEAD:${relPath}`])
  } catch {
    before = '' // arquivo novo
  }
  let after = ''
  try {
    after = await readFile(safeResolve(relPath), 'utf8')
  } catch {
    after = '' // arquivo removido
  }
  return { before, after }
}

/** Descarta alterações de um arquivo rastreado (volta ao HEAD). */
export async function gitRestore(relPath: string): Promise<void> {
  safeResolve(relPath)
  await git().raw(['restore', '--staged', '--worktree', '--source=HEAD', '--', relPath])
}
