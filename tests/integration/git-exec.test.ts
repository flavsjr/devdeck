import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { headBlob, inspectRepo, restoreFile, runGit, statusOf, type GitContext } from '../../src/main/gitcore'
import { pickGitBinary } from '../../src/main/lib/gitproc'

// H05.1 / B3 com git real: nenhum comando configurado no repositório roda pelo DevDeck sem confiança,
// e hooks/fsmonitor não rodam nem com confiança. Controle positivo: o mesmo fixture com git puro
// cria o marcador — sem isso um teste que passa não provaria nada.

const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}
const GIT = pickGitBinary(process.env.PATH ?? process.env.Path, process.platform, null, isFile)
const fwd = (p: string): string => p.replace(/\\/g, '/')

let base: string
let repo: string
let markers: string
let hooksEmpty: string
let rawEnv: Record<string, string | undefined>

/** git "puro" do fixture: sem config global/sistema do usuário, sem GIT_* herdado. */
function raw(args: string[], cwd = repo): string {
  return execFileSync(GIT!, ['-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, env: rawEnv as NodeJS.ProcessEnv, encoding: 'utf8', windowsHide: true })
}

const marks = (): string[] => (existsSync(markers) ? readdirSync(markers).sort() : [])

function hookCmd(kind: string): string {
  return `"${fwd(process.execPath)}" "${fwd(join(base, 'hook.js'))}" ${kind} "${fwd(markers)}"`
}

/** Repositório com um commit (`a.txt`) e as chaves maliciosas pedidas. */
function makeRepo(config: Record<string, string>, attributes = '* filter=evil diff=evil\n'): void {
  raw(['init', '-q', '-b', 'main', repo], base)
  writeFileSync(join(repo, 'a.txt'), 'linha 1\n')
  raw(['add', 'a.txt'])
  raw(['commit', '-q', '-m', 'inicial'])
  writeFileSync(join(repo, '.gitattributes'), attributes)
  for (const [k, v] of Object.entries(config)) raw(['config', k, v])
}

/** Mesmo conteúdo, mtime no futuro: o status precisa reler o arquivo (passa pelo filtro clean). */
const makeRacy = (): void => utimesSync(join(repo, 'a.txt'), new Date(Date.now() + 3_600_000), new Date(Date.now() + 3_600_000))

const ctx = (): GitContext => ({ root: repo, binary: GIT!, hooksDir: hooksEmpty })

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'devdeck-git-'))
  repo = join(base, 'repo')
  markers = join(base, 'markers')
  hooksEmpty = join(base, 'empty-hooks')
  mkdirSync(markers)
  mkdirSync(hooksEmpty)
  writeFileSync(
    join(base, 'hook.js'),
    "const fs = require('fs'); const path = require('path'); fs.writeFileSync(path.join(process.argv[3], process.argv[2]), 'x'); process.stdin.on('error', () => {}); process.stdin.pipe(process.stdout)\n"
  )
  writeFileSync(join(base, 'empty.gitconfig'), '')
  rawEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)))
  rawEnv.GIT_CONFIG_NOSYSTEM = '1'
  rawEnv.GIT_CONFIG_GLOBAL = join(base, 'empty.gitconfig')
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

// No CI o git é obrigatório: pular em silêncio esconderia a regressão do B3.
if (process.env.CI && !GIT) throw new Error('git não encontrado no PATH do CI: o teste de integração do B3 não pode ser pulado.')

