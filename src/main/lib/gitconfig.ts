import { createHash } from 'node:crypto'
import { clip } from './trust'

// Confiança no git do workspace (Sprint 05, H05.1 / B3). Puro: quem chama lê os arquivos e roda
// `git config --file <arq> --list -z --no-includes` (que só lê o arquivo, não executa nada).
// Qualquer chave fora da lista de permitidas, ou estrutura de `.git` que o DevDeck não consegue
// conferir, pausa o git até o usuário confiar (falha fechada).

export interface GitConfigEntry {
  key: string
  value: string | null
}

/**
 * Interpreta a saída de `git config --list -z`: cada entrada é `chave\nvalor\0` (ou `chave\0` sem valor).
 * Saída que não segue o formato → null (o chamador trata como arriscado).
 */
export function parseConfigList(out: string): GitConfigEntry[] | null {
  if (out === '') return []
  if (!out.endsWith('\0')) return null
  const entries: GitConfigEntry[] = []
  for (const raw of out.slice(0, -1).split('\0')) {
    const nl = raw.indexOf('\n')
    const key = nl === -1 ? raw : raw.slice(0, nl)
    // Seção, subseção opcional (qualquer coisa menos quebra de linha) e nome.
    if (!/^[A-Za-z0-9-]+(\.[^\r\n]*)?\.[A-Za-z][A-Za-z0-9-]*$/.test(key)) return null
    entries.push({ key, value: nl === -1 ? null : raw.slice(nl + 1) })
  }
  return entries
}

/** Chave do git separada em seção, subseção (pode ter pontos) e nome. Seção e nome sem diferenciar maiúsculas. */
export function splitKey(key: string): { section: string; sub: string | null; name: string } {
  const first = key.indexOf('.')
  const last = key.lastIndexOf('.')
  return {
    section: key.slice(0, first).toLowerCase(),
    sub: first === last ? null : key.slice(first + 1, last),
    name: key.slice(last + 1).toLowerCase()
  }
}

/** Chaves sem subseção que só guardam dados (não apontam para programa, caminho ou rede). */
const PLAIN = new Set([
  'core.repositoryformatversion',
  'core.filemode',
  'core.bare',
  'core.logallrefupdates',
  'core.symlinks',
  'core.ignorecase',
  'core.precomposeunicode',
  'core.autocrlf',
  'core.eol',
  'core.safecrlf',
  'core.longpaths',
  'core.quotepath',
  'core.checkstat',
  'core.trustctime',
  'user.name',
  'user.email',
  'init.defaultbranch',
  'pull.rebase'
])

/** Chaves com subseção (`remote.<nome>.url`…). `uploadpack`, `receivepack`, `proxy`, `update` e afins ficam de fora. */
const WITH_SUB: Record<string, Set<string>> = {
  remote: new Set(['url', 'fetch', 'pushurl', 'prune', 'tagopt']),
  branch: new Set(['remote', 'merge', 'rebase', 'pushremote', 'description', 'vscode-merge-base']),
  submodule: new Set(['url', 'path', 'active', 'branch'])
}

export function isAllowedGitKey(key: string): boolean {
  const { section, sub, name } = splitKey(key)
  if (sub === null) return PLAIN.has(`${section}.${name}`)
  return WITH_SUB[section]?.has(name) ?? false
}

/** Como o `.git` da raiz se apresenta (lido com lstat, sem seguir links). */
export interface GitDirShape {
  /** `.git` na raiz: ausente, pasta, arquivo (`gitdir:`), link/junction ou outro tipo. */
  dotGit: 'missing' | 'dir' | 'file' | 'link' | 'other'
  /** `.git/config` é link (ou outro tipo que não arquivo). */
  configNotFile?: boolean
  commondir?: boolean
  worktrees?: boolean
  configWorktree?: boolean
}

