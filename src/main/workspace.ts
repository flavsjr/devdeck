import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep, isAbsolute } from 'node:path'
import ignore, { type Ignore } from 'ignore'
import type { FileContent, TreeNode } from '@shared/types'

// Estado do workspace ativo + leitura segura (sempre confinada à raiz).

const ALWAYS_IGNORED = ['.git', 'node_modules', 'bin', 'obj', '.vs', '.idea', 'dist', 'out', '.next', '__pycache__', '.venv']
const MAX_PREVIEW_BYTES = 512 * 1024

let root: string | null = null
let ig: Ignore = ignore()

export function getRoot(): string | null {
  return root
}

export function openWorkspace(dir: string): string {
  const abs = resolve(dir)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`Pasta não encontrada: ${abs}`)
  root = abs
  ig = ignore().add(ALWAYS_IGNORED)
  const gi = join(abs, '.gitignore')
  if (existsSync(gi)) ig.add(readFileSync(gi, 'utf8'))
  return abs
}

function requireRoot(): string {
  if (!root) throw new Error('Nenhum workspace aberto.')
  return root
}

/** Resolve caminho relativo garantindo que não escape da raiz. */
export function safeResolve(relPath: string): string {
  const r = requireRoot()
  const abs = resolve(r, relPath)
  const rel = relative(r, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Caminho fora do workspace.')
  return abs
}

export function toRel(absPath: string): string | null {
  if (!root) return null
  const rel = relative(root, absPath)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

export async function listDir(relDir: string): Promise<TreeNode[]> {
  const abs = safeResolve(relDir || '.')
  const entries = await readdir(abs, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const e of entries) {
    const rel = (relDir ? `${relDir}/${e.name}` : e.name).replace(/\\/g, '/')
    const isDir = e.isDirectory()
    if (ig.ignores(isDir ? `${rel}/` : rel)) continue
    let size: number | undefined
    if (!isDir) {
      try {
        size = (await stat(join(abs, e.name))).size
      } catch {
        size = undefined
      }
    }
    nodes.push({ name: e.name, path: rel, dir: isDir, size })
  }
  return nodes.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export async function readWorkspaceFile(relPath: string): Promise<FileContent> {
  const abs = safeResolve(relPath)
  const st = await stat(abs)
  const buf = await readFile(abs)
  if (looksBinary(buf)) return { path: relPath, content: null, truncated: false, binary: true, size: st.size }
  const truncated = buf.length > MAX_PREVIEW_BYTES
  return {
    path: relPath,
    content: buf.subarray(0, MAX_PREVIEW_BYTES).toString('utf8'),
    truncated,
    binary: false,
    size: st.size
  }
}