describe.skipIf(!GIT)('git real (H05.1)', { timeout: 30_000 }, () => {
  it('repositório com fsmonitor, filtros, textconv, diff.external e hooksPath: inspeção não executa nada e marca arriscado', async () => {
    const evilHooks = join(base, 'evil-hooks')
    mkdirSync(evilHooks)
    writeFileSync(join(evilHooks, 'post-index-change'), `#!/bin/sh\n${hookCmd('hook')}\n`, { mode: 0o755 })
    makeRepo({
      'core.fsmonitor': hookCmd('fsmonitor'),
      'filter.evil.clean': hookCmd('clean'),
      'filter.evil.smudge': hookCmd('smudge'),
      'diff.evil.textconv': hookCmd('textconv'),
      'diff.external': hookCmd('external'),
      'core.hooksPath': fwd(evilHooks)
    })
    makeRacy()
    rmSync(markers, { recursive: true, force: true })
    mkdirSync(markers)

    const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
    expect(s.risky).toBe(true)
    const keys = s.reasons.map((r) => r.split(' ')[0])
    expect(keys).toEqual(expect.arrayContaining(['core.fsmonitor', 'filter.evil.clean', 'filter.evil.smudge', 'diff.evil.textconv', 'diff.external', 'core.hookspath']))
    expect(marks()).toEqual([])

    // Controle positivo: git puro no mesmo fixture executa os comandos do repositório.
    raw(['status'])
    writeFileSync(join(repo, 'a.txt'), 'linha 1\nlinha 2\n')
    raw(['diff'])
    raw(['diff', '--no-ext-diff'])
    raw(['restore', 'a.txt'])
    expect(marks()).toEqual(expect.arrayContaining(['clean', 'external', 'fsmonitor', 'textconv']))
  })

  it('confiado: filtro do usuário roda (controle positivo do DevDeck), mas fsmonitor e hooks nunca', async () => {
    const evilHooks = join(base, 'evil-hooks')
    mkdirSync(evilHooks)
    writeFileSync(join(evilHooks, 'post-index-change'), `#!/bin/sh\n${hookCmd('hook')}\n`, { mode: 0o755 })
    makeRepo({ 'core.fsmonitor': hookCmd('fsmonitor'), 'filter.evil.clean': hookCmd('clean'), 'diff.evil.textconv': hookCmd('textconv'), 'core.hooksPath': fwd(evilHooks) })
    makeRacy()
    rmSync(markers, { recursive: true, force: true })
    mkdirSync(markers)

    const st = await statusOf(ctx())
    expect(st.branch).toBe('main')
    expect(marks()).toContain('clean')
    expect(marks()).not.toContain('fsmonitor')
    expect(marks()).not.toContain('hook')
  })

  it('conteúdo do HEAD por cat-file: sem textconv nem filtro, mesmo confiado', async () => {
    makeRepo({ 'diff.evil.textconv': hookCmd('textconv'), 'filter.evil.smudge': hookCmd('smudge') })
    writeFileSync(join(repo, 'a.txt'), 'linha 1\nlinha 2\n')
    expect(await headBlob(ctx(), 'a.txt')).toBe('linha 1\n')
    expect(await headBlob(ctx(), 'nao-existe.txt')).toBe('')
    expect(marks()).toEqual([])
  })

  it('config limpa com hook em .git/hooks: DevDeck não dispara; git puro dispara', async () => {
    makeRepo({}, '')
    const hook = join(repo, '.git', 'hooks', 'post-index-change')
    writeFileSync(hook, `#!/bin/sh\n${hookCmd('hook')}\n`, { mode: 0o755 })
    expect((await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).risky).toBe(false)

    writeFileSync(join(repo, 'a.txt'), 'mudou\n')
    await restoreFile(ctx(), 'a.txt')
    expect(marks()).toEqual([])

    writeFileSync(join(repo, 'a.txt'), 'mudou de novo\n')
    raw(['restore', 'a.txt'])
    expect(marks()).toContain('hook')
  })

  it('submódulo com filtro próprio: config do pai limpa, DevDeck não entra no submódulo; git puro entra', async () => {
    // Repositório filho com um arquivo, usado como submódulo do repo principal.
    const child = join(base, 'child')
    raw(['init', '-q', '-b', 'main', child], base)
    writeFileSync(join(child, 'b.txt'), 'filho\n')
    raw(['add', 'b.txt'], child)
    raw(['commit', '-q', '-m', 'filho'], child)
    makeRepo({}, '')
    raw(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', fwd(child), 'lib'])
    raw(['commit', '-q', '-m', 'submodulo'])
    // O filtro mora só na config do submódulo (.git/modules/lib/config), fora da inspeção do pai.
    raw(['config', 'filter.evil.clean', hookCmd('clean')], join(repo, 'lib'))
    writeFileSync(join(repo, 'lib', '.gitattributes'), '* filter=evil\n')
    const future = new Date(Date.now() + 3_600_000)
    utimesSync(join(repo, 'lib', 'b.txt'), future, future)

    expect((await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).risky).toBe(false)
    const st = await statusOf(ctx())
    expect(st.branch).toBe('main')
    expect(marks()).toEqual([])

    // Controle positivo: git puro no repo principal entra no submódulo e roda o filtro.
    raw(['status'])
    expect(marks()).toContain('clean')
  })

  it('GIT_DIR e GIT_CONFIG_PARAMETERS herdados não vazam para o git do DevDeck', async () => {
    makeRepo({}, '')
    const other = join(base, 'outro')
    raw(['init', '-q', '-b', 'outra', other], base)
    const leaky: GitContext = { ...ctx(), env: { ...process.env, GIT_DIR: join(other, '.git'), GIT_CONFIG_PARAMETERS: `'core.fsmonitor=${hookCmd('fsmonitor')}'` } }
    const st = await statusOf(leaky)
    expect(st.branch).toBe('main')
    expect(marks()).toEqual([])
    expect((await runGit(leaky, ['rev-parse', '--show-toplevel'])).toString('utf8').trim().toLowerCase()).toBe(fwd(realpathSync.native(repo)).toLowerCase()) // caminho longo (o tmp do CI vem em 8.3)
  })

  it('git.exe plantado na raiz do workspace nunca é o escolhido', () => {
    makeRepo({}, '')
    const planted = join(repo, process.platform === 'win32' ? 'git.exe' : 'git')
    writeFileSync(planted, 'falso')
    const path = [repo, ...(process.env.PATH ?? process.env.Path ?? '').split(process.platform === 'win32' ? ';' : ':')].join(process.platform === 'win32' ? ';' : ':')
    const bin = pickGitBinary(path, process.platform, repo, isFile)
    expect(bin).not.toBeNull()
    expect(bin!.toLowerCase().startsWith(repo.toLowerCase())).toBe(false)
  })

  it('.git como arquivo gitdir: é arriscado sem rodar git', async () => {
    makeRepo({}, '')
    const real = join(base, 'fora.git')
    raw(['init', '-q', '--bare', real], base)
    const wt = join(base, 'wt')
    mkdirSync(wt)
    writeFileSync(join(wt, '.git'), `gitdir: ${fwd(real)}\n`)
    const s = await inspectRepo(wt, GIT!, base, join(base, 'empty.gitconfig'))
    expect(s).toMatchObject({ isRepo: true, risky: true, sessionOnly: true })
  })
})
