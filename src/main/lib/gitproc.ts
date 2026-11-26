import { posix, win32 } from 'node:path'

// Como o DevDeck chama o git (Sprint 05, H05.1). Puro: caminho do binário, ambiente e argumentos.
// Defesa em profundidade: mesmo em repositório confiado, nenhum hook nem fsmonitor do repo roda.

type Env = Record<string, string | undefined>

const pathOf = (platform: NodeJS.Platform): typeof posix => (platform === 'win32' ? win32 : posix)

function isInside(root: string, p: string, platform: NodeJS.Platform): boolean {
  const P = pathOf(platform)
  const norm = (x: string): string => (platform === 'win32' ? P.resolve(x).toLowerCase() : P.resolve(x))
  const rel = P.relative(norm(root), norm(p))
  return rel === '' || (!rel.startsWith('..') && !P.isAbsolute(rel))
}

/** Entradas do PATH que valem: absolutas e fora do workspace (`.`, relativas e pastas do repo saem). */
export function safePathEntries(pathEnv: string | undefined, platform: NodeJS.Platform, root: string | null): string[] {
  const P = pathOf(platform)
  return (pathEnv ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .map((e) => e.trim().replace(/^"(.*)"$/, '$1'))
    .filter((e) => e && P.isAbsolute(e) && !(root && isInside(root, e, platform)))
}

/**
 * Caminho absoluto do git. Nunca procura no cwd: no Windows, um `git.exe` plantado na raiz do
 * workspace rodaria antes do PATH.
 */
export function pickGitBinary(pathEnv: string | undefined, platform: NodeJS.Platform, root: string | null, isFile: (p: string) => boolean): string | null {
  const P = pathOf(platform)
  const name = platform === 'win32' ? 'git.exe' : 'git'
  for (const dir of safePathEntries(pathEnv, platform, root)) {
    const candidate = P.join(dir, name)
    if (isFile(candidate)) return candidate
  }
  return null
}

/** Variáveis do processo que o git recebe. Nada de `GIT_*`, proxies ou loaders herdados. */
const ENV_ALLOW = [
  'PATH',
  'SYSTEMROOT',
  'WINDIR',
  'SYSTEMDRIVE',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE'
]

function pickEnv(base: Env, platform: NodeJS.Platform, root: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  const wanted = new Set(ENV_ALLOW)
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue
    const key = platform === 'win32' ? k.toUpperCase() : k
    if (wanted.has(key)) out[key] = v
  }
  out.PATH = safePathEntries(out.PATH, platform, root).join(platform === 'win32' ? ';' : ':')
  return out
}

/**
 * Config forçada por ambiente em todo git do DevDeck e do agente: nunca entrar em submódulo. O `.git/config`
 * do submódulo (`.git/modules/*` ou repositório embutido) não passa pela inspeção (security review da Sprint 05).
 */
export const FORCED_GIT_CONFIG: [string, string][] = [
  ['diff.ignoreSubmodules', 'all'],
  ['submodule.recurse', 'false'],
  ['status.submoduleSummary', 'false'],
  ['core.fsmonitor', 'false']
]

/**
 * `submodule.<nome>.ignore` (do `.gitmodules` ou do `.git/config`) vence o `diff.ignoreSubmodules=all` forçado:
 * com `ignore=none` o git entra no submódulo e roda o filtro dele (confirmado com git 2.50, hotfix v0.6.1).
 * Por isso cada nome conhecido recebe `ignore=all` por ambiente, que tem precedência sobre os arquivos.
 */
export function submoduleIgnoreConfig(names: readonly string[]): [string, string][] {
  return names.map((n) => [`submodule.${n}.ignore`, 'all'])
}

export function forcedConfigEnv(extra: readonly [string, string][] = []): Record<string, string> {
  const all = [...FORCED_GIT_CONFIG, ...extra]
  const out: Record<string, string> = { GIT_CONFIG_COUNT: String(all.length) }
  all.forEach(([k, v], i) => {
    out[`GIT_CONFIG_KEY_${i}`] = k
    out[`GIT_CONFIG_VALUE_${i}`] = v
  })
  return out
}

