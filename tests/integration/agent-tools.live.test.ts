import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { agentToolOptions } from '../../src/main/lib/agentPolicy'

// H06.10, prova com turno do modelo (decisão do PO: local e opt-in, evidência no sprint-06/qa.md).
// Precisa de login do Claude e custa centavos: roda só com DEVDECK_SDK_LIVE=1.
//   $env:DEVDECK_SDK_LIVE=1; npx vitest run tests/integration/agent-tools.live.test.ts --project tz-sao-paulo
// Cenário: agente de projeto (workspace confiado) declara `tools: Monitor, Bash` e recebe o pedido de rodar
// `git status`. Esperado: Monitor nunca executa (lista branca + hook de deny) e o Bash do subagente chega ao
// canUseTool (hook do ADR-022 vale dentro do subagente).

const LIVE = process.env.DEVDECK_SDK_LIVE === '1'
if (!LIVE) console.warn('[agent-tools.live] pulado: defina DEVDECK_SDK_LIVE=1 (precisa de login do Claude, custa centavos).')

let cwd: string
beforeAll(() => {
  if (!LIVE) return
  cwd = mkdtempSync(join(tmpdir(), 'devdeck-live-'))
  mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true })
  writeFileSync(
    join(cwd, '.claude', 'agents', 'espiao.md'),
    '---\nname: espiao\ndescription: Roda comandos de shell.\ntools: Monitor, Bash\n---\nVocê roda o comando pedido. Tente primeiro com Monitor; se não existir, use Bash.\n'
  )
})
afterAll(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true })
})

describe.skipIf(!LIVE)('subagente com a política do DevDeck (H06.10, live)', () => {
  it('agente de projeto com tools: Monitor não roda Monitor e o Bash dele passa pelo canUseTool', async () => {
    const canUseTool: string[] = []
    const usos: string[] = []
    const env: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|CCD)/i.test(k)) env[k] = v
    const q = query({
      prompt: 'Use a ferramenta Agent com subagent_type "espiao" e peça para ele rodar `git status` nesta pasta. Depois responda só "fim".',
      options: {
        cwd,
        env,
        model: 'claude-haiku-5-5',
        maxTurns: 6,
        permissionMode: 'default',
        settingSources: ['project'],
        canUseTool: async (toolName) => {
          canUseTool.push(toolName)
          return { behavior: 'deny', message: 'Negado pelo teste.' }
        },
        ...agentToolOptions()
      }
    })
    let custo = 0
    for await (const m of q) {
      if (m.type === 'assistant') for (const c of m.message.content) if (c.type === 'tool_use') usos.push(c.name)
      if (m.type === 'result') custo = m.total_cost_usd
    }
    console.info('[agent-tools.live]', JSON.stringify({ usos, canUseTool, custo }))
    expect(usos).toContain('Agent')
    expect(canUseTool).not.toContain('Monitor')
    // Se o subagente tentou o Bash, a decisão chegou ao canUseTool (card), não foi liberada como só-leitura.
    if (usos.includes('Bash')) expect(canUseTool).toContain('Bash')
  }, 180_000)

  it('agente de projeto com permissionMode: acceptEdits não escreve sem card', async () => {
    writeFileSync(
      join(cwd, '.claude', 'agents', 'escritor.md'),
      '---\nname: escritor\ndescription: Escreve arquivos.\ntools: Write\npermissionMode: acceptEdits\n---\nEscreva o arquivo pedido com a ferramenta Write.\n'
    )
    const canUseTool: string[] = []
    const env: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|CCD)/i.test(k)) env[k] = v
    const q = query({
      prompt: 'Use a ferramenta Agent com subagent_type "escritor" pedindo para criar o arquivo nota.txt com o texto "oi" nesta pasta. Depois responda só "fim".',
      options: {
        cwd,
        env,
        model: 'claude-haiku-5-5',
        maxTurns: 6,
        permissionMode: 'default',
        settingSources: ['project'],
        canUseTool: async (toolName) => {
          canUseTool.push(toolName)
          return { behavior: 'deny', message: 'Negado pelo teste.' }
        },
        ...agentToolOptions()
      }
    })
    let custo = 0
    for await (const m of q) if (m.type === 'result') custo = m.total_cost_usd
    const criado = existsSync(join(cwd, 'nota.txt'))
    console.info('[agent-tools.live] acceptEdits', JSON.stringify({ canUseTool, criado, custo }))
    expect(criado).toBe(false)
  }, 180_000)
})
