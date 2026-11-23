import nodePath from 'node:path'

// Confinamento de caminhos ao workspace. Recebe caminhos já resolvidos (realpath) por quem chama.

type PathApi = Pick<typeof nodePath, 'relative' | 'isAbsolute' | 'sep'>

/** Pastas cuja edição pode virar execução de código (hooks do git, config do agente, tarefas do editor, CI). */
export const SENSITIVE_DIRS = ['.git', '.claude', '.vscode', '.idea', '.github', '.husky', '.devcontainer']

export function isInsideRoot(root: string, target: string, p: PathApi = nodePath, caseInsensitive = p.sep === '\\'): boolean {
  const norm = (s: string): string => (caseInsensitive ? s.toLowerCase() : s)
  const rel = p.relative(norm(root), norm(target))
  if (rel === '') return true
  return !rel.startsWith('..') && !p.isAbsolute(rel)
}

/** true se algum segmento do caminho relativo é uma pasta sensível (sem diferenciar maiúsculas). */
export function isSensitiveRel(rel: string): boolean {
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  return parts.some((seg) => SENSITIVE_DIRS.includes(seg.toLowerCase()))
}

export type EditVerdict = 'inside' | 'outside' | 'sensitive'

export function classifyEditPath(rootReal: string, targetReal: string, p: PathApi = nodePath): EditVerdict {
  if (!isInsideRoot(rootReal, targetReal, p)) return 'outside'
  return isSensitiveRel(p.relative(rootReal, targetReal)) ? 'sensitive' : 'inside'
}