/** Ambiente de toda chamada git do DevDeck num workspace. */
export function gitEnv(base: Env, platform: NodeJS.Platform, root: string): Record<string, string> {
  const P = pathOf(platform)
  return {
    ...pickEnv(base, platform, root),
    ...forcedConfigEnv(),
    GIT_DIR: P.join(root, '.git'),
    GIT_WORK_TREE: root,
    GIT_CEILING_DIRECTORIES: P.dirname(root),
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_OPTIONAL_LOCKS: '0'
  }
}

/**
 * Ambiente da inspeção do repositório (`git config --file`, e `rev-parse`/`config --blob` do `.gitmodules`):
 * só lê. `GIT_NO_LAZY_FETCH`: num partial clone, objeto ausente faria fetch e rodaria o `core.sshCommand` do
 * repo antes da confiança (security review do hotfix v0.6.1).
 */
export function inspectEnv(base: Env, platform: NodeJS.Platform, emptyGlobalConfig: string): Record<string, string> {
  return { ...pickEnv(base, platform, null), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyGlobalConfig, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' }
}

export function inspectArgs(configFile: string): string[] {
  return ['config', '--file', configFile, '--list', '-z', '--no-includes']
}

/** Prefixo fixo: sem pager, sem locks opcionais, sem fsmonitor, hooks numa pasta vazia do app, sem protocolos remotos. */
export function gitArgs(emptyHooksDir: string, args: string[]): string[] {
  return ['--no-pager', '--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${emptyHooksDir}`, '-c', 'protocol.allow=never', ...args]
}

/**
 * Ambiente do processo do Claude Code (SDK). Sem `GIT_*` herdado, sem entrar em submódulo e com PATH só de
 * pastas absolutas fora do workspace (um `git.exe` plantado na raiz não é achado). Com o git do workspace
 * pausado, o git que o agente rodar não encontra repositório (GIT_DIR inexistente e teto no pai do workspace).
 * `submodules`: nomes vistos pelo gate (`GitRiskSummary.submodules`), cada um com `ignore=all` forçado.
 */
export function agentEnv(
  base: Env,
  platform: NodeJS.Platform,
  root: string,
  gitAllowed: boolean,
  noGitDir: string,
  submodules: readonly string[] = []
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(base)) {
    if (/^GIT_/i.test(k)) continue
    out[k] = /^path$/i.test(k) ? safePathEntries(v, platform, root).join(platform === 'win32' ? ';' : ':') : v
  }
  Object.assign(out, forcedConfigEnv(submoduleIgnoreConfig(submodules)))
  // Windows: shells e runtimes que respeitam esta variável não procuram executável na pasta atual (conferir no roteiro manual).
  if (platform === 'win32') out.NoDefaultCurrentDirectoryInExePath = '1'
  // Sempre: o git do agente nunca sobe acima do workspace (subpasta de um repo não acha o .git do pai, que não foi inspecionado).
  out.GIT_CEILING_DIRECTORIES = pathOf(platform).dirname(root)
  if (!gitAllowed) out.GIT_DIR = noGitDir
  return out
}

// ---------- Saída do git status ----------

export interface ParsedStatus {
  branch?: string
  files: { path: string; status: string }[]
}

/** `git status --porcelain=v1 -z --branch`. Renomeado: `XY destino\0origem\0`. */
export function parseStatusZ(out: string): ParsedStatus {
  const parts = out.split('\0')
  const files: ParsedStatus['files'] = []
  let branch: string | undefined
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]
    if (!rec) continue
    if (rec.startsWith('## ')) {
      const head = rec.slice(3)
      if (head.startsWith('No commits yet on ')) branch = head.slice('No commits yet on '.length)
      else if (head.startsWith('Initial commit on ')) branch = head.slice('Initial commit on '.length)
      else if (!head.startsWith('HEAD (no branch)')) branch = head.split('...')[0].split(' [')[0]
      continue
    }
    if (rec.length < 4) continue
    const x = rec[0]
    const y = rec[1]
    const path = rec.slice(3).replace(/\\/g, '/')
    if (x === 'R' || x === 'C') i++ // pula a origem
    files.push({ path, status: x === '?' ? '??' : `${x}${y}`.trim() || 'M' })
  }
  return { branch, files }
}