export interface GitConfigInput {
  shape: GitDirShape
  /** Saída de `git config --file .git/config --list -z --no-includes`; null = não deu para ler. */
  configList: string | null
  /** Conteúdo cru (para o hash). null = ausente. */
  configText: string | null
  attributesText: string | null
  /** Conteúdo do arquivo `.git` quando ele é arquivo (`gitdir: …`). */
  dotGitFileText?: string | null
  /**
   * `.gitmodules` que o git usaria (hotfix v0.6.1): ausente, arquivo comum na raiz, outro tipo (link… ou blob
   * que não deu para resolver) ou `blob` — sem o arquivo na árvore, o git lê o do index e depois o do HEAD.
   * Ausente no input = `missing`.
   */
  gitmodules?: 'missing' | 'file' | 'other' | 'blob'
  /** Saída de `git config --file|--blob … --list -z --no-includes`; null = não deu para ler. */
  gitmodulesList?: string | null
  /** Conteúdo cru do `.gitmodules` (arquivo) ou `<onde> <oid>` (blob), para o hash. */
  gitmodulesText?: string | null
}

export interface GitRiskSummary {
  isRepo: boolean
  risky: boolean
  /** Linhas para o diálogo e para a aba Alterações (já cortadas com clip). */
  reasons: string[]
  /**
   * Estrutura que o DevDeck não confere (gitdir fora, worktrees…): a confiança vale só nesta execução
   * do app e não é gravada.
   */
  sessionOnly: boolean
  hash: string
  /**
   * Nomes de submódulo vistos no `.gitmodules` e em `submodule.<nome>.*` do `.git/config`. O agente recebe
   * `submodule.<nome>.ignore=all` para cada um: `ignore` por nome vence o `diff.ignoreSubmodules=all`
   * forçado, e o git entraria no submódulo e rodaria o filtro dele (hotfix v0.6.1, ADR-018).
   */
  submodules: string[]
}

/** Teto de submódulos com `ignore` forçado no env do agente; acima disso o git pausa. */
export const MAX_SUBMODULES = 200

/** Nome de submódulo que dá para mandar por `GIT_CONFIG_KEY_n` sem ambiguidade. */
const SAFE_SUBMODULE_NAME = /^[^\u0000-\u001f\u007f]{1,255}$/

const sha = (text: string | null | undefined): string =>
  createHash('sha256')
    .update(text ?? '<ausente>')
    .digest('hex')

/** Valor do repositório é não confiável: corta no meio para mostrar começo e fim. */
export function clipMiddle(text: string, max = 60): string {
  const clean = clip(text, 10_000)
  if (clean.length <= max) return clean
  const half = Math.floor((max - 1) / 2)
  return `${clean.slice(0, half)}…${clean.slice(clean.length - half)}`
}

function describeEntry(e: GitConfigEntry, origin = '.git/config'): string {
  const { section, name } = splitKey(e.key)
  const shown = `${clip(e.key, 80)}${e.value === null ? '' : ` = "${clipMiddle(e.value)}"`}  (${origin})`
  return section === 'filter' && splitKey(e.key).sub?.toLowerCase() === 'lfs' && ['clean', 'smudge', 'process', 'required'].includes(name)
    ? `${shown} — comum em repositórios com Git LFS`
    : shown
}

