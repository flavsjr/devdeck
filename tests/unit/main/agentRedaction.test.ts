import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { McpServerEntry } from '../../../src/shared/types'
import { MASK } from '../../../src/main/lib/secrets'
import { pumpErrorItem, redactResultErrors, redactedError, stderrLogArgs } from '../../../src/main/lib/agentRedact'

// H06.3 (exigência da Cybersecurity): segredo na mensagem de erro do agente não chega ao IPC,
// ao console nem ao arquivo da sessão em disco. Roda o agent.ts de verdade, com Electron, SDK e
// diálogos de confiança simulados, e o store real gravando numa pasta temporária.

// Valores falsos montados em tempo de execução (não parecem credencial para o gitleaks).
const ANT = ['sk', 'ant', 'api03', 'FAKE' + 'a'.repeat(24)].join('-')
const BEARER = 'FAKEbearer' + 'q'.repeat(24)
const SAVED = 'FAKEsaved-' + 'p'.repeat(20)
const MCPTOK = 'FAKEmcp-' + 'r'.repeat(20)
const FAKES = [ANT, BEARER, SAVED, MCPTOK]
const leaky = (where: string): string => `${where}: 401 Authorization: Bearer ${BEARER} key ${ANT} salva ${SAVED} mcp ${MCPTOK}`

type Scenario = 'trust-fails' | 'pump-throws' | 'result-errors'

const h = vi.hoisted(() => ({
  userData: '',
  scenario: 'pump-throws' as Scenario,
  apiKey: '' as string | null,
  mcp: [] as McpServerEntry[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => h.userData, isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => false,
    getSelectedStorageBackend: () => 'basic_text',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
}))

vi.mock('../../../src/main/store', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return { ...real, getApiKey: () => h.apiKey, getMcpServers: () => h.mcp }
})

vi.mock('../../../src/main/workspace', () => ({ getRoot: () => h.userData, toRel: (f: string) => f }))

vi.mock('../../../src/main/trust', () => ({
  classifyEditTarget: () => 'inside',
  decideWorkspace: async () => {
    if (h.scenario === 'trust-fails') throw new Error(leaky('trust'))
    return { settingSources: [], gitAllowed: false }
  }
}))

vi.mock('../../../src/main/gitTrust', () => ({ noGitDir: () => join(h.userData, 'no-git-here') }))
vi.mock('../../../src/main/mcp', () => ({ toSdkMcpServers: () => ({}) }))
vi.mock('../../../src/main/achievements', () => ({ checkAchievements: () => undefined }))

/** SDK falso: escreve no stderr e então falha (ou devolve um result com erros). */
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { options: { stderr?: (d: string) => void } }) => {
    async function* run(): AsyncGenerator<unknown> {
      options.stderr?.(leaky('stderr') + '\n')
      if (h.scenario === 'pump-throws') throw new Error(leaky('pump'))
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: [leaky('result-1'), `x-api-key: ${ANT}`],
        total_cost_usd: 0,
        modelUsage: {},
        num_turns: 1,
        duration_ms: 5
      }
    }
    const it = run()
    return Object.assign(it, { close: () => undefined, interrupt: async () => undefined })
  }
}))

// agent.ts e events.ts ficam fora do projeto de tipos dos testes (tsconfig.test.json só cobre lib/):
// import por caminho em variável, com o pedaço da API usado aqui tipado à mão.
interface AgentModule {
  createSession(title?: string): { id: string }
  sendMessage(id: string, text: string, context: string[]): Promise<void>
  shutdownAll(): void
}
const MAIN = '../../../src/main/'
const agent = (await import(/* @vite-ignore */ MAIN + 'agent')) as AgentModule
const { setEmitter } = (await import(/* @vite-ignore */ MAIN + 'events')) as { setEmitter(fn: (e: unknown) => void): void }

const sessionText = (id: string): string => readFileSync(join(h.userData, 'sessions', `${id}.json`), 'utf8')
const expectClean = (text: string, where: string): void => {
  for (const f of FAKES) expect(text, `${where} vazou ${f.slice(0, 12)}…`).not.toContain(f)
}

