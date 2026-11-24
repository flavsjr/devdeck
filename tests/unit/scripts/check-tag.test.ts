import { describe, expect, it } from 'vitest'
import { checkTag } from '../../../scripts/check-tag.mjs'

describe('checkTag (H05.3)', () => {
  it('tag igual à versão passa', () => {
    expect(checkTag('v0.5.0', '0.5.0')).toBeNull()
    expect(checkTag('v1.2.3-rc.1', '1.2.3-rc.1')).toBeNull()
  })
  it('tag diferente da versão falha', () => {
    expect(checkTag('v0.5.1', '0.5.0')).toContain('esperado "v0.5.0"')
    expect(checkTag('v0.5.0-rc1', '0.5.0')).toContain('não bate')
  })
  it('formato inválido falha', () => {
    for (const t of ['0.5.0', 'v0.5', 'v0.5.0 ', 'v0.5.0;rm -rf', 'release-0.5.0', '']) expect(checkTag(t, '0.5.0'), t).toContain('fora do formato')
  })
})
