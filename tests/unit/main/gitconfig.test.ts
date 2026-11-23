import { describe, expect, it } from 'vitest'
import { clipMiddle, describeGitRisk, isAllowedGitKey, parseConfigList, splitKey, summarizeGitConfig, type GitConfigInput } from '../../../src/main/lib/gitconfig'

const z = (...entries: string[]): string => entries.map((e) => `${e}\0`).join('')

const CLEAN = z('core.repositoryformatversion\n0', 'core.filemode\nfalse', 'core.bare\nfalse', 'core.logallrefupdates\ntrue', 'core.symlinks\nfalse', 'core.ignorecase\ntrue', 'remote.origin.url\nhttps://github.com/x/y.git', 'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*', 'branch.main.remote\norigin', 'branch.main.merge\nrefs/heads/main')

const input = (over: Partial<GitConfigInput> = {}): GitConfigInput => ({
  shape: { dotGit: 'dir' },
  configList: CLEAN,
  configText: '[core]\n\tbare = false\n',
  attributesText: null,
  ...over
})

describe('parseConfigList', () => {
  it('chave com e sem valor, valor com quebra de linha', () => {
    expect(parseConfigList(z('core.bare\nfalse', 'core.fsmonitor', 'alias.x\na\nb'))).toEqual([
      { key: 'core.bare', value: 'false' },
      { key: 'core.fsmonitor', value: null },
      { key: 'alias.x', value: 'a\nb' }
    ])
  })
  it('subseção com pontos e espaços', () => {
    expect(parseConfigList(z('diff.my diff.v2.textconv\ncat'))?.[0].key).toBe('diff.my diff.v2.textconv')
  })
  it('vazia é lista vazia; formato quebrado é null (falha fechada)', () => {
    expect(parseConfigList('')).toEqual([])
    expect(parseConfigList('core.bare\nfalse')).toBeNull()
    expect(parseConfigList(z('semponto\nx'))).toBeNull()
    expect(parseConfigList(z('core.1nome\nx'))).toBeNull()
  })
})

describe('splitKey / isAllowedGitKey', () => {
  it('seção e nome sem diferenciar maiúsculas; subseção como veio', () => {
    expect(splitKey('Remote.Origin.URL')).toEqual({ section: 'remote', sub: 'Origin', name: 'url' })
    expect(isAllowedGitKey('CORE.Bare')).toBe(true)
    expect(isAllowedGitKey('Core.FsMonitor')).toBe(false)
  })
  it('chaves comuns de `git init`/`clone` passam', () => {
    for (const k of ['core.repositoryformatversion', 'core.autocrlf', 'user.email', 'init.defaultBranch', 'pull.rebase', 'remote.up.pushurl', 'branch.feat/x.vscode-merge-base', 'submodule.lib.url'])
      expect(isAllowedGitKey(k)).toBe(true)
  })
  it('chaves que executam programa, mudam caminho ou rede pedem confiança', () => {
    for (const k of [
      'core.fsmonitor',
      'core.hooksPath',
      'core.pager',
      'core.editor',
      'core.sshCommand',
      'core.gitProxy',
      'core.askPass',
      'core.worktree',
      'core.attributesFile',
      'filter.lfs.process',
      'filter.evil.clean',
      'diff.x.textconv',
      'diff.external',
      'merge.x.driver',
      'credential.helper',
      'include.path',
      'includeIf.gitdir:~/x.path',
      'alias.st',
      'pager.log',
      'remote.origin.uploadpack',
      'remote.origin.proxy',
      'submodule.lib.update',
      'url.https://evil/.insteadOf',
      'extensions.worktreeConfig',
      'lfs.url',
      'gpg.program',
      'sequence.editor',
      'http.proxy',
      'protocol.ext.allow'
    ])
      expect(isAllowedGitKey(k), k).toBe(false)
  })
})