export function summarizeGitConfig(input: GitConfigInput): GitRiskSummary {
  const { shape } = input
  const reasons: string[] = []
  let sessionOnly = false
  const submodules = new Set<string>()
  const gitmodules = input.gitmodules ?? 'missing'
  const parts: unknown[] = [
    ['.git', shape.dotGit, sha(input.dotGitFileText)],
    ['config', sha(input.configText)],
    ['info/attributes', sha(input.attributesText)]
  ]
  // Só entra no hash quando existe: repositório sem submódulo mantém a confiança já gravada.
  if (gitmodules !== 'missing') parts.push(['.gitmodules', gitmodules, sha(input.gitmodulesText)])
  const hash = sha(JSON.stringify(parts))

  if (shape.dotGit === 'missing') return { isRepo: false, risky: false, reasons, sessionOnly, hash, submodules: [] }

  const noteSubmodule = (e: GitConfigEntry): void => {
    const { section, sub } = splitKey(e.key)
    if (section === 'submodule' && sub !== null) submodules.add(sub)
  }

  if (gitmodules === 'other') reasons.push('O .gitmodules é um link, um tipo especial de arquivo ou não pôde ser localizado no repositório: o DevDeck não consegue conferir os submódulos.')
  else if (gitmodules === 'file' || gitmodules === 'blob') {
    const origin = gitmodules === 'file' ? '.gitmodules' : '.gitmodules no index/HEAD'
    const entries = input.gitmodulesList == null ? null : parseConfigList(input.gitmodulesList)
    if (entries === null) reasons.push(`O ${origin} não pôde ser lido pelo git: o DevDeck não consegue conferir os submódulos.`)
    else
      for (const e of entries) {
        noteSubmodule(e)
        // `ignore` diferente de `all` faz o git entrar no submódulo e rodar filtros da config dele, que o DevDeck não mostra.
        if (splitKey(e.key).name === 'ignore' && (e.value ?? '').trim().toLowerCase() !== 'all') reasons.push(`${describeEntry(e, origin)} — o git entraria no submódulo e rodaria a configuração dele`)
      }
  }

  if (shape.dotGit !== 'dir') {
    sessionOnly = true
    reasons.push(
      shape.dotGit === 'file'
        ? `A pasta .git aponta para outro lugar (${clip((input.dotGitFileText ?? '').trim(), 120) || 'gitdir'}). O DevDeck não consegue conferir essa configuração.`
        : 'O .git deste workspace é um link ou um tipo especial de arquivo. O DevDeck não consegue conferir essa configuração.'
    )
  } else {
    if (shape.configNotFile) {
      sessionOnly = true
      reasons.push('O .git/config é um link: o DevDeck não consegue conferir o conteúdo.')
    }
    if (shape.commondir || shape.worktrees || shape.configWorktree) {
      sessionOnly = true
      reasons.push('Este repositório usa worktrees ou um diretório comum (commondir): parte da configuração fica fora do que o DevDeck confere.')
    }
    if (input.configText !== null && !shape.configNotFile) {
      const entries = input.configList === null ? null : parseConfigList(input.configList)
      if (entries === null) reasons.push('O .git/config não pôde ser lido pelo git: o DevDeck não consegue conferir o conteúdo.')
      else {
        entries.forEach(noteSubmodule)
        const risky = entries.filter((e) => !isAllowedGitKey(e.key))
        // include/includeIf trazem outro arquivo, fora do hash: confiar vale só nesta execução.
        if (risky.some((e) => /^include(if)?$/.test(splitKey(e.key).section))) sessionOnly = true
        for (const e of risky.slice(0, 30)) reasons.push(describeEntry(e))
        if (risky.length > 30) reasons.push(`… e mais ${risky.length - 30} configuração(ões)`)
      }
    }
  }
  const names = [...submodules]
  if (names.length > MAX_SUBMODULES || names.some((n) => !SAFE_SUBMODULE_NAME.test(n)))
    reasons.push(`Submódulos demais ou com nome fora do padrão (${names.length}): o DevDeck não consegue impedir o git de entrar neles.`)
  return { isRepo: true, risky: reasons.length > 0, reasons, sessionOnly, hash, submodules: names.filter((n) => SAFE_SUBMODULE_NAME.test(n)).slice(0, MAX_SUBMODULES) }
}

/** Bloco do diálogo nativo de confiança. */
export function describeGitRisk(s: GitRiskSummary): string {
  if (!s.risky) return ''
  return `Configurações do git que podem executar programas:\n${s.reasons.map((r) => `  • ${r}`).join('\n')}\n`
}
