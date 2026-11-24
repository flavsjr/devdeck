import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AgentErrorCode, ChatItem } from '../../../src/shared/types'
import { ROTULO_ERRO_AGENTE } from '../../../src/main/lib/agentRedact'

// H06.3 (T18): um item de erro por turno. Roda o agent.ts de verdade com o SDK simulado emitindo
// as mensagens das fixtures reais do 0.3.330 (init → assistant com `error` → result com is_error →
// throw "Claude Code returned an error result: …"), e confere o arquivo da sessão e os eventos.

interface Fixture {
  scenario: string
  init: { apiKeySource: string }
  assistant: { error: string; text: string }
  result: { subtype: string; is_error: boolean; result: string; api_error_status: number | null }
  thrown: { message: string }
}

const DIR = resolve(__dirname, '../../fixtures/agent-errors')
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture)

const ESPERADO: Record<string, AgentErrorCode> = {
  billing: 'billing',
  invalid_key: 'auth_invalid_key',
  missing_credentials: 'auth_missing',
  no_network: 'network',
  oauth_expired: 'auth_expired',
  overloaded: 'overloaded',
  rate_limit: 'rate_limit'
}

const FAKE_KEY = 'FAKEsaved-' + 'k'.repeat(20)

const h = vi.hoisted(() => ({
  userData: '',
  apiKey: null as string | null,
  fixture: null as unknown,
  mode: 'fixture' as 'fixture' | 'crash' | 'result-only'
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
  return { ...real, getApiKey: () => h.apiKey, getMcpServers: () => [] }
})

vi.mock('../../../src/main/workspace', () => ({ getRoot: () => h.userData, toRel: (f: string) => f }))
vi.mock('../../../src/main/trust', () => ({
  classifyEditTarget: () => 'inside',
  decideWorkspace: async () => ({ settingSources: [], gitAllowed: false })
}))
vi.mock('../../../src/main/gitTrust', () => ({ noGitDir: () => join(h.userData, 'no-git-here') }))
vi.mock('../../../src/main/mcp', () => ({ toSdkMcpServers: () => ({}) }))
vi.mock('../../../src/main/achievements', () => ({ checkAchievements: () => undefined }))

/** SDK falso: espera o prompt (como o real) e emite a sequência da fixture. */
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt }: { prompt: AsyncIterable<unknown> }) => {
    async function* run(): AsyncGenerator<unknown> {
      await prompt[Symbol.asyncIterator]().next()
      if (h.mode === 'crash') throw new Error('Claude Code process exited with code 3221225477')
      const f = h.fixture as Fixture
      yield { type: 'system', subtype: 'init', session_id: 'sdk-1', model: 'claude-x', tools: [], mcp_servers: [], apiKeySource: f.init.apiKeySource, permissionMode: 'default' }
      if (h.mode === 'fixture') {
        yield { type: 'assistant', parent_tool_use_id: null, error: f.assistant.error, message: { content: [{ type: 'text', text: f.assistant.text }] } }
      }
      yield { ...f.result, type: 'result', total_cost_usd: 0, modelUsage: {}, num_turns: 1, duration_ms: 5 }
      throw new Error(f.thrown.message)
    }
    return Object.assign(run(), { close: () => undefined, interrupt: async () => undefined })
  }
}))

interface AgentModule {
  createSession(title?: string): { id: string }
  sendMessage(id: string, text: string, context: string[]): Promise<void>
  shutdownAll(): void
}
const MAIN = '../../../src/main/'
const agent = (await import(/* @vite-ignore */ MAIN + 'agent')) as AgentModule
const { setEmitter } = (await import(/* @vite-ignore */ MAIN + 'events')) as { setEmitter(fn: (e: unknown) => void): void }
const store = (await import(/* @vite-ignore */ MAIN + 'store')) as { getStats(): { turns: number } }

const sessionItems = (id: string): ChatItem[] =>
  (JSON.parse(readFileSync(join(h.userData, 'sessions', `${id}.json`), 'utf8')) as { items: ChatItem[] }).items

