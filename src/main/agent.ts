import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'
import { makePatch, previewEdit, revertText } from './lib/edit'
import { alwaysEligible, pathArgsOf, toolScope } from './lib/toolpath'
import type { CanUseTool, Options, PermissionResult, Query, SDKMessage, SDKUserMessage, SettingSource } from '@anthropic-ai/claude-agent-sdk'
import type { ApprovalDecision, ApprovalRequest, ChatItem, LedgerEntry, SessionMeta } from '@shared/types'
import {
  appendLedger,
  bumpStats,
  deleteSession,
  getApiKey,
  getMcpServers,
  getSettings,
  listSessions,
  loadSession,
  saveSession,
  type StoredSession
} from './store'
import { getRoot, toRel } from './workspace'
import { classifyEditTarget, decideWorkspace } from './trust'
import { agentEnv } from './lib/gitproc'
import { noGitDir } from './gitTrust'
import { toSdkMcpServers } from './mcp'
import { emit } from './events'
import { checkAchievements } from './achievements'

// Orquestra sessões do Claude Agent SDK: uma query() em modo streaming-input por chat,
// aprovação de edições/comandos via canUseTool e contabilidade de custo por turno.

const MAX_RESULT_CHARS = 4000

/** Fila assíncrona que alimenta o prompt em modo streaming-input. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiters: ((r: IteratorResult<T>) => void)[] = []
  private done = false

  push(v: T): void {
    if (this.done) return
    const w = this.waiters.shift()
    if (w) w({ value: v, done: false })
    else this.items.push(v)
  }

  end(): void {
    this.done = true
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift() as T, done: false })
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      }
    }
  }
}

interface PendingChange {
  filePath: string
  before: string
  after: string
  created: boolean
}

interface LiveSession {
  id: string
  queue: AsyncQueue<SDKUserMessage>
  q: Query | null
  busy: boolean
  autoApproveEdits: boolean
  alwaysAllowed: Set<string>
  pendingChanges: Map<string, PendingChange>
  contextWindow: number
  turnStartedAt: number
  cwd: string
}

interface PendingApproval {
  req: ApprovalRequest
  input: Record<string, unknown>
  resolve: (r: PermissionResult) => void
  change?: PendingChange
  toolUseID: string
}

const live = new Map<string, LiveSession>()
const pending = new Map<string, PendingApproval>()

// ---------- helpers ----------

function now(): number {
  return Date.now()
}

function mustLoad(id: string): StoredSession {
  const s = loadSession(id)
  if (!s) throw new Error(`Sessão não encontrada: ${id}`)
  return s
}

function pushItem(sessionId: string, item: ChatItem): void {
  const s = mustLoad(sessionId)
  s.items.push(item)
  s.meta.updatedAt = now()
  saveSession(s)
  emit({ type: 'item', sessionId, item })
}

function updateItem(sessionId: string, itemId: string, patch: (it: ChatItem) => ChatItem): void {
  const s = mustLoad(sessionId)
  const idx = s.items.findIndex((i) => i.id === itemId)
  if (idx < 0) return
  s.items[idx] = patch(s.items[idx])
  saveSession(s)
  emit({ type: 'item-update', sessionId, item: s.items[idx] })
}

function setBusy(ls: LiveSession, busy: boolean): void {
  ls.busy = busy
  emit({ type: 'busy', sessionId: ls.id, busy })
}

function summarizeTool(name: string, input: Record<string, unknown>): string {
  const p = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const rel = (f: string): string => toRel(f) ?? f
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return rel(p('file_path'))
    case 'Bash':
      return p('description') || p('command')
    case 'Glob':
      return p('pattern')
    case 'Grep':
      return `${p('pattern')}${p('path') ? ` em ${rel(p('path'))}` : ''}`
    case 'WebFetch':
      return p('url')
    case 'WebSearch':
      return p('query')
    case 'TodoWrite':
      return 'atualizou a lista de tarefas'
    default:
      return JSON.stringify(input).slice(0, 140)
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : '[conteúdo não textual]'))
      .join('\n')
  }
  return JSON.stringify(content)
}


// ---------- sessões ----------

export function listAllSessions(): SessionMeta[] {
  return listSessions()
}

export function createSession(title?: string): SessionMeta {
  const cwd = getRoot()
  if (!cwd) throw new Error('Abra um workspace antes de criar um chat.')
  const meta: SessionMeta = {
    id: randomUUID(),
    title: title?.trim() || 'Novo chat',
    cwd,
    createdAt: now(),
    updatedAt: now(),
    totalCostUsd: 0
  }
  saveSession({ meta, items: [], lastTotalCostUsd: 0, lastModelUsage: {} })
  return meta
}

export function getSessionState(id: string): { meta: SessionMeta; items: ChatItem[]; busy: boolean; approvals: ApprovalRequest[] } {
  const s = mustLoad(id)
  const approvals = [...pending.values()].filter((p) => p.req.sessionId === id).map((p) => p.req)
  return { meta: s.meta, items: s.items, busy: live.get(id)?.busy ?? false, approvals }
}

export function renameSession(id: string, title: string): SessionMeta {
  const s = mustLoad(id)
  s.meta.title = title.trim() || s.meta.title
  saveSession(s)
  emit({ type: 'session-meta', meta: s.meta })
  return s.meta
}

export function removeSession(id: string): void {
  closeLive(id)
  deleteSession(id)
}

function closeLive(id: string): void {
  const ls = live.get(id)
  if (!ls) return
  rejectPendingFor(id, 'Sessão encerrada.')
  ls.queue.end()
  ls.q?.close()
  live.delete(id)
}

/** Fecha sessões ociosas para que novas configs (modelo, MCPs, chave) valham no próximo envio. */
export function resetIdleSessions(): void {
  for (const [id, ls] of live) if (!ls.busy) closeLive(id)
}

