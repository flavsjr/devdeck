import type { EditVerdict } from './paths'

// "Sempre nesta sessão" por caminho (Sprint 05, H05.5). Puro: quem chama resolve o realpath e classifica.

/** Campos de caminho conhecidos por tool. Sem campo = a tool age no cwd (dentro do workspace). */
const KNOWN: Record<string, string[]> = {
  Read: ['file_path'],
  NotebookEdit: ['notebook_path'],
  NotebookRead: ['notebook_path'],
  Glob: ['path'],
  Grep: ['path'],
  LS: ['path']
}

/** Tools sem caminho nem rede livre: podem ganhar "Sempre" sem extrator. */
const NO_PATH = new Set(['TodoWrite', 'Task', 'ExitPlanMode', 'WebSearch'])

/**
 * "Sempre nesta sessão" só para tool que o DevDeck sabe onde age (critério da H05.5): Bash, WebFetch, MCP e
 * tools desconhecidas perguntam sempre (ex.: `cat ~/.ssh/id_*` no Bash não tem caminho para conferir).
 */
export function alwaysEligible(toolName: string): boolean {
  return Object.hasOwn(KNOWN, toolName) || NO_PATH.has(toolName)
}

const looksLikePathKey = (k: string): boolean => k === 'path' || k === 'paths' || /_path$/i.test(k) || /_paths$/i.test(k)

/**
 * Caminhos que a tool vai tocar. Tool conhecida: os campos dela; desconhecida: qualquer campo com nome de caminho
 * (`path`, `*_path`, `*_paths`). Valor que não é texto vira '' (classificado como fora, falha fechada).
 */
export function pathArgsOf(toolName: string, input: Record<string, unknown>): string[] {
  const keys = Object.hasOwn(KNOWN, toolName) ? KNOWN[toolName] : Object.keys(input).filter(looksLikePathKey)
  const out: string[] = []
  for (const k of keys) {
    const v = input[k]
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) for (const x of v) out.push(typeof x === 'string' ? x : '')
    else out.push(typeof v === 'string' ? v : '')
  }
  return out
}

export interface ToolScope {
  /** Pior classificação entre os caminhos (sem caminho = inside). */
  scope: EditVerdict
  /** "Sempre nesta sessão" só vale com todos os caminhos dentro do workspace. */
  allowAlways: boolean
}

const RANK: Record<EditVerdict, number> = { inside: 0, sensitive: 1, outside: 2 }

export function toolScope(paths: string[], classify: (p: string) => EditVerdict): ToolScope {
  let scope: EditVerdict = 'inside'
  for (const p of paths) {
    const v = p ? classify(p) : 'outside'
    if (RANK[v] > RANK[scope]) scope = v
  }
  return { scope, allowAlways: scope === 'inside' }
}
