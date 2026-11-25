import { describe, expect, it } from 'vitest'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import { ALWAYS_ASK_TOOLS, DISALLOWED_TOOLS, alwaysAskHooks, askOutputFor, forceAskHook } from '../../../src/main/lib/askHook'

const signal = new AbortController().signal
const preToolUse = (tool_name: string, tool_input: unknown): HookInput =>
  ({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 't1', session_id: 's', transcript_path: '', cwd: '' }) as HookInput

describe('hook que força aprovação de comando (ADR-022)', () => {
  it('Bash e PowerShell sempre viram ask, inclusive comando só-leitura', async () => {
    for (const tool of ['Bash', 'PowerShell']) {
      const out = await forceAskHook(preToolUse(tool, { command: 'git status' }), 't1', { signal })
      expect(out).toEqual({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: expect.any(String) }
      })
    }
  })

  it('outras tools seguem o fluxo normal (Read não ganha card)', () => {
    expect(askOutputFor('Read')).toEqual({})
    expect(askOutputFor('Edit')).toEqual({})
    expect(askOutputFor('mcp__srv__run')).toEqual({})
    expect(askOutputFor('bash')).toEqual({}) // nome exato, como o Claude Code manda
  })

  it('evento diferente de PreToolUse não decide nada', async () => {
    const other = { hook_event_name: 'PostToolUse', tool_name: 'Bash' } as unknown as HookInput
    expect(await forceAskHook(other, undefined, { signal })).toEqual({})
  })

  it('Monitor (comando em segundo plano) fica fora da sessão', () => {
    expect(DISALLOWED_TOOLS).toContain('Monitor')
    for (const t of DISALLOWED_TOOLS) expect(ALWAYS_ASK_TOOLS.has(t)).toBe(false)
  })

  it('matcher cobre exatamente as tools da lista e falha fecha', () => {
    const [m] = alwaysAskHooks().PreToolUse ?? []
    expect(m.onFailure).toBe('block')
    expect(m.hooks).toEqual([forceAskHook])
    const re = new RegExp(`^(?:${m.matcher})$`)
    for (const t of ALWAYS_ASK_TOOLS) expect(re.test(t)).toBe(true)
    expect(re.test('Read')).toBe(false)
  })
})