export function shutdownAll(): void {
  for (const id of [...live.keys()]) closeLive(id)
}

// ---------- envio ----------

export async function sendMessage(id: string, text: string, context: string[]): Promise<void> {
  const s = mustLoad(id)
  const trimmed = text.trim()
  if (!trimmed) return

  if (s.items.length === 0 && s.meta.title === 'Novo chat') {
    s.meta.title = trimmed.slice(0, 48) + (trimmed.length > 48 ? '…' : '')
    saveSession(s)
    emit({ type: 'session-meta', meta: s.meta })
  }

  pushItem(id, { kind: 'user', id: randomUUID(), text: trimmed, context: context.length ? context : undefined, ts: now() })

  const prompt = context.length
    ? `${trimmed}\n\nArquivos em foco (relativos ao workspace; leia os que forem relevantes):\n${context.map((c) => `- ${c}`).join('\n')}`
    : trimmed

  const ls = live.get(id) ?? (await startLive(s))
  ls.turnStartedAt = now()
  setBusy(ls, true)
  ls.queue.push({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null })
}

export async function interrupt(id: string): Promise<void> {
  const ls = live.get(id)
  if (!ls?.q) return
  rejectPendingFor(id, 'Interrompido pelo usuário.')
  await ls.q.interrupt().catch(() => undefined)
}

