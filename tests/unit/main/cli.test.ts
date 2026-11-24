import { describe, expect, it } from 'vitest'
import { hasDebugSwitch } from '../../../src/main/lib/cli'

describe('hasDebugSwitch (H05.2)', () => {
  it('depurador remoto, inspetor e js-flags são recusados', () => {
    for (const a of ['--remote-debugging-port=9222', '--remote-debugging-pipe', '--REMOTE-DEBUGGING-PORT=1', '--inspect', '--inspect=9229', '--inspect-brk', '--inspect-port=1', '--remote-allow-origins=*', '--js-flags=--allow-natives-syntax'])
      expect(hasDebugSwitch(['DevDeck.exe', a]), a).toBe(true)
  })
  it('prefixos - e / do Windows também', () => {
    for (const a of ['-remote-debugging-port=9222', '/remote-debugging-port=9222', '/inspect', '-js-flags=x']) expect(hasDebugSwitch(['DevDeck.exe', a]), a).toBe(true)
  })
  it('argumentos normais passam', () => {
    expect(hasDebugSwitch(['DevDeck.exe'])).toBe(false)
    expect(hasDebugSwitch(['DevDeck.exe', 'C:\pasta\--inspect-me', '--inspector', '--lang=pt-BR'])).toBe(false)
  })
})
