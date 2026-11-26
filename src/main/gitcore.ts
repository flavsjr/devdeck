import { execFile } from 'node:child_process'
import { lstatSync, readFileSync, type Stats } from 'node:fs'
import { join } from 'node:path'
import { summarizeGitConfig, type GitDirShape, type GitRiskSummary } from './lib/gitconfig'
import { gitArgs, gitEnv, inspectArgs, inspectEnv, parseStatusZ, type ParsedStatus } from './lib/gitproc'

// Núcleo do git do DevDeck (H05.1): sem electron nem store, para o teste de integração usar o mesmo
// código que roda no app. Quem decide se pode rodar é o gate em `gitTrust.ts`.

export interface GitContext {
  root: string
  /** Caminho absoluto do git (pickGitBinary). */
  binary: string
  /** Pasta vazia do app usada como core.hooksPath. */
  hooksDir: string
  env?: Record<string, string | undefined>
}

const MAX_BUFFER = 32 * 1024 * 1024

function exec(binary: string, args: string[], cwd: string, env: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { cwd, env, windowsHide: true, timeout: 15_000, maxBuffer: MAX_BUFFER, encoding: 'buffer', shell: false }, (err, stdout, stderr) => {
      if (err) {
        const msg = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : ''
        reject(new Error(msg || err.message))
      } else resolve(stdout)
    })
  })
}

/** Como `exec`, mas devolve o código de saída em vez de rejeitar (distinguir "não existe" de "falhou"). */
function execCode(binary: string, args: string[], cwd: string, env: Record<string, string>): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(binary, args, { cwd, env, windowsHide: true, timeout: 15_000, maxBuffer: MAX_BUFFER, encoding: 'buffer', shell: false }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code as number) : -1) : 0
      resolve({ code, stdout: Buffer.isBuffer(stdout) ? stdout.toString('utf8') : '' })
    })
  })
}

export function runGit(ctx: GitContext, args: string[]): Promise<Buffer> {
  return exec(ctx.binary, gitArgs(ctx.hooksDir, args), ctx.root, gitEnv(ctx.env ?? process.env, process.platform, ctx.root))
}

const lst = (p: string): Stats | null => {
  try {
    return lstatSync(p)
  } catch {
    return null
  }
}

const readText = (p: string): string | null => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** Assinatura barata (lstat) dos arquivos que entram no resumo: muda → reavaliar. */
export function gitSignature(root: string): string {
  const g = join(root, '.git')
  // `index` e `HEAD`: sem `.gitmodules` na árvore, o git usa o do index ou do HEAD (hotfix v0.6.1).
  return [...['', 'config', 'info/attributes', 'commondir', 'worktrees', 'config.worktree', 'index', 'HEAD'].map((rel) => (rel ? join(g, rel) : g)), join(root, '.gitmodules')]
    .map((p) => {
      const st = lst(p)
      return st ? `${st.mode}:${st.size}:${st.mtimeMs}:${st.ino}` : '-'
    })
    .join('|')
}

export function readGitShape(root: string): GitDirShape {
  const g = join(root, '.git')
  const st = lst(g)
  if (!st) return { dotGit: 'missing' }
  if (st.isSymbolicLink()) return { dotGit: 'link' }
  if (st.isFile()) return { dotGit: 'file' }
  if (!st.isDirectory()) return { dotGit: 'other' }
  const cfg = lst(join(g, 'config'))
  return {
    dotGit: 'dir',
    configNotFile: Boolean(cfg && !cfg.isFile()),
    commondir: Boolean(lst(join(g, 'commondir'))),
    worktrees: Boolean(lst(join(g, 'worktrees'))),
    configWorktree: Boolean(lst(join(g, 'config.worktree')))
  }
}

/**
 * Resume o risco do `.git` do workspace. O `git config --file` roda com cwd fora do workspace e
 * `--no-includes`: só lê o arquivo, não descobre repositório nem executa nada configurado nele.
 */