/** Caminho absoluto do Claude Code desempacotado (nunca resolvido pelo PATH). */
function claudeExecutable(): string {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude'
  return join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`, exe)
}

async function startLive(s: StoredSession): Promise<LiveSession> {
  const ls: LiveSession = {
    id: s.meta.id,
    queue: new AsyncQueue<SDKUserMessage>(),
    q: null,
    busy: false,
    autoApproveEdits: false,
    alwaysAllowed: new Set(),
    pendingChanges: new Map(),
    contextWindow: 0,
    turnStartedAt: now(),
    cwd: s.meta.cwd
  }
  live.set(ls.id, ls)

  const settings = getSettings()
  const apiKey = getApiKey()
  let settingSources: SettingSource[] = []
  let gitAllowed = false
  try {
    ;({ settingSources, gitAllowed } = await decideWorkspace(s.meta.cwd, settings.loadProjectSettings))
  } catch (err) {
    live.delete(ls.id)
    throw err
  }
  const options: Options = {
    cwd: s.meta.cwd,
    model: settings.model || undefined,
    effort: settings.effort || undefined,
    maxBudgetUsd: settings.sessionBudgetUsd > 0 ? settings.sessionBudgetUsd : undefined,
    mcpServers: toSdkMcpServers(getMcpServers()),
    permissionMode: 'default',
    canUseTool: makeCanUseTool(ls),
    includePartialMessages: true,
    settingSources,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: settings.appendSystemPrompt || undefined },
    resume: s.meta.claudeSessionId,
    // Sem GIT_* herdado; com o git pausado, o git que o Claude Code rodar não acha repositório (H05.1).
    env: { ...agentEnv(process.env, process.platform, s.meta.cwd, gitAllowed, noGitDir()), ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}) },
    // env/headers de MCP pelo stdin, não pela linha de comando (legível por outros usuários da máquina).
    mcpServersDelivery: 'initialize',
    stderr: (data: string) => console.error(`[agent ${ls.id.slice(0, 8)}]`, data.trimEnd())
  }

  // App instalado: o Claude Code é binário nativo e fica fora do asar (asarUnpack, ADR-011).
  if (app.isPackaged) options.pathToClaudeCodeExecutable = claudeExecutable()

  // SDK é ESM-only; import dinâmico funciona a partir do bundle CJS do main.
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  ls.q = query({ prompt: ls.queue, options })
  void pump(ls)
  return ls
}

async function pump(ls: LiveSession): Promise<void> {
  try {
    for await (const msg of ls.q as Query) handleMessage(ls, msg)
  } catch (err) {
    pushItem(ls.id, { kind: 'error', id: randomUUID(), text: err instanceof Error ? err.message : String(err), ts: now() })
  } finally {
    if (live.get(ls.id) === ls) live.delete(ls.id)
    rejectPendingFor(ls.id, 'Processo do agente encerrado.')
    setBusy(ls, false)
  }
}

function handleMessage(ls: LiveSession, msg: SDKMessage): void {
  switch (msg.type) {
    case 'system': {
      if (msg.subtype !== 'init') return
      const s = mustLoad(ls.id)
      s.meta.claudeSessionId = msg.session_id
      saveSession(s)
      emit({
        type: 'info',
        sessionId: ls.id,
        info: {
          model: msg.model,
          tools: msg.tools,
          mcpServers: msg.mcp_servers.map((m) => ({ name: m.name, status: m.status })),
          apiKeySource: msg.apiKeySource,
          permissionMode: msg.permissionMode
        }
      })
      return
    }
    case 'stream_event': {
      if (msg.parent_tool_use_id) return
      const ev = msg.event
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        emit({ type: 'delta', sessionId: ls.id, text: ev.delta.text })
      }
      return
    }
    case 'assistant': {
      if (msg.parent_tool_use_id) return // mensagens de subagentes ficam fora do chat principal
      const usage = msg.message.usage
      if (usage) {
        const used = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        if (used > 0) emit({ type: 'context', sessionId: ls.id, used, window: ls.contextWindow || 1_000_000 })
      }
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          pushItem(ls.id, { kind: 'assistant', id: randomUUID(), text: block.text, ts: now() })
        } else if (block.type === 'tool_use') {
          const input = (block.input ?? {}) as Record<string, unknown>
          pushItem(ls.id, {
            kind: 'tool',
            id: block.id,
            toolUseId: block.id,
            name: block.name,
            summary: summarizeTool(block.name, input),
            input,
            ts: now()
          })
        }
      }
      return
    }
    case 'user': {
      const content = msg.message.content
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (block.type !== 'tool_result') continue
        const text = stringifyToolResult(block.content)
        const isError = Boolean(block.is_error)
        updateItem(ls.id, block.tool_use_id, (it) =>
          it.kind === 'tool' ? { ...it, result: text.slice(0, MAX_RESULT_CHARS), isError } : it
        )
        const change = ls.pendingChanges.get(block.tool_use_id)
        if (change) {
          ls.pendingChanges.delete(block.tool_use_id)
          if (!isError) void recordChange(ls.id, change)
        }
      }
      return
    }
    case 'result': {
      handleResult(ls, msg)
      return
    }
    default:
      return
  }
}

/** Patch a partir do que ficou no disco (não da prévia): CRLF e normalizações do Claude Code continuam reversíveis. */
async function recordChange(sessionId: string, c: PendingChange): Promise<void> {
  const rel = toRel(c.filePath) ?? basename(c.filePath)
  const onDisk = existsSync(c.filePath) ? await readFile(c.filePath, 'utf8').catch(() => c.after) : ''
  const patch = makePatch(rel, c.before, onDisk)
  pushItem(sessionId, { kind: 'change', id: randomUUID(), filePath: c.filePath, patch, created: c.created, ts: now() })
}

function handleResult(ls: LiveSession, msg: Extract<SDKMessage, { type: 'result' }>): void {
  const s = mustLoad(ls.id)
  const total = msg.total_cost_usd ?? 0
  const delta = total >= s.lastTotalCostUsd ? total - s.lastTotalCostUsd : total

  // Deltas por modelo (modelUsage é cumulativo na query).
  const entries: LedgerEntry[] = []
  for (const [model, mu] of Object.entries(msg.modelUsage ?? {})) {
    if (mu.contextWindow) ls.contextWindow = Math.max(ls.contextWindow, mu.contextWindow)
    const prev = s.lastModelUsage[model]
    const reset = prev && mu.costUSD < prev.costUSD
    const base = prev && !reset ? prev : { costUSD: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }
    const e: LedgerEntry = {
      ts: now(),
      sessionId: ls.id,
      model,
      costUsd: Math.max(0, mu.costUSD - base.costUSD),
      inputTokens: Math.max(0, mu.inputTokens - base.inputTokens),
      outputTokens: Math.max(0, mu.outputTokens - base.outputTokens),
      cacheReadTokens: Math.max(0, mu.cacheReadInputTokens - base.cacheReadInputTokens),
      cacheWriteTokens: Math.max(0, mu.cacheCreationInputTokens - base.cacheCreationInputTokens)
    }
    if (e.costUsd > 0 || e.inputTokens > 0 || e.outputTokens > 0) entries.push(e)
    s.lastModelUsage[model] = {
      costUSD: mu.costUSD,
      inputTokens: mu.inputTokens,
      outputTokens: mu.outputTokens,
      cacheReadInputTokens: mu.cacheReadInputTokens,
      cacheCreationInputTokens: mu.cacheCreationInputTokens
    }
  }
  appendLedger(entries)

  s.lastTotalCostUsd = total
  s.meta.totalCostUsd += delta
  s.meta.updatedAt = now()
  saveSession(s)

  const durationMs = msg.duration_ms ?? now() - ls.turnStartedAt
  const hour = new Date().getHours()
  bumpStats({ turns: 1, totalTurnMs: durationMs, nightTurns: hour < 5 ? 1 : 0, earlyTurns: hour >= 5 && hour < 7 ? 1 : 0 })
  checkAchievements()

  pushItem(ls.id, {
    kind: 'result',
    id: randomUUID(),
    costUsd: delta,
    durationMs,
    turns: msg.num_turns,
    isError: msg.is_error,
    errors: msg.subtype === 'success' ? undefined : msg.errors,
    ts: now()
  })
  emit({ type: 'session-meta', meta: mustLoad(ls.id).meta })
  emit({ type: 'costs-changed' })
  setBusy(ls, false)
}

// ---------- aprovações ----------

const PREVIEW_MAX_CHARS = 1024 * 1024

function makeCanUseTool(ls: LiveSession): CanUseTool {
  return async (toolName, input, opts) => {
    const isEdit = toolName === 'Edit' || toolName === 'Write'

    if (isEdit) {
      const filePath = String(input.file_path ?? '')
      const exists = filePath !== '' && existsSync(filePath)
      const before = exists ? await readFile(filePath, 'utf8').catch(() => '') : ''
      const preview = toolName === 'Write' ? { after: String(input.content ?? '') } : previewEdit(before, input)
      const after = preview.after
      const change: PendingChange = { filePath, before, after, created: !exists }
      // "Aprovar todas da sessão" só vale dentro do workspace e fora de pastas sensíveis (resolve symlink/junction).
      const verdict = classifyEditTarget(ls.cwd, filePath)

      if (ls.autoApproveEdits && verdict === 'inside') {
        ls.pendingChanges.set(opts.toolUseID, change)
        return { behavior: 'allow', updatedInput: input }
      }
      const warn = verdict === 'outside' ? '⚠ Fora do workspace — ' : verdict === 'sensitive' ? '⚠ Pasta sensível — ' : ''
      // Arquivo grande: o renderer recebe só o começo de cada lado e marca a prévia como parcial (H05.4).
      const big = before.length > PREVIEW_MAX_CHARS || after.length > PREVIEW_MAX_CHARS
      return ask(ls, opts, input, {
        kind: toolName === 'Write' ? 'write' : 'edit',
        toolName,
        title: warn + (opts.title ?? `${toolName} ${toRel(filePath) ?? filePath}`),
        filePath,
        relPath: toRel(filePath) ?? filePath,
        before: big ? before.slice(0, PREVIEW_MAX_CHARS) : before,
        after: big ? after.slice(0, PREVIEW_MAX_CHARS) : after,
        previewPartial: big || undefined,
        isNewFile: !exists,
        previewError: 'error' in preview ? preview.error : undefined,
        scope: verdict === 'inside' ? undefined : verdict,
        allowAlways: verdict === 'inside'
      }, change)
    }

    // "Sempre nesta sessão" só vale com todos os caminhos da tool dentro do workspace (realpath, H05.5).
    const ts = toolScope(pathArgsOf(toolName, input), (p) => classifyEditTarget(ls.cwd, p))
    const allowAlways = ts.allowAlways && alwaysEligible(toolName)
    const where = { scope: ts.scope === 'inside' ? undefined : ts.scope, allowAlways }
    if (allowAlways && ls.alwaysAllowed.has(toolName)) return { behavior: 'allow', updatedInput: input }

    // Política por tool MCP: mcp__<server>__<tool>
    if (toolName.startsWith('mcp__')) {
      const [, server, ...rest] = toolName.split('__')
      const tool = rest.join('__')
      const entry = getMcpServers().find((m) => m.name === server)
      if (entry?.toolPolicies?.[tool] === 'auto') return { behavior: 'allow', updatedInput: input }
      return ask(ls, opts, input, {
        kind: 'tool',
        toolName,
        title: opts.title ?? `MCP ${server} → ${tool}`,
        input,
        mcpServer: server,
        ...where
      })
    }

    if (toolName === 'Bash') {
      return ask(ls, opts, input, {
        kind: 'command',
        toolName,
        title: opts.title ?? 'Executar comando',
        command: String(input.command ?? ''),
        description: typeof input.description === 'string' ? input.description : undefined,
        ...where
      })
    }

    return ask(ls, opts, input, { kind: 'tool', toolName, title: opts.title ?? toolName, input, ...where })
  }
}

function ask(
  ls: LiveSession,
  opts: Parameters<CanUseTool>[2],
  input: Record<string, unknown>,
  partial: Omit<ApprovalRequest, 'id' | 'sessionId' | 'ts'>,
  change?: PendingChange
): Promise<PermissionResult> {
  const req: ApprovalRequest = { ...partial, id: randomUUID(), sessionId: ls.id, ts: now() }
  return new Promise<PermissionResult>((resolve) => {
    pending.set(req.id, { req, input, resolve, change, toolUseID: opts.toolUseID })
    opts.signal.addEventListener('abort', () => {
      if (!pending.has(req.id)) return
      pending.delete(req.id)
      emit({ type: 'approval-resolved', id: req.id, sessionId: ls.id, approved: false })
      resolve({ behavior: 'deny', message: 'Operação cancelada.' })
    })
    emit({ type: 'approval', approval: req })
  })
}

export function decide(approvalId: string, decision: ApprovalDecision): void {
  const p = pending.get(approvalId)
  if (!p) return
  pending.delete(approvalId)
  const ls = live.get(p.req.sessionId)

  if (decision.approve) {
    // "Sempre"/"Aprovar todas" recusado no main quando o caminho sai do workspace ou a prévia não é confiável.
    if (decision.alwaysForSession && ls && p.req.allowAlways !== false && !p.req.previewPartial && !p.req.previewError) {
      if (p.req.kind === 'edit' || p.req.kind === 'write') ls.autoApproveEdits = true
      else ls.alwaysAllowed.add(p.req.toolName)
    }
    if (p.change && ls) ls.pendingChanges.set(p.toolUseID, p.change)
    bumpStats({ approved: 1 })
    p.resolve({ behavior: 'allow', updatedInput: p.input })
  } else {
    bumpStats({ rejected: 1 })
    const fb = decision.feedback?.trim()
    p.resolve({
      behavior: 'deny',
      message: fb ? `O usuário rejeitou esta ação com o comentário: ${fb}` : 'O usuário rejeitou esta ação. Pergunte como prosseguir.'
    })
  }
  emit({ type: 'approval-resolved', id: approvalId, sessionId: p.req.sessionId, approved: decision.approve })
  checkAchievements()
}

function rejectPendingFor(sessionId: string, reason: string): void {
  for (const [id, p] of pending) {
    if (p.req.sessionId !== sessionId) continue
    pending.delete(id)
    p.resolve({ behavior: 'deny', message: reason })
    emit({ type: 'approval-resolved', id, sessionId, approved: false })
  }
}

// ---------- rollback de alteração aplicada ----------

export async function revertChange(sessionId: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
  const s = mustLoad(sessionId)
  const item = s.items.find((i) => i.id === itemId)
  if (!item || item.kind !== 'change') return { ok: false, error: 'Alteração não encontrada.' }
  if (item.reverted) return { ok: false, error: 'Já revertida.' }

  let current = ''
  try {
    current = existsSync(item.filePath) ? await readFile(item.filePath, 'utf8') : ''
  } catch (err) {
    return { ok: false, error: `Não foi possível ler o arquivo: ${err instanceof Error ? err.message : String(err)}` }
  }
  const result = revertText(current, item.patch)
  if (!result.ok) return { ok: false, error: result.error }

  try {
    if (item.created && result.text === '') await unlink(item.filePath).catch(() => undefined)
    else await writeFile(item.filePath, result.text, 'utf8')
  } catch (err) {
    return { ok: false, error: `Não foi possível gravar o arquivo: ${err instanceof Error ? err.message : String(err)}` }
  }

  updateItem(sessionId, itemId, (it) => (it.kind === 'change' ? { ...it, reverted: true } : it))
  bumpStats({ reverts: 1 })
  checkAchievements()
  return { ok: true }
}