describe('summarizeGitConfig', () => {
  it('sem .git: não é repo nem arriscado', () => {
    expect(summarizeGitConfig(input({ shape: { dotGit: 'missing' } }))).toMatchObject({ isRepo: false, risky: false })
  })
  it('config de clone comum: limpo', () => {
    expect(summarizeGitConfig(input())).toMatchObject({ isRepo: true, risky: false, reasons: [] })
  })
  it('fsmonitor: arriscado, mostra chave, valor e origem', () => {
    const s = summarizeGitConfig(input({ configList: CLEAN + z('core.fsmonitor\nnode .hooks/watch.js') }))
    expect(s.risky).toBe(true)
    expect(s.sessionOnly).toBe(false)
    expect(s.reasons).toEqual(['core.fsmonitor = "node .hooks/watch.js"  (.git/config)'])
    expect(describeGitRisk(s)).toContain('podem executar programas')
  })
  it('LFS ganha pista sem deixar de pedir confiança', () => {
    const s = summarizeGitConfig(input({ configList: z('filter.lfs.process\ngit-lfs filter-process') }))
    expect(s.risky).toBe(true)
    expect(s.reasons[0]).toContain('comum em repositórios com Git LFS')
  })
  it('saída ilegível do git: arriscado', () => {
    expect(summarizeGitConfig(input({ configList: null })).risky).toBe(true)
    expect(summarizeGitConfig(input({ configList: 'lixo' })).risky).toBe(true)
  })
  it('.git como arquivo gitdir:, link ou outro tipo: arriscado e confiança só nesta execução', () => {
    for (const dotGit of ['file', 'link', 'other'] as const) {
      const s = summarizeGitConfig(input({ shape: { dotGit }, configText: null, configList: null, dotGitFileText: 'gitdir: C:/fora/.git' }))
      expect(s, dotGit).toMatchObject({ isRepo: true, risky: true, sessionOnly: true })
    }
    expect(summarizeGitConfig(input({ shape: { dotGit: 'file' }, dotGitFileText: 'gitdir: ../fora' })).reasons[0]).toContain('gitdir: ../fora')
  })
  it('commondir, worktrees/, config.worktree e config como link: arriscado, só nesta execução', () => {
    for (const extra of [{ commondir: true }, { worktrees: true }, { configWorktree: true }, { configNotFile: true }]) {
      expect(summarizeGitConfig(input({ shape: { dotGit: 'dir', ...extra } })), JSON.stringify(extra)).toMatchObject({ risky: true, sessionOnly: true })
    }
  })
  it('hash muda com config, info/attributes e conteúdo do gitdir', () => {
    const base = summarizeGitConfig(input()).hash
    expect(summarizeGitConfig(input({ configText: '[core]\n\tbare = true\n' })).hash).not.toBe(base)
    expect(summarizeGitConfig(input({ attributesText: '* filter=x' })).hash).not.toBe(base)
    expect(summarizeGitConfig(input()).hash).toBe(base)
    const a = summarizeGitConfig(input({ shape: { dotGit: 'file' }, dotGitFileText: 'gitdir: a' })).hash
    expect(summarizeGitConfig(input({ shape: { dotGit: 'file' }, dotGitFileText: 'gitdir: b' })).hash).not.toBe(a)
  })
  it('muitas chaves arriscadas: lista cortada', () => {
    const many = z(...Array.from({ length: 40 }, (_, i) => `alias.a${i}\n!x`))
    const s = summarizeGitConfig(input({ configList: many }))
    expect(s.reasons).toHaveLength(31)
    expect(s.reasons[30]).toContain('mais 10')
  })
})

describe('clipMiddle', () => {
  it('corta no meio e tira caracteres de controle/bidi', () => {
    expect(clipMiddle('a'.repeat(30) + 'MEIO' + 'b'.repeat(30), 21)).toBe(`${'a'.repeat(10)}…${'b'.repeat(10)}`)
    expect(clipMiddle('ok\u202esim')).toBe('ok sim')
  })
})
