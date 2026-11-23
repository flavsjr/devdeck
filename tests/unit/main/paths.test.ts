import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalSegment, classifyEditPath, isInsideRoot, isSensitiveRel } from '../../../src/main/lib/paths'

const W = path.win32
const P = path.posix

describe('isInsideRoot', () => {
  it('Windows: dentro, fora, ".." e outra unidade', () => {
    expect(isInsideRoot('C:\\repo', 'C:\\repo\\src\\a.ts', W)).toBe(true)
    expect(isInsideRoot('C:\\repo', 'C:\\repo', W)).toBe(true)
    expect(isInsideRoot('C:\\repo', 'C:\\repo-evil\\a.ts', W)).toBe(false)
    expect(isInsideRoot('C:\\repo', 'C:\\Users\\dev\\.bashrc', W)).toBe(false)
    expect(isInsideRoot('C:\\repo', 'D:\\repo\\a.ts', W)).toBe(false)
  })
  it('Windows ignora maiúsculas', () => {
    expect(isInsideRoot('C:\\Repo', 'c:\\repo\\SRC\\a.ts', W)).toBe(true)
  })
  it('POSIX diferencia maiúsculas', () => {
    expect(isInsideRoot('/home/dev/repo', '/home/dev/repo/src/a.ts', P)).toBe(true)
    expect(isInsideRoot('/home/dev/repo', '/home/dev/Repo/src/a.ts', P)).toBe(false)
    expect(isInsideRoot('/home/dev/repo', '/etc/passwd', P)).toBe(false)
  })
})

describe('isSensitiveRel', () => {
  it('pastas que executam código', () => {
    for (const rel of ['.git/hooks/pre-commit', '.claude/settings.json', '.vscode/tasks.json', '.GitHub/workflows/ci.yml', 'pkg/.husky/pre-push']) {
      expect(isSensitiveRel(rel)).toBe(true)
    }
  })
  it('código comum não é sensível', () => {
    expect(isSensitiveRel('src/main/index.ts')).toBe(false)
    expect(isSensitiveRel('docs/.gitkeep')).toBe(false)
    expect(isSensitiveRel('src/.github-helpers/x.ts')).toBe(false)
  })
  it('variações do Windows que apontam para a mesma pasta', () => {
    for (const rel of ['.git.\\hooks\\pre-commit', '.git \\hooks\\pre-commit', '.git. .\\hooks\\x', '.git::$INDEX_ALLOCATION\\hooks\\x', '.CLAUDE.\\settings.json']) {
      expect(isSensitiveRel(rel), rel).toBe(true)
    }
  })
})

describe('canonicalSegment', () => {
  it('remove fluxo NTFS, pontos/espaços finais e maiúsculas', () => {
    expect(canonicalSegment('.Git. ')).toBe('.git')
    expect(canonicalSegment('.git::$INDEX_ALLOCATION')).toBe('.git')
    expect(canonicalSegment('arquivo.ts')).toBe('arquivo.ts')
  })
})

describe('classifyEditPath', () => {
  it('inside, sensitive e outside', () => {
    expect(classifyEditPath('C:\\repo', 'C:\\repo\\src\\a.ts', W)).toBe('inside')
    expect(classifyEditPath('C:\\repo', 'C:\\repo\\.Git\\hooks\\post-checkout', W)).toBe('sensitive')
    expect(classifyEditPath('C:\\repo', 'C:\\Users\\dev\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\x.bat', W)).toBe('outside')
  })
  it('symlink resolvido para fora do workspace vira outside', () => {
    // Quem chama passa o realpath: um link repo/docs → /etc resolve para /etc/...
    expect(classifyEditPath('/home/dev/repo', '/etc/cron.d/job', P)).toBe('outside')
  })
})