/** JSON sem o campo `detail` (o único lugar em que o texto original, redigido, pode aparecer). */
const semDetalhe = (v: unknown): string => JSON.stringify(v, (k, val: unknown) => (k === 'detail' ? undefined : val))

/**
 * Roda um turno e espera o pump terminar. busy:false sai no result e de novo no finally do pump
 * (depois do throw final); sem result (processo caiu), só no finally.
 */
async function turno(): Promise<{ id: string; items: ChatItem[]; events: { type: string; item?: ChatItem }[] }> {
  const events: { type: string; item?: ChatItem; busy?: boolean }[] = []
  setEmitter((e) => events.push(e as { type: string }))
  const { id } = agent.createSession('t')
  await agent.sendMessage(id, 'oi', [])
  const esperado = h.mode === 'crash' ? 1 : 2
  await vi.waitFor(() => expect(events.filter((e) => e.type === 'busy' && e.busy === false).length).toBeGreaterThanOrEqual(esperado))
  // O throw final chega depois do result: espera o pump encerrar.
  await new Promise((r) => setTimeout(r, 20))
  return { id, items: sessionItems(id), events }
}

describe('um item de erro por turno (H06.3)', () => {
  beforeAll(() => {
    h.userData = mkdtempSync(join(tmpdir(), 'devdeck-erritem-'))
  })
  afterEach(() => agent.shutdownAll())
  afterAll(() => rmSync(h.userData, { recursive: true, force: true }))

  it.each(fixtures.map((f) => [f.scenario, f] as const))('%s', async (_nome, f) => {
    h.mode = 'fixture'
    h.fixture = f
    h.apiKey = f.init.apiKeySource === 'ANTHROPIC_API_KEY' ? FAKE_KEY : null
    const { items, events } = await turno()

    const erros = items.filter((i) => i.kind === 'error')
    expect(erros, 'exatamente um item de erro').toHaveLength(1)
    const e = erros[0] as Extract<ChatItem, { kind: 'error' }>
    expect(e.code).toBe(ESPERADO[f.scenario])
    expect(e.text).toBe(ROTULO_ERRO_AGENTE)
    expect(e.detail).toContain(f.assistant.text)
    expect(e.detail).not.toContain('Claude Code returned an error result')

    // Sem balão do assistente com a mensagem sintética.
    expect(items.some((i) => i.kind === 'assistant')).toBe(false)

    // Texto cru em inglês só em `detail`: nem no disco, nem nos eventos ao renderer.
    expect(semDetalhe(items)).not.toContain(f.assistant.text)
    expect(semDetalhe(events)).not.toContain(f.assistant.text)
    expect(semDetalhe(events)).not.toContain('Claude Code returned an error result')

    // Eventos: um 'item' de erro só; os outros são 'item-update' do mesmo id.
    const errEvents = events.filter((ev) => ev.item?.kind === 'error')
    expect(errEvents.filter((ev) => ev.type === 'item')).toHaveLength(1)
    expect(new Set(errEvents.map((ev) => ev.item!.id))).toEqual(new Set([e.id]))
  })

  it('falha de autenticação não conta como turno nas estatísticas', () => {
    expect(store.getStats().turns).toBe(0)
  })

  it('result com is_error sem mensagem do assistente: o result cria o item, o throw reaproveita', async () => {
    h.mode = 'result-only'
    h.fixture = fixtures.find((f) => f.scenario === 'overloaded')
    h.apiKey = FAKE_KEY
    const { items } = await turno()
    const erros = items.filter((i) => i.kind === 'error')
    expect(erros).toHaveLength(1)
    expect(erros[0]).toMatchObject({ code: 'overloaded', text: ROTULO_ERRO_AGENTE })
  })

  it('falha do processo sem msg.error: item unknown com detalhe redigido', async () => {
    h.mode = 'crash'
    h.apiKey = null
    const { items } = await turno()
    const erros = items.filter((i) => i.kind === 'error')
    expect(erros).toHaveLength(1)
    expect(erros[0]).toMatchObject({ code: 'unknown', text: ROTULO_ERRO_AGENTE })
    expect((erros[0] as { detail?: string }).detail).toContain('exited with code')
  })
})
