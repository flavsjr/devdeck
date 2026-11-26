import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitSignature, headBlob, inspectRepo, restoreFile, runGit, statusOf, type GitContext } from '../../src/main/gitcore'
import { agentEnv, pickGitBinary } from '../../src/main/lib/gitproc'

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

  it('config limpa com hook em .git/hooks: pausa (git do agente rodaria, H07.3); DevDeck não dispara; git puro dispara', async () => {
    makeRepo({}, '')
    const hook = join(repo, '.git', 'hooks', 'post-index-change')
    writeFileSync(hook, `#!/bin/sh\n${hookCmd('hook')}\n`, { mode: 0o755 })
    expect((await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).reasons).toEqual([expect.stringMatching(/^\.git\/hooks\/post-index-change — /)])

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

  it('repositório embutido (gitlink sem .git/modules nem .gitmodules) com filtro próprio: DevDeck não entra; git puro entra', async () => {
    // H06.4 / T38: pasta com `.git` próprio dentro do workspace, registrada no índice do pai só como
    // gitlink (modo 160000). Não há `.git/modules/sub` nem `.gitmodules`: a config do embutido fica em
    // `sub/.git/config`, fora da inspeção do pai, e é lá que mora o filtro malicioso.
    makeRepo({}, '')
    const sub = join(repo, 'sub')
    raw(['init', '-q', '-b', 'main', sub], base)
    writeFileSync(join(sub, 'b.txt'), 'embutido\n')
    raw(['add', 'b.txt'], sub)
    raw(['commit', '-q', '-m', 'embutido'], sub)
    const sha = raw(['rev-parse', 'HEAD'], sub).trim()
    raw(['update-index', '--add', '--cacheinfo', `160000,${sha},sub`])
    raw(['commit', '-q', '-m', 'gitlink'])
    expect(raw(['ls-files', '-s', 'sub'])).toMatch(/^160000 /)
    expect(existsSync(join(repo, '.git', 'modules'))).toBe(false)
    expect(existsSync(join(repo, '.gitmodules'))).toBe(false)

    raw(['config', 'filter.evil.clean', hookCmd('clean')], sub)
    raw(['config', 'filter.evil.smudge', hookCmd('smudge')], sub)
    raw(['config', 'diff.evil.textconv', hookCmd('textconv')], sub)
    writeFileSync(join(sub, '.gitattributes'), '* filter=evil diff=evil\n')
    // Mesmo conteúdo, mtime no futuro: quem olhar o embutido precisa reler b.txt pelo filtro clean.
    const future = new Date(Date.now() + 3_600_000)
    utimesSync(join(sub, 'b.txt'), future, future)

    expect((await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).risky).toBe(false)
    const st = await statusOf(ctx())
    expect(st.branch).toBe('main')
    expect(marks()).toEqual([])
    expect(st.files.filter((f) => f.path.startsWith('sub'))).toEqual([]) // o gitlink nem é olhado
    // Caminho de diff do app (gitDiff → headBlob): plumbing no pai, o objeto do embutido nem existe aqui.
    expect(await headBlob(ctx(), 'sub/b.txt')).toBe('')
    // Defesa em profundidade: mesmo um `git diff` porcelana pelo runGit (prefixo + env forçada) não entra.
    await runGit(ctx(), ['diff'])
    await runGit(ctx(), ['diff', 'HEAD'])
    expect(marks()).toEqual([])

    // Controle positivo 1: git puro no pai desce no repositório embutido e roda o filtro dele.
    raw(['status'])
    expect(marks()).toContain('clean')

    // Controle positivo 2 (o da história): `git -C sub diff` puro dispara o filtro sozinho.
    rmSync(markers, { recursive: true, force: true })
    mkdirSync(markers)
    utimesSync(join(sub, 'b.txt'), new Date(Date.now() + 7_200_000), new Date(Date.now() + 7_200_000))
    raw(['-C', sub, 'diff'])
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

  // ---------- Hotfix v0.6.1: git do agente/SDK e submódulos ----------
  // O SDK roda `git status` sozinho no início da sessão, com o env de `agentEnv` (sem `--ignore-submodules`).

  /** git como o agente roda: env de `agentEnv` com o git liberado, sem config global/sistema do usuário. */
  function agentGit(args: string[], submodules: string[]): void {
    const env = { ...agentEnv(rawEnv, process.platform, repo, true, join(base, 'no-git'), submodules), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'empty.gitconfig') }
    execFileSync(GIT!, args, { cwd: repo, env: env as NodeJS.ProcessEnv, windowsHide: true, stdio: 'ignore' })
  }
  let tick = 1
  /** mtime novo no futuro: o próximo status precisa reler o arquivo (passa pelo filtro clean). */
  const touchFuture = (file: string): void => {
    const t = new Date(Date.now() + 3_600_000 + tick++ * 60_000)
    utimesSync(file, t, t)
  }
  const resetMarks = (): void => {
    rmSync(markers, { recursive: true, force: true })
    mkdirSync(markers)
  }
  /** Repositório filho com `b.txt`, usado como submódulo. */
  function makeChild(dir: string, initArgs: string[] = []): void {
    raw(['init', '-q', '-b', 'main', ...initArgs, dir], base)
    writeFileSync(join(dir, 'b.txt'), 'filho\n')
    raw(['add', 'b.txt'], dir)
    raw(['commit', '-q', '-m', 'filho'], dir)
  }
  /** Repo com submódulo `lib` e filtro só na config do submódulo (`.git/modules/lib/config`). */
  function makeSubmoduleRepo(): string {
    const child = join(base, 'child')
    makeChild(child)
    makeRepo({}, '')
    raw(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', fwd(child), 'lib'])
    raw(['commit', '-q', '-m', 'submodulo'])
    raw(['config', 'filter.evil.clean', hookCmd('clean')], join(repo, 'lib'))
    writeFileSync(join(repo, 'lib', '.gitattributes'), '* filter=evil\n')
    return join(repo, 'lib', 'b.txt')
  }

  for (const where of ['.gitmodules', '.git/config do pai'] as const) {
    it(`submódulo com ignore=none (${where}): gate pausa, agente com ignore=all forçado não entra; sem a correção entra`, async () => {
      const file = makeSubmoduleRepo()
      if (where === '.gitmodules') {
        raw(['config', '--file', '.gitmodules', 'submodule.lib.ignore', 'none'])
        raw(['commit', '-q', '-am', 'ignore none'])
      } else raw(['config', 'submodule.lib.ignore', 'none'])
      resetMarks()

      const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
      expect(s.risky).toBe(true)
      expect(s.reasons.some((r) => r.startsWith('submodule.lib.ignore'))).toBe(true)
      expect(s.submodules).toEqual(['lib'])

      // Mesmo confiado: o git do agente (status e diff) não entra no submódulo.
      touchFuture(file)
      agentGit(['status', '--porcelain'], s.submodules)
      touchFuture(file)
      agentGit(['diff'], s.submodules)
      await statusOf(ctx())
      expect(marks()).toEqual([])

      // Controle positivo: o env da v0.6.0 (só diff.ignoreSubmodules=all) entra e roda o filtro.
      touchFuture(file)
      agentGit(['status', '--porcelain'], [])
      expect(marks()).toContain('clean')
    })
  }

  for (const where of ['só no index', 'só no HEAD'] as const) {
    it(`.gitmodules com ignore=none ${where} (fora da árvore): gate lê o blob, pausa e o agente não entra`, async () => {
      const file = makeSubmoduleRepo()
      raw(['config', '--file', '.gitmodules', 'submodule.lib.ignore', 'none'])
      raw(['add', '.gitmodules'])
      if (where === 'só no HEAD') {
        raw(['commit', '-q', '-m', 'ignore none'])
        raw(['rm', '-q', '--cached', '.gitmodules'])
      }
      rmSync(join(repo, '.gitmodules'))
      expect(existsSync(join(repo, '.gitmodules'))).toBe(false)
      resetMarks()

      const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
      expect(s.risky).toBe(true)
      expect(s.reasons.some((r) => r.startsWith('submodule.lib.ignore') && r.includes('index/HEAD'))).toBe(true)
      expect(s.submodules).toEqual(['lib'])

      touchFuture(file)
      agentGit(['status', '--porcelain'], s.submodules)
      expect(marks()).toEqual([])
      // Controle positivo: com o env da v0.6.0 o git usa o .gitmodules do index/HEAD e roda o filtro.
      touchFuture(file)
      agentGit(['status', '--porcelain'], [])
      expect(marks()).toContain('clean')
    })
  }

  it('partial clone com o blob do .gitmodules ausente: inspeção não faz lazy fetch (core.sshCommand não roda) e pausa', async () => {
    makeRepo({}, '')
    writeFileSync(join(base, 'ssh.js'), "require('fs').writeFileSync(require('path').join(process.argv[2], 'ssh'), 'x'); process.exit(1)\n")
    writeFileSync(join(repo, '.gitmodules'), '[submodule "lib"]\n\tpath = lib\n\turl = https://example.test/lib.git\n')
    raw(['add', '.gitmodules'])
    const oid = raw(['rev-parse', ':.gitmodules']).trim()
    rmSync(join(repo, '.gitmodules'))
    rmSync(join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2)))
    raw(['config', 'core.repositoryformatversion', '1'])
    raw(['config', 'extensions.partialClone', 'origin'])
    raw(['config', 'remote.origin.url', 'ssh://example.test/x.git'])
    raw(['config', 'remote.origin.promisor', 'true'])
    raw(['config', 'core.sshCommand', `"${fwd(process.execPath)}" "${fwd(join(base, 'ssh.js'))}" "${fwd(markers)}"`])
    resetMarks()

    const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
    expect(s.risky).toBe(true)
    expect(s.reasons.some((r) => r.includes('.gitmodules no index/HEAD'))).toBe(true)
    expect(marks()).toEqual([])

    // Controle positivo: git puro tenta buscar o objeto ausente e roda o core.sshCommand do repositório.
    try {
      raw(['cat-file', '-p', oid])
    } catch {
      // o fetch falha (ssh falso sai com 1)
    }
    expect(marks()).toContain('ssh')
  })

  it('repositório sem commit e sem .gitmodules: blob ausente não pausa', async () => {
    raw(['init', '-q', '-b', 'main', repo], base)
    expect(await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).toMatchObject({ isRepo: true, risky: false, submodules: [] })
  })

  it('.gitmodules sem ignore: não pausa e o agente não entra no submódulo', async () => {
    const file = makeSubmoduleRepo()
    resetMarks()
    const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
    expect(s).toMatchObject({ risky: false, submodules: ['lib'] })
    touchFuture(file)
    agentGit(['status', '--porcelain'], s.submodules)
    expect(marks()).toEqual([])
    // Controle positivo: git puro entra.
    touchFuture(file)
    raw(['status'])
    expect(marks()).toContain('clean')
  })

  it('.gitmodules alterado muda a assinatura e o hash do gate', async () => {
    makeSubmoduleRepo()
    const before = { sig: gitSignature(repo), hash: (await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))).hash }
    writeFileSync(join(repo, '.gitmodules'), `${readFileSync(join(repo, '.gitmodules'), 'utf8')}\tignore = none\n`)
    touchFuture(join(repo, '.gitmodules'))
    expect(gitSignature(repo)).not.toBe(before.sig)
    const after = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
    expect(after.hash).not.toBe(before.hash)
    expect(after.risky).toBe(true)
  })

  for (const kind of ['embutido (gitlink sem .gitmodules)', 'embutido com .git apontando para fora (gitdir:)'] as const) {
    it(`repositório ${kind}: DevDeck e agente não entram; git puro dentro dele roda o filtro`, async () => {
      makeRepo({}, '')
      const sub = join(repo, 'vendor')
      const external = join(base, 'fora', 'vendor.git')
      mkdirSync(join(base, 'fora'))
      makeChild(sub, kind.includes('gitdir') ? [`--separate-git-dir=${fwd(external)}`] : [])
      raw(['-c', 'advice.addEmbeddedRepo=false', 'add', 'vendor'])
      raw(['commit', '-q', '-m', 'embutido'])
      expect(raw(['ls-files', '-s', 'vendor']).startsWith('160000')).toBe(true)
      expect(existsSync(join(repo, '.gitmodules'))).toBe(false)
      raw(['config', 'filter.evil.clean', hookCmd('clean')], sub)
      writeFileSync(join(sub, '.gitattributes'), '* filter=evil\n')
      resetMarks()

      const s = await inspectRepo(repo, GIT!, base, join(base, 'empty.gitconfig'))
      expect(s).toMatchObject({ risky: false, submodules: [] })
      touchFuture(join(sub, 'b.txt'))
      agentGit(['status', '--porcelain'], s.submodules)
      touchFuture(join(sub, 'b.txt'))
      agentGit(['diff'], s.submodules)
      await statusOf(ctx())
      expect(await headBlob(ctx(), 'a.txt')).toBe('linha 1\n')
      expect(marks()).toEqual([])

      // Controle positivo: git puro dentro do repositório embutido roda o filtro dele.
      touchFuture(join(sub, 'b.txt'))
      raw(['status'], sub)
      expect(marks()).toContain('clean')
    })
  }

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

