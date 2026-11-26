import { execFile } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, realpathSync, type Stats } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  classifyGitPath,
  splitKey,
  isPathKey,
  parseConfigList,
  resolveGitPathValue,
  summarizeGitConfig,
  type GitDirShape,
  type GitHook,
  type GitPathTarget,
  type GitRiskSummary
} from './lib/gitconfig'
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
/** Teto de cada processo git. Na inspeção é injetável para o teste não esperar 15 s (H07.3). */
export const GIT_TIMEOUT_MS = 15_000

/** Erro de processo git; `timedOut` quando o execFile matou o processo pelo tempo limite. */
export class GitExecError extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean
  ) {
    super(message)
  }
}

const killedByTimeout = (err: unknown): boolean => Boolean(err && (err as { killed?: unknown }).killed === true)

function exec(binary: string, args: string[], cwd: string, env: Record<string, string>, timeout = GIT_TIMEOUT_MS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { cwd, env, windowsHide: true, timeout, maxBuffer: MAX_BUFFER, encoding: 'buffer', shell: false }, (err, stdout, stderr) => {
      if (err) {
        const timedOut = killedByTimeout(err)
        const msg = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : ''
        reject(new GitExecError(timedOut ? `git passou do tempo limite (${timeout} ms)` : msg || err.message, timedOut))
      } else resolve(stdout)
    })
  })
}

/** Como `exec`, mas devolve o código de saída em vez de rejeitar (distinguir "não existe" de "falhou"). */
function execCode(binary: string, args: string[], cwd: string, env: Record<string, string>, timeout = GIT_TIMEOUT_MS): Promise<{ code: number; stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(binary, args, { cwd, env, windowsHide: true, timeout, maxBuffer: MAX_BUFFER, encoding: 'buffer', shell: false }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code as number) : -1) : 0
      resolve({ code, stdout: Buffer.isBuffer(stdout) ? stdout.toString('utf8') : '', timedOut: killedByTimeout(err) })
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

/** Nomes em `.git/hooks` que o git rodaria: tudo menos `*.sample`, em ordem. Pasta ausente → []. */
function hookNames(g: string): string[] {
  try {
    return readdirSync(join(g, 'hooks'))
      .filter((n) => !n.endsWith('.sample'))
      .sort()
  } catch {
    return []
  }
}

/** Assinatura barata (lstat) dos arquivos que entram no resumo: muda → reavaliar. */
export function gitSignature(root: string): string {
  const g = join(root, '.git')
  // `index` e `HEAD`: sem `.gitmodules` na árvore, o git usa o do index ou do HEAD (hotfix v0.6.1).
  // `hooks` e cada hook (H07.3): editar um hook no lugar não muda o mtime da pasta.
  const hooks = ['hooks', ...hookNames(g).map((n) => `hooks/${n}`)]
  return [...['', 'config', 'info/attributes', 'commondir', 'worktrees', 'config.worktree', 'index', 'HEAD', ...hooks].map((rel) => (rel ? join(g, rel) : g)), join(root, '.gitmodules')]
    .map((p) => {
      const st = lst(p)
      return st ? `${st.mode}:${st.size}:${st.mtimeMs}:${st.ino}` : '-'
    })
    .join('|')
}

/** Hooks com conteúdo (até 1 MiB cada; maior ou não-arquivo → null, que também pausa). */
function readHooks(g: string): GitHook[] {
  return hookNames(g).map((name) => {
    const st = lst(join(g, 'hooks', name))
    return { name, text: st && st.isFile() && st.size <= 1024 * 1024 ? readText(join(g, 'hooks', name)) : null }
  })
}

/**
 * realpath do caminho; se não existe, realpath do pai mais próximo que existe + o resto. Parte que existe mas não
 * resolve (link pendente, junction quebrada) → null: não dá para saber para onde aponta (security review da H07.3).
 */
function realOrLexical(p: string): string | null {
  const rest: string[] = []
  let cur = resolve(p)
  for (;;) {
    try {
      return join(realpathSync.native(cur), ...rest)
    } catch {
      if (lst(cur)) return null
      const up = dirname(cur)
      if (up === cur) return resolve(p)
      rest.unshift(basename(cur))
      cur = up
    }
  }
}

