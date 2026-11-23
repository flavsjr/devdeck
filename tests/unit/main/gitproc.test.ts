import { describe, expect, it } from 'vitest'
import { agentEnv, gitArgs, gitEnv, inspectArgs, inspectEnv, parseStatusZ, pickGitBinary, safePathEntries } from '../../../src/main/lib/gitproc'

describe('pickGitBinary / safePathEntries (git plantado no workspace)', () => {
  const root = 'C:\\repo'
  it('Windows: ignora entradas relativas e dentro do workspace', () => {
    const PATH = ['.', 'bin', 'C:\\repo', 'C:\\repo\\tools', '"C:\\Program Files\\Git\\cmd"', 'C:\\Windows'].join(';')
    expect(safePathEntries(PATH, 'win32', root)).toEqual(['C:\\Program Files\\Git\\cmd', 'C:\\Windows'])
    const found = pickGitBinary(PATH, 'win32', root, (p) => p.toLowerCase().endsWith('git.exe'))
    expect(found).toBe('C:\\Program Files\\Git\\cmd\\git.exe')
  })
  it('Windows: comparação sem diferenciar maiúsculas', () => {
    expect(safePathEntries('c:\\REPO\\x;D:\\git', 'win32', root)).toEqual(['D:\\git'])
  })
  it('POSIX: mesmo prefixo não é "dentro"', () => {
    expect(safePathEntries('/home/u/repo:/home/u/repo2:/usr/bin', 'linux', '/home/u/repo')).toEqual(['/home/u/repo2', '/usr/bin'])
  })
  it('sem git no PATH: null', () => {
    expect(pickGitBinary('/usr/bin', 'linux', null, () => false)).toBeNull()
    expect(pickGitBinary(undefined, 'linux', null, () => true)).toBeNull()
  })
})

describe('gitEnv / inspectEnv / agentEnv', () => {
  const base = {
    Path: 'C:\\Windows;.;C:\\repo\\bin',
    SystemRoot: 'C:\\Windows',
    USERPROFILE: 'C:\\Users\\u',
    GIT_DIR: 'C:\\outro\\.git',
    GIT_CONFIG_PARAMETERS: "'core.fsmonitor=evil'",
    NODE_OPTIONS: '--require x',
    HTTPS_PROXY: 'http://evil',
    ANTHROPIC_API_KEY: 'k'
  }
  it('git recebe só a lista de permitidas e GIT_* do próprio DevDeck', () => {
    const env = gitEnv(base, 'win32', 'C:\\repo')
    expect(env).toEqual({
      PATH: 'C:\\Windows',
      SYSTEMROOT: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\u',
      GIT_DIR: 'C:\\repo\\.git',
      GIT_WORK_TREE: 'C:\\repo',
      GIT_CEILING_DIRECTORIES: 'C:\\',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_LAZY_FETCH: '1',
      GIT_OPTIONAL_LOCKS: '0'
    })
  })
  it('inspeção ignora config global e de sistema', () => {
    const env = inspectEnv(base, 'linux', '/dev/null')
    expect(env).toMatchObject({ GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' })
    expect(Object.keys(env).some((k) => k === 'GIT_DIR' || k === 'NODE_OPTIONS')).toBe(false)
    expect(inspectArgs('/r/.git/config')).toEqual(['config', '--file', '/r/.git/config', '--list', '-z', '--no-includes'])
  })
  it('agente: sem GIT_* herdado; git pausado → GIT_DIR inexistente e teto no pai', () => {
    const ok = agentEnv(base, 'win32', 'C:\\w\\repo', true, 'C:\\app\\no-git')
    expect(Object.keys(ok).filter((k) => /^GIT_/i.test(k))).toEqual([])
    expect(ok.ANTHROPIC_API_KEY).toBe('k')
    const paused = agentEnv(base, 'win32', 'C:\\w\\repo', false, 'C:\\app\\no-git')
    expect(paused).toMatchObject({ GIT_DIR: 'C:\\app\\no-git', GIT_CEILING_DIRECTORIES: 'C:\\w' })
    expect(paused.GIT_CONFIG_PARAMETERS).toBeUndefined()
  })
})

describe('gitArgs', () => {
  it('prefixo fixo vem antes do subcomando', () => {
    expect(gitArgs('/app/empty-hooks', ['status'])).toEqual(['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/app/empty-hooks', '-c', 'protocol.allow=never', 'status'])
  })
})

describe('parseStatusZ', () => {
  it('branch, modificado, novo, renomeado e não rastreado', () => {
    const out = ['## main...origin/main [ahead 1]', ' M src/a.ts', 'A  novo.ts', 'R  depois.ts', 'antes.ts', '?? solto/', 'MM ambos.ts', ''].join('\0')
    expect(parseStatusZ(out)).toEqual({
      branch: 'main',
      files: [
        { path: 'src/a.ts', status: 'M' },
        { path: 'novo.ts', status: 'A' },
        { path: 'depois.ts', status: 'R' },
        { path: 'solto/', status: '??' },
        { path: 'ambos.ts', status: 'MM' }
      ]
    })
  })
  it('repositório sem commit e HEAD destacado', () => {
    expect(parseStatusZ('## No commits yet on main\0').branch).toBe('main')
    expect(parseStatusZ('## HEAD (no branch)\0').branch).toBeUndefined()
    expect(parseStatusZ('## feat/x\0').branch).toBe('feat/x')
  })
  it('caminho com espaço e acento passa inteiro', () => {
    expect(parseStatusZ('?? pasta nova/ação.txt\0').files[0].path).toBe('pasta nova/ação.txt')
  })
})