describe.skipIf(!GIT)('git real: endurecimento da inspeção (H07.3)', { timeout: 30_000 }, () => {
  const inspect = (opts?: { timeoutMs?: number }, binary = GIT!) => inspectRepo(repo, binary, base, join(base, 'empty.gitconfig'), process.env, opts)
  /** git como o agente roda (env do agente, git liberado). */
  function agentOut(args: string[]): string {
    const env = { ...agentEnv(rawEnv, process.platform, repo, true, join(base, 'no-git')), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'empty.gitconfig') }
    return execFileSync(GIT!, ['-c', 'user.name=QA', '-c', 'user.email=qa@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: env as NodeJS.ProcessEnv, encoding: 'utf8', windowsHide: true })
  }
  const real = (p: string): string => fwd(realpathSync.native(p)).toLowerCase()

  it('core.worktree para fora do repositório (absoluto e relativo): bloqueia; o git do agente trabalharia lá', async () => {
    const fora = join(base, 'fora')
    mkdirSync(fora)
    for (const value of [fwd(fora), '../../fora']) {
      rmSync(repo, { recursive: true, force: true })
      makeRepo({ 'core.worktree': value }, '')
      const s = await inspect()
      expect(s, value).toMatchObject({ risky: true, blocked: true })
      expect(s.reasons[0]).toContain('fora do repositório')
      // Controle positivo: o git do agente realmente usa a pasta de fora como árvore de trabalho.
      expect(real(agentOut(['rev-parse', '--show-toplevel']).trim())).toBe(real(fora))
    }
  })

  it('core.worktree numa subpasta do workspace bloqueia; na própria raiz só pede confiança', async () => {
    makeRepo({ 'core.worktree': '../src' }, '')
    mkdirSync(join(repo, 'src'))
    expect(await inspect()).toMatchObject({ blocked: true })
    raw(['config', 'core.worktree', '..'])
    const s = await inspect()
    expect(s).toMatchObject({ risky: true, blocked: false })
    expect(s.reasons).toEqual(['core.worktree = ".."  (.git/config)'])
  })

  it('core.worktree por link/junction dentro do .git que hoje dá na raiz bloqueia (o alvo poderia ser trocado depois)', async () => {
    makeRepo({}, '')
    symlinkSync(repo, join(repo, '.git', 'wt'), 'junction')
    raw(['config', 'core.worktree', 'wt'])
    const s = await inspect()
    expect(s).toMatchObject({ risky: true, blocked: true })
    expect(s.reasons[0]).toContain('outro lugar dentro dele')
  })

  it('include.path por link pendente dentro do .git bloqueia como fora do repositório', async () => {
    makeRepo({}, '')
    const alvo = join(base, 'alvo')
    mkdirSync(alvo)
    symlinkSync(alvo, join(repo, '.git', 'lnk'), 'junction')
    rmSync(alvo, { recursive: true, force: true })
    raw(['config', 'include.path', 'lnk/x.inc'])
    const s = await inspect()
    expect(s).toMatchObject({ blocked: true })
    expect(s.reasons[0]).toContain('fora do repositório')
  })

  it('include.path para arquivo do workspace ou de fora bloqueia; dentro do .git não; o git segue o include (controle)', async () => {
    makeRepo({}, '')
    writeFileSync(join(repo, 'cfg.inc'), `[core]\n\tfsmonitor = ${hookCmd('fsmonitor')}\n`)
    raw(['config', 'include.path', '../cfg.inc'])
    let s = await inspect()
    expect(s).toMatchObject({ risky: true, blocked: true })
    expect(s.reasons[0]).toContain('o agente pode editar')
    // Controle positivo: o git puro lê a chave que veio do arquivo do workspace.
    expect(raw(['config', '--get', 'core.fsmonitor'])).toContain('fsmonitor')

    writeFileSync(join(base, 'fora.inc'), '[user]\n\tname = x\n')
    raw(['config', '--unset', 'include.path'])
    raw(['config', 'includeIf.onbranch:main.path', fwd(join(base, 'fora.inc'))])
    s = await inspect()
    expect(s).toMatchObject({ blocked: true })
    expect(s.reasons[0]).toContain('fora do repositório')

    raw(['config', '--unset', 'includeIf.onbranch:main.path'])
    writeFileSync(join(repo, '.git', 'extra.inc'), '[user]\n\tname = x\n')
    raw(['config', 'include.path', 'extra.inc'])
    expect(await inspect()).toMatchObject({ risky: true, blocked: false, sessionOnly: true })
  })

  it('hook pre-commit em .git/hooks pausa e aparece; só .sample não; o git do agente rodaria o hook (controle)', async () => {
    makeRepo({}, '')
    expect(readdirSync(join(repo, '.git', 'hooks')).some((n) => n.endsWith('.sample'))).toBe(true)
    expect(await inspect()).toMatchObject({ risky: false })
    const sig = gitSignature(repo)
    const hook = join(repo, '.git', 'hooks', 'pre-commit')
    writeFileSync(hook, `#!/bin/sh\n${hookCmd('pre-commit')}\n`, { mode: 0o755 })
    expect(gitSignature(repo)).not.toBe(sig)
    const s = await inspect()
    expect(s).toMatchObject({ risky: true, blocked: false })
    expect(s.reasons.some((r) => r.startsWith('.git/hooks/pre-commit'))).toBe(true)
    // Editar o hook no lugar muda assinatura e hash.
    const before = { sig: gitSignature(repo), hash: s.hash }
    writeFileSync(hook, `#!/bin/sh\n${hookCmd('pre-commit')} # outro\n`)
    expect(gitSignature(repo)).not.toBe(before.sig)
    expect((await inspect()).hash).not.toBe(before.hash)

    // Controle positivo: com o git liberado, o commit do agente roda o hook do repositório.
    writeFileSync(join(repo, 'a.txt'), 'linha 2\n')
    agentOut(['commit', '-q', '-am', 'agente'])
    expect(marks()).toContain('pre-commit')
  })

  it('inspeção que passa do tempo limite termina, pausa com motivo e fica incompleta; com tempo folgado não (controle)', async () => {
    makeRepo({}, '')
    // node como "git": nunca termina em 1 ms, então o execFile mata pelo tempo limite.
    const t0 = Date.now()
    const slow = await inspect({ timeoutMs: 1 }, process.execPath)
    expect(Date.now() - t0).toBeLessThan(10_000)
    expect(slow).toMatchObject({ risky: true, incomplete: true, sessionOnly: true })
    expect(slow.reasons.some((r) => r.includes('tempo limite'))).toBe(true)
    // Controle: o mesmo binário com tempo folgado falha por outro motivo, sem marcar tempo esgotado.
    const fast = await inspect({ timeoutMs: 10_000 }, process.execPath)
    expect(fast).toMatchObject({ risky: true, incomplete: false })
    expect(fast.reasons.some((r) => r.includes('tempo limite'))).toBe(false)
    // E com o git real e tempo padrão, o repositório limpo passa.
    expect(await inspect()).toMatchObject({ risky: false, incomplete: false })
  })
})