describe('agent.ts não vaza segredo em erro (H06.3)', () => {
  const emitted: string[] = []
  let errSpy: MockInstance<typeof console.error>

  beforeAll(() => {
    h.userData = mkdtempSync(join(tmpdir(), 'devdeck-redact-'))
    h.apiKey = SAVED
    h.mcp = [{ name: 'gh', enabled: true, type: 'stdio', command: 'npx', env: { GITHUB_TOKEN: MCPTOK } }]
    setEmitter((e) => emitted.push(JSON.stringify(e)))
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    agent.shutdownAll()
    emitted.length = 0
    errSpy.mockClear()
  })
  afterAll(() => {
    errSpy.mockRestore()
    rmSync(h.userData, { recursive: true, force: true })
  })

  const loggedText = (): string => errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')

  it(':285 — rethrow que vira mensagem de IPC', async () => {
    h.scenario = 'trust-fails'
    const { id } = agent.createSession('t')
    const err = await agent.sendMessage(id, 'oi', []).then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(err).toBeInstanceOf(Error)
    expectClean(err!.message, 'IPC')
    expect(err!.message).toContain(`Bearer ${MASK}`)
    expect(err!.stack ?? '').not.toContain(BEARER)
  })

  it(':303 e :320 — stderr no console.error e catch do pump gravado em disco', async () => {
    h.scenario = 'pump-throws'
    const { id } = agent.createSession('t')
    await agent.sendMessage(id, 'oi', [])
    await vi.waitFor(() => expect(sessionText(id)).toContain('"kind": "error"'))

    const logged = loggedText()
    expect(logged).toContain('stderr: 401')
    expectClean(logged, 'console.error')

    const disk = sessionText(id)
    expect(disk).toContain('pump: 401')
    expectClean(disk, 'arquivo da sessão')
    expectClean(emitted.join('\n'), 'eventos ao renderer')
  })

  it(':469 — result.errors gravado em disco', async () => {
    h.scenario = 'result-errors'
    const { id } = agent.createSession('t')
    await agent.sendMessage(id, 'oi', [])
    await vi.waitFor(() => expect(sessionText(id)).toContain('"kind": "result"'))

    const disk = sessionText(id)
    expect(disk).toContain('result-1: 401')
    expect(disk).toContain(`x-api-key: ${MASK}`)
    expectClean(disk, 'arquivo da sessão')
    expectClean(loggedText(), 'console.error')
    expectClean(emitted.join('\n'), 'eventos ao renderer')
  })
})

describe('agentRedact (puro)', () => {
  const known = [SAVED, MCPTOK, null, undefined]
  it('cada saída sai redigida', () => {
    expectClean(redactedError(new Error(leaky('a')), known).message, 'redactedError')
    expectClean(redactedError(leaky('b'), known).message, 'redactedError(string)')
    const [prefix, line] = stderrLogArgs('12345678-aaaa', leaky('c') + '\n\n', known)
    expect(prefix).toBe('[agent 12345678]')
    expect(line.endsWith('\n')).toBe(false)
    expectClean(line, 'stderrLogArgs')
    const item = pumpErrorItem(new Error(leaky('d')), known, 'id-1', 7)
    expect(item).toMatchObject({ kind: 'error', id: 'id-1', ts: 7 })
    expectClean(JSON.stringify(item), 'pumpErrorItem')
    expectClean(JSON.stringify(redactResultErrors([leaky('e'), leaky('f')], known)), 'redactResultErrors')
    expect(redactResultErrors(undefined, known)).toBeUndefined()
  })
})

describe('agent.ts usa a redação nos 4 pontos (teste-guarda)', () => {
  const src = readFileSync(resolve(__dirname, '../../../src/main/agent.ts'), 'utf8')
  it('rethrow, stderr, catch do pump e result.errors', () => {
    expect(src).toMatch(/throw redactedError\(err, ls\.secrets\)/)
    expect(src).toMatch(/stderr: \(data: string\) => console\.error\(\.\.\.stderrLogArgs\(ls\.id, data, ls\.secrets\)\)/)
    expect(src).toMatch(/pushItem\(ls\.id, pumpErrorItem\(err, ls\.secrets,/)
    expect(src).toMatch(/errors: msg\.subtype === 'success' \? undefined : redactResultErrors\(msg\.errors, ls\.secrets\)/)
  })
  it('nenhuma mensagem de erro crua volta a ser gravada ou relançada', () => {
    expect(src).not.toMatch(/^\s*throw err\s*$/m)
    expect(src).not.toMatch(/kind: 'error'[^}]*err\.message/)
    expect(src).not.toMatch(/undefined : msg\.errors\b/)
    expect(src).not.toMatch(/console\.error\([^)]*data\.trimEnd\(\)/)
  })
})