export async function inspectRepo(root: string, binary: string, outsideDir: string, emptyGlobalConfig: string, baseEnv: Record<string, string | undefined> = process.env): Promise<GitRiskSummary> {
  const shape = readGitShape(root)
  const g = join(root, '.git')
  const configFile = join(g, 'config')
  const configText = shape.dotGit === 'dir' && !shape.configNotFile ? readText(configFile) : null
  const list = async (file: string): Promise<string | null> => {
    try {
      return (await exec(binary, inspectArgs(file), outsideDir, inspectEnv(baseEnv, process.platform, emptyGlobalConfig))).toString('utf8')
    } catch {
      return null
    }
  }
  const configList = configText !== null ? await list(configFile) : null
  // `.gitmodules` (hotfix v0.6.1): o `ignore` por submódulo vence a config forçada do agente.
  const modulesFile = join(root, '.gitmodules')
  const modulesSt = lst(modulesFile)
  let gitmodules: 'missing' | 'file' | 'other' | 'blob' = !modulesSt ? 'missing' : modulesSt.isFile() ? 'file' : 'other'
  let gitmodulesText = gitmodules === 'file' ? readText(modulesFile) : null
  let gitmodulesList = gitmodulesText !== null ? await list(modulesFile) : null
  if (gitmodules === 'missing') {
    // Sem o arquivo na árvore, o git usa o do index (`:.gitmodules`) e depois o do HEAD (security review do hotfix).
    const blob = await gitmodulesBlob(root, binary, outsideDir, emptyGlobalConfig, baseEnv)
    if (blob) ({ gitmodules, gitmodulesText, gitmodulesList } = blob)
  }
  return summarizeGitConfig({
    shape,
    configList,
    configText,
    attributesText: shape.dotGit === 'dir' ? readText(join(g, 'info', 'attributes')) : null,
    dotGitFileText: shape.dotGit === 'file' ? readText(g) : null,
    gitmodules,
    gitmodulesText,
    gitmodulesList
  })
}

/**
 * `.gitmodules` do index ou do HEAD, lido como blob: `rev-parse` e `config --blob` só leem o banco de objetos e
 * o index (sem filtro, hook nem atualização do index; fsmonitor desligado; sem lazy fetch nem protocolo remoto). cwd fora do workspace, `--git-dir`
 * explícito e config global/sistema vazia. Sem blob → null; erro que não é "não existe" → `other` (pausa).
 */
async function gitmodulesBlob(
  root: string,
  binary: string,
  outsideDir: string,
  emptyGlobalConfig: string,
  baseEnv: Record<string, string | undefined>
): Promise<{ gitmodules: 'blob' | 'other'; gitmodulesText: string | null; gitmodulesList: string | null } | null> {
  const env = inspectEnv(baseEnv, process.platform, emptyGlobalConfig)
  // Sem lazy fetch (inspectEnv) e sem protocolo remoto: objeto ausente de partial clone falha em vez de buscar.
  const pre = ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'safe.directory=*', `--git-dir=${join(root, '.git')}`]
  for (const spec of [':.gitmodules', 'HEAD:.gitmodules']) {
    const r = await execCode(binary, [...pre, 'rev-parse', '--verify', '--quiet', spec], outsideDir, env)
    if (r.code === 1) continue // não existe nesse lugar
    const oid = r.stdout.trim()
    if (r.code !== 0 || !/^[0-9a-f]{40,64}$/.test(oid)) return { gitmodules: 'other', gitmodulesText: null, gitmodulesList: null }
    const l = await execCode(binary, [...pre, 'config', '--blob', oid, '--list', '-z', '--no-includes'], outsideDir, env)
    return { gitmodules: 'blob', gitmodulesText: `${spec} ${oid}`, gitmodulesList: l.code === 0 ? l.stdout : null }
  }
  return null
}

export async function statusOf(ctx: GitContext): Promise<ParsedStatus> {
  return parseStatusZ((await runGit(ctx, ['status', '--porcelain=v1', '-z', '--branch', '--ignore-submodules=all'])).toString('utf8'))
}

/** Conteúdo no HEAD por plumbing (`cat-file blob`): sem textconv nem filtro. Arquivo novo → ''. */
export async function headBlob(ctx: GitContext, relPath: string): Promise<string> {
  try {
    return (await runGit(ctx, ['cat-file', 'blob', `HEAD:${relPath.replace(/\\/g, '/')}`])).toString('utf8')
  } catch {
    return ''
  }
}

export async function restoreFile(ctx: GitContext, relPath: string): Promise<void> {
  await runGit(ctx, ['restore', '--staged', '--worktree', '--source=HEAD', '--', relPath])
}
