import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'
import {
  AGENT_TOOLS,
  ALLOWED_MCP_SOURCES,
  ALWAYS_ASK_TOOLS,
  DISALLOWED_TOOLS,
  agentHooks,
  agentPolicyHook,
  agentToolOptions,
  askOutputFor,
  policyFor
} from '../../../src/main/lib/agentPolicy'

const signal = new AbortController().signal
const preToolUse = (tool_name: string, tool_input: unknown, mcp_server?: { name: string; source: string }): HookInput =>
  ({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 't1', session_id: 's', transcript_path: '', cwd: '', mcp_server }) as HookInput
const decisao = (out: unknown): string | undefined =>
  (out as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision

describe('comando sempre pede aprovação (ADR-022)', () => {
  it('Bash e PowerShell viram ask, inclusive comando só-leitura', async () => {
    for (const tool of ['Bash', 'PowerShell']) {
      const out = await agentPolicyHook(preToolUse(tool, { command: 'git status' }), 't1', { signal })
      expect(out).toEqual({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: expect.any(String) }
      })
    }
  })

  it('tools da lista sem comando seguem o fluxo normal (Read não ganha card)', () => {
    for (const t of ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'WebSearch', 'Task', 'Agent']) expect(policyFor({ tool_name: t })).toEqual({})
    expect(askOutputFor('bash')).toEqual({}) // nome exato, como o Claude Code manda
  })

  it('evento diferente de PreToolUse não decide nada', async () => {
    const other = { hook_event_name: 'PostToolUse', tool_name: 'RemoteTrigger' } as unknown as HookInput
    expect(await agentPolicyHook(other, undefined, { signal })).toEqual({})
  })
})

describe('lista branca de tools (H06.10)', () => {
  it('lista exata: só o que o card de aprovação sabe mostrar', () => {
    expect([...AGENT_TOOLS].sort()).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'NotebookEdit', 'PowerShell', 'Read', 'Task', 'WebSearch', 'Write'])
  })

  it('toda tool de comando da lista passa pelo hook de ask', () => {
    for (const t of AGENT_TOOLS) if (/^(Bash|PowerShell)$/.test(t)) expect(ALWAYS_ASK_TOOLS.has(t)).toBe(true)
    for (const t of ALWAYS_ASK_TOOLS) expect(AGENT_TOOLS).toContain(t)
  })

  it('tool fora da lista é negada em tempo de execução, mesmo se o SDK oferecer', () => {
    for (const t of ['Monitor', 'RemoteTrigger', 'PublishPlugin', 'ShareOnboardingGuide', 'CronCreate', 'Workflow', 'EnterWorktree', 'SendMessage', 'PushNotification', 'Skill', 'AskUserQuestion', 'bash', 'Ferramenta']) {
      expect(decisao(policyFor({ tool_name: t })), t).toBe('deny')
    }
  })

  it('Monitor continua em disallowedTools e fora da lista', () => {
    expect(DISALLOWED_TOOLS).toContain('Monitor')
    for (const t of DISALLOWED_TOOLS) expect(AGENT_TOOLS).not.toContain(t)
  })
})

describe('origem dos servidores MCP (H06.10)', () => {
  it('aceita servidor do DevDeck (dynamic) e .mcp.json confiado (project)', () => {
    expect([...ALLOWED_MCP_SOURCES].sort()).toEqual(['dynamic', 'project'])
    expect(policyFor({ tool_name: 'mcp__meu__run', mcp_server: { name: 'meu', source: 'dynamic' } })).toEqual({})
    expect(policyFor({ tool_name: 'mcp__proj__run', mcp_server: { name: 'proj', source: 'project' } })).toEqual({})
  })

  it('nega conector do claude.ai, settings do usuário, plugin, agente, origem desconhecida ou ausente', () => {
    for (const source of ['claudeai', 'user', 'local', 'plugin', 'agent', 'managed', 'enterprise', 'sdk', 'novo']) {
      expect(decisao(policyFor({ tool_name: 'mcp__x__y', mcp_server: { name: 'x', source } })), source).toBe('deny')
    }
    expect(decisao(policyFor({ tool_name: 'mcp__claude_ai_Docs__delete' }))).toBe('deny')
  })

  it('o hook lê a origem do input do SDK', async () => {
    const out = await agentPolicyHook(preToolUse('mcp__claude_ai_Docs__create', {}, { name: 'claude_ai_Docs', source: 'claudeai' }), 't1', { signal })
    expect(decisao(out)).toBe('deny')
  })
})

describe('modo de permissão declarado por agente de projeto (security review da H06.10)', () => {
  it('default e plan seguem a política normal', () => {
    expect(policyFor({ tool_name: 'Write', permission_mode: 'default' })).toEqual({})
    expect(policyFor({ tool_name: 'Read', permission_mode: 'plan' })).toEqual({})
    expect(decisao(policyFor({ tool_name: 'Bash', permission_mode: 'default' }))).toBe('ask')
  })

  it('acceptEdits força o card em toda tool da lista', () => {
    for (const t of ['Write', 'Edit', 'Read', 'Bash']) expect(decisao(policyFor({ tool_name: t, permission_mode: 'acceptEdits' })), t).toBe('ask')
  })

  it('bypassPermissions, dontAsk, auto ou modo desconhecido são negados', () => {
    for (const mode of ['bypassPermissions', 'dontAsk', 'auto', 'novo']) expect(decisao(policyFor({ tool_name: 'Write', permission_mode: mode })), mode).toBe('deny')
  })

  it('tool fora da lista continua negada em qualquer modo', () => {
    expect(decisao(policyFor({ tool_name: 'Monitor', permission_mode: 'acceptEdits' }))).toBe('deny')
  })

  it('o hook lê o modo do input do SDK', async () => {
    const input = { ...preToolUse('Write', {}), permission_mode: 'bypassPermissions' } as HookInput
    expect(decisao(await agentPolicyHook(input, 't1', { signal }))).toBe('deny')
  })
})

describe('opções do query() (H06.10)', () => {
  it('lista branca, Monitor fora, conectores do claude.ai desligados e hook em toda tool', () => {
    const o = agentToolOptions()
    expect(o.tools).toEqual([...AGENT_TOOLS])
    expect(o.disallowedTools).toEqual([...DISALLOWED_TOOLS])
    expect(o.settings).toEqual({ disableClaudeAiConnectors: true })
    expect(o.hooks).toEqual(agentHooks())
  })

  it('o agent.ts espalha agentToolOptions() no query() e não sobrescreve depois', () => {
    const src = readFileSync(join(__dirname, '../../../src/main/agent.ts'), 'utf8')
    const opts = /const options: Options = \{([\s\S]*?)\n  \}\n/.exec(src)?.[1] ?? ''
    expect(opts).toContain('...agentToolOptions()')
    const depois = opts.slice(opts.indexOf('...agentToolOptions()'))
    for (const k of ['tools', 'disallowedTools', 'hooks', 'settings', 'allowedTools']) expect(depois, k).not.toMatch(new RegExp(`\\n\\s+${k}:`))
  })

  it('hook sem matcher (vale para MCP também) e falha fecha', () => {
    const [m] = agentHooks().PreToolUse ?? []
    expect(m.matcher).toBeUndefined()
    expect(m.onFailure).toBe('block')
    expect(m.hooks).toEqual([agentPolicyHook])
  })
})
