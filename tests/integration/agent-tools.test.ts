import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { AGENT_TOOLS, DISALLOWED_TOOLS, agentToolOptions } from '../../src/main/lib/agentPolicy'

// H06.10 com o SDK real: o Claude Code só oferece ao agente as tools da lista branca. Lê o `system/init` e
// aborta antes de qualquer turno do modelo (custo zero, não precisa de login). Config do Claude vazia e sem
// variáveis CLAUDE_*/ANTHROPIC_* herdadas, como no app instalado. Sem login o PowerShell não aparece,
// então a comparação é "contido na lista", com as tools essenciais obrigatórias.

let cwd: string
let config: string

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), 'devdeck-tools-'))
  config = mkdtempSync(join(tmpdir(), 'devdeck-cfg-'))
})
afterAll(() => {
  rmSync(cwd, { recursive: true, force: true })
  rmSync(config, { recursive: true, force: true })
})

function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC|CCD)/i.test(k)) env[k] = v
  env.CLAUDE_CONFIG_DIR = config
  return env
}

async function initTools(): Promise<{ tools: string[]; mcp: string[] }> {
  const ac = new AbortController()
  const q = query({
    prompt: 'oi',
    options: {
      cwd,
      abortController: ac,
      permissionMode: 'default',
      settingSources: [],
      env: cleanEnv(),
      canUseTool: async () => ({ behavior: 'deny', message: 'teste' }),
      ...agentToolOptions()
    }
  })
  try {
    for await (const m of q) {
      if (m.type === 'system' && m.subtype === 'init') {
        ac.abort()
        return { tools: m.tools, mcp: m.mcp_servers.map((s) => s.name) }
      }
    }
  } catch (err) {
    if (!ac.signal.aborted) throw err
  }
  throw new Error('o SDK não emitiu system/init')
}

describe('tools que o SDK real oferece ao agente (H06.10)', () => {
  it('só tools da lista branca, com as essenciais e sem Monitor nem conector do claude.ai', async () => {
    const { tools, mcp } = await initTools()
    for (const t of tools) expect(AGENT_TOOLS, `tool fora da lista: ${t}`).toContain(t)
    for (const t of ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Task']) expect(tools).toContain(t)
    for (const t of DISALLOWED_TOOLS) expect(tools).not.toContain(t)
    expect(mcp.filter((n) => /claude_ai/i.test(n))).toEqual([])
  }, 90_000)
})