/** `core.worktree` e `include.path` do `.git/config` com o destino classificado (H07.3). */
function pathTargetsOf(configList: string | null, root: string, g: string): GitPathTarget[] {
  const entries = configList === null ? null : parseConfigList(configList)
  if (!entries) return []
  const platform = process.platform
  const rootReal = realOrLexical(root) ?? resolve(root)
  const gitReal = realOrLexical(g) ?? resolve(g)
  return entries
    .filter((e) => isPathKey(e.key) && e.value !== null)
    .map((e) => {
      const value = e.value as string
      const lexical = resolveGitPathValue(value, g, homedir(), platform)
      const target = lexical === null ? null : realOrLexical(lexical)
      if (lexical === null || target === null) return { key: e.key, value, where: 'outside' as const }
      const whereReal = classifyGitPath(target, rootReal, gitReal, platform)
      // core.worktree: o texto também precisa dar na raiz. Um link dentro do .git que hoje aponta para a raiz
      // poderia ser trocado depois sem mudar config nem assinatura.
      if (splitKey(e.key).section === 'core' && whereReal === 'root') {
        const whereText = classifyGitPath(lexical, resolve(root), resolve(g), platform)
        return { key: e.key, value, where: whereText === 'root' ? ('root' as const) : ('git' as const) }
      }
      return { key: e.key, value, where: whereReal }
    })
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
export async function inspectRepo(
  root: string,
  binary: string,
  outsideDir: string,
  emptyGlobalConfig: string,
  baseEnv: Record<string, string | undefined> = process.env,
  opts: { timeoutMs?: number } = {}
): Promise<GitRiskSummary> {
  const timeoutMs = opts.timeoutMs ?? GIT_TIMEOUT_MS
  const shape = readGitShape(root)
  const g = join(root, '.git')
  const configFile = join(g, 'config')
  const configText = shape.dotGit === 'dir' && !shape.configNotFile ? readText(configFile) : null
  let timedOut = false
  const list = async (file: string): Promise<string | null> => {
    try {
      return (await exec(binary, inspectArgs(file), outsideDir, inspectEnv(baseEnv, process.platform, emptyGlobalConfig), timeoutMs)).toString('utf8')
    } catch (e) {
      if (e instanceof GitExecError && e.timedOut) timedOut = true
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
    const blob = await gitmodulesBlob(root, binary, outsideDir, emptyGlobalConfig, baseEnv, timeoutMs)
    if (blob) {
      ;({ gitmodules, gitmodulesText, gitmodulesList } = blob)
      if (blob.timedOut) timedOut = true
    }
  }
  return summarizeGitConfig({
    shape,
    configList,
    configText,
    attributesText: shape.dotGit === 'dir' ? readText(join(g, 'info', 'attributes')) : null,
    dotGitFileText: shape.dotGit === 'file' ? readText(g) : null,
    gitmodules,
    gitmodulesText,
    gitmodulesList,
    pathTargets: shape.dotGit === 'dir' ? pathTargetsOf(configList, root, g) : [],
    hooks: shape.dotGit === 'dir' ? readHooks(g) : [],
    timedOut
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
  baseEnv: Record<string, string | undefined>,
  timeoutMs: number
): Promise<{ gitmodules: 'blob' | 'other'; gitmodulesText: string | null; gitmodulesList: string | null; timedOut: boolean } | null> {
  const env = inspectEnv(baseEnv, process.platform, emptyGlobalConfig)
  // Sem lazy fetch (inspectEnv) e sem protocolo remoto: objeto ausente de partial clone falha em vez de buscar.
  const pre = ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'safe.directory=*', `--git-dir=${join(root, '.git')}`]
  for (const spec of [':.gitmodules', 'HEAD:.gitmodules']) {
    const r = await execCode(binary, [...pre, 'rev-parse', '--verify', '--quiet', spec], outsideDir, env, timeoutMs)
    if (r.code === 1 && !r.timedOut) continue // não existe nesse lugar
    const oid = r.stdout.trim()
    if (r.code !== 0 || !/^[0-9a-f]{40,64}$/.test(oid)) return { gitmodules: 'other', gitmodulesText: null, gitmodulesList: null, timedOut: r.timedOut }
    const l = await execCode(binary, [...pre, 'config', '--blob', oid, '--list', '-z', '--no-includes'], outsideDir, env, timeoutMs)
    return { gitmodules: 'blob', gitmodulesText: `${spec} ${oid}`, gitmodulesList: l.code === 0 ? l.stdout : null, timedOut: l.timedOut }
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
