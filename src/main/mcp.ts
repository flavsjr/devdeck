import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerEntry, McpServerView, McpTestResult } from '@shared/types'
import { getMcpServers, saveMcpServers } from './store'
import { assertNoSecretInUrl, redactAll, secretValues } from './lib/secrets'
import { erroComContexto, motivoConhecido } from '@shared/lib/errorText'

const TEST_TIMEOUT_MS = 20_000

function makeTransport(e: McpServerEntry): Transport {
  if (e.type === 'stdio') {
    if (!e.command) throw new Error('Comando obrigatório para stdio.')
    return new StdioClientTransport({
      command: e.command,
      args: e.args ?? [],
      env: { ...getDefaultEnvironment(), ...(e.env ?? {}) },
      stderr: 'ignore'
    })
  }
  if (!e.url) throw new Error('URL obrigatória para http/sse.')
  const requestInit: RequestInit = { headers: e.headers ?? {} }
  return e.type === 'http'
    ? new StreamableHTTPClientTransport(new URL(e.url), { requestInit })
    : new SSEClientTransport(new URL(e.url), { requestInit })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      }
    )
  })
}

/** Conecta, lista tools/resources/prompts e desconecta. */
export async function testMcpServer(e: McpServerEntry): Promise<McpTestResult> {
  const started = Date.now()
  const client = new Client({ name: 'devdeck', version: '0.1.0' })
  const empty = { tools: [], resources: [], prompts: [] }
  try {
    await withTimeout(client.connect(makeTransport(e)), TEST_TIMEOUT_MS)
    const caps = client.getServerCapabilities() ?? {}
    const info = client.getServerVersion()
    const [tools, resources, prompts] = await withTimeout(
      Promise.all([
        caps.tools ? client.listTools().then((r) => r.tools) : Promise.resolve([]),
        caps.resources ? client.listResources().then((r) => r.resources).catch(() => []) : Promise.resolve([]),
        caps.prompts ? client.listPrompts().then((r) => r.prompts).catch(() => []) : Promise.resolve([])
      ]),
      TEST_TIMEOUT_MS
    )
    return {
      ok: true,
      serverName: info?.name,
      serverVersion: info?.version,
      tools: tools.map((t) => ({ name: t.name, description: t.description, readOnly: t.annotations?.readOnlyHint })),
      resources: resources.map((r) => ({ uri: r.uri, name: r.name })),
      prompts: prompts.map((p) => ({ name: p.name, description: p.description })),
      ms: Date.now() - started
    }
  } catch (err) {
    // ENOENT/EACCES/EPERM/rede viram PT-BR com contexto (H06.2, T11); o resto (erro do protocolo MCP,
    // saída do servidor) segue como veio, porque é o que ajuda a corrigir a configuração.
    const known = motivoConhecido(err)
    const contexto = e.type === 'stdio' ? 'Não foi possível iniciar o servidor MCP' : 'Não foi possível conectar ao servidor MCP'
    const msg = known ? erroComContexto(contexto, err) : err instanceof Error ? err.message : String(err)
    // A mensagem vai para o renderer: tira valores de env/headers e também token em formato conhecido que o
    // servidor tenha lido de outro lugar e ecoado (security review da Sprint 06).
    return { ok: false, error: redactAll(msg, secretValues(e)), ...empty, ms: Date.now() - started }
  } finally {
    client.close().catch(() => undefined)
  }
}

/** Converte entradas habilitadas para o formato do Claude Agent SDK. */
export function toSdkMcpServers(list: McpServerEntry[]): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}
  for (const e of list) {
    if (!e.enabled) continue
    if (e.type === 'stdio' && e.command) out[e.name] = { type: 'stdio', command: e.command, args: e.args ?? [], env: e.env ?? {} }
    else if (e.type === 'http' && e.url) out[e.name] = { type: 'http', url: e.url, headers: e.headers ?? {} }
    else if (e.type === 'sse' && e.url) out[e.name] = { type: 'sse', url: e.url, headers: e.headers ?? {} }
  }
  return out
}

// ---------- Importação de configs existentes do Claude ----------

type RawServer = { type?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }

function claudeConfigCandidates(): string[] {
  const home = homedir()
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  return [
    join(appData, 'Claude', 'claude_desktop_config.json'), // Claude Desktop (Windows)
    join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), // macOS
    join(home, '.config', 'Claude', 'claude_desktop_config.json'), // Linux
    join(home, '.claude.json') // Claude Code (escopo usuário)
  ]
}

function rawToEntry(name: string, raw: RawServer): McpServerEntry | null {
  const type = raw.type === 'http' || raw.type === 'sse' ? raw.type : raw.url && !raw.command ? 'http' : 'stdio'
  if (type === 'stdio' && !raw.command) return null
  if (type !== 'stdio' && !raw.url) return null
  // Credencial na URL (query ou usuário:senha) não é importada: ficaria em claro (H05.8).
  if (type !== 'stdio') {
    try {
      assertNoSecretInUrl(raw.url)
    } catch {
      return null
    }
  }
  return { name, enabled: false, type, command: raw.command, args: raw.args, env: raw.env, url: raw.url, headers: raw.headers }
}

/** Importa já cifrando (saveMcpServers); sem cofre do sistema e com segredos, falha sem gravar. */
export function importFromClaude(): { imported: string[]; servers: McpServerView[] } {
  const current = getMcpServers()
  const names = new Set(current.map((s) => s.name))
  const imported: string[] = []
  for (const file of claudeConfigCandidates()) {
    if (!existsSync(file)) continue
    try {
      const json = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, RawServer> }
      for (const [name, raw] of Object.entries(json.mcpServers ?? {})) {
        if (names.has(name)) continue
        const entry = rawToEntry(name, raw)
        if (!entry) continue
        current.push(entry)
        names.add(name)
        imported.push(name)
      }
    } catch {
      // arquivo inválido: ignora
    }
  }
  return { imported, servers: saveMcpServers(current) }
}
