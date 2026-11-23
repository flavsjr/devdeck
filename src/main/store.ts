import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, rmSync, readdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AchievementState,
  AgendaEvent,
  AppSettings,
  ChatItem,
  CommunityStats,
  DevProfile,
  IcsFeed,
  LedgerEntry,
  McpServerEntry,
  ProviderId,
  ProviderStats,
  SessionMeta
} from '@shared/types'

// Persistência simples em JSON dentro de %APPDATA%/DevDeck.

const root = (): string => app.getPath('userData')

/** Copia dados da época "VibeDeck" (%APPDATA%/vibedeck) na primeira execução como DevDeck. */
export function migrateLegacyData(): void {
  const legacy = join(app.getPath('appData'), 'vibedeck')
  if (existsSync(join(root(), 'settings.json')) || !existsSync(legacy)) return
  mkdirSync(root(), { recursive: true })
  for (const name of ['settings.json', 'mcp-servers.json', 'ledger.jsonl', 'stats.json', 'sessions']) {
    const src = join(legacy, name)
    if (existsSync(src)) cpSync(src, join(root(), name), { recursive: true })
  }
}
const sessionsDir = (): string => join(root(), 'sessions')

function ensureDirs(): void {
  mkdirSync(sessionsDir(), { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  ensureDirs()
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

// ---------- Settings ----------

interface StoredSettings extends Omit<AppSettings, 'hasApiKey'> {
  apiKeyEnc?: string // base64 do safeStorage
}

const DEFAULT_SETTINGS: StoredSettings = {
  model: 'claude-opus-5-5',
  effort: 'high',
  dailyBudgetUsd: 10,
  sessionBudgetUsd: 0,
  loadProjectSettings: true,
  appendSystemPrompt: 'Responda sempre em português do Brasil.',
  spotifyUrl: '',
  lastWorkspace: null
}

const settingsFile = (): string => join(root(), 'settings.json')

function loadStoredSettings(): StoredSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<StoredSettings>>(settingsFile(), {}) }
}

export function getSettings(): AppSettings {
  const { apiKeyEnc, ...rest } = loadStoredSettings()
  return { ...rest, hasApiKey: Boolean(apiKeyEnc) }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadStoredSettings()
  // hasApiKey é derivado; nunca persiste.
  const { hasApiKey: _ignored, ...clean } = patch
  writeJson(settingsFile(), { ...current, ...clean })
  return getSettings()
}

export function setApiKey(key: string | null): AppSettings {
  const current = loadStoredSettings()
  if (!key) {
    delete current.apiKeyEnc
  } else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema indisponível; chave não salva.')
    current.apiKeyEnc = safeStorage.encryptString(key.trim()).toString('base64')
  }
  writeJson(settingsFile(), current)
  return getSettings()
}

export function getApiKey(): string | null {
  const enc = loadStoredSettings().apiKeyEnc
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

// ---------- MCP ----------

const mcpFile = (): string => join(root(), 'mcp-servers.json')

export function getMcpServers(): McpServerEntry[] {
  return readJson<McpServerEntry[]>(mcpFile(), [])
}

export function saveMcpServers(list: McpServerEntry[]): McpServerEntry[] {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
  writeJson(mcpFile(), sorted)
  return sorted
}

// ---------- Sessões ----------

const sessionFile = (id: string): string => join(sessionsDir(), `${id}.json`)

interface StoredSession {
  meta: SessionMeta
  items: ChatItem[]
  /** Último total cumulativo reportado pelo SDK, para calcular deltas de custo. */
  lastTotalCostUsd: number
  lastModelUsage: Record<string, { costUSD: number; inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }>
}

export function listSessions(): SessionMeta[] {
  ensureDirs()
  return readdirSync(sessionsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<StoredSession | null>(join(sessionsDir(), f), null)?.meta)
    .filter((m): m is SessionMeta => Boolean(m))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadSession(id: string): StoredSession | null {
  return readJson<StoredSession | null>(sessionFile(id), null)
}

export function saveSession(s: StoredSession): void {
  writeJson(sessionFile(s.meta.id), s)
}

export function deleteSession(id: string): void {
  rmSync(sessionFile(id), { force: true })
}

export type { StoredSession }

// ---------- Ledger de custos (JSONL append-only) ----------

const ledgerFile = (): string => join(root(), 'ledger.jsonl')

export function appendLedger(entries: LedgerEntry[]): void {
  if (!entries.length) return
  ensureDirs()
  appendFileSync(ledgerFile(), entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
}

export function readLedger(): LedgerEntry[] {
  if (!existsSync(ledgerFile())) return []
  return readFileSync(ledgerFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerEntry]
      } catch {
        return []
      }
    })
}

// ---------- Métricas ----------

export interface Stats {
  approved: number
  rejected: number
  turns: number
  totalTurnMs: number
  reverts: number
  focusSessions: number
  nightTurns: number
  earlyTurns: number
  eventsCreated: number
}

const ZERO_STATS: Stats = {
  approved: 0,
  rejected: 0,
  turns: 0,
  totalTurnMs: 0,
  reverts: 0,
  focusSessions: 0,
  nightTurns: 0,
  earlyTurns: 0,
  eventsCreated: 0
}

const statsFile = (): string => join(root(), 'stats.json')

export function getStats(): Stats {
  return { ...ZERO_STATS, ...readJson<Partial<Stats>>(statsFile(), {}) }
}

/** Soma os valores do patch aos contadores atuais. */
export function bumpStats(patch: Partial<Stats>): void {
  const s = getStats()
  for (const [k, v] of Object.entries(patch) as [keyof Stats, number][]) s[k] += v
  writeJson(statsFile(), s)
}

// ---------- Segredos dos provedores git (criptografados) ----------

const secretsFile = (): string => join(root(), 'secrets.json')

export function setProviderToken(id: ProviderId, token: string | null): void {
  const all = readJson<Partial<Record<ProviderId, string>>>(secretsFile(), {})
  if (!token) delete all[id]
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema indisponível; token não salvo.')
    all[id] = safeStorage.encryptString(token.trim()).toString('base64')
  }
  writeJson(secretsFile(), all)
}

export function getProviderToken(id: ProviderId): string | null {
  const enc = readJson<Partial<Record<ProviderId, string>>>(secretsFile(), {})[id]
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

// ---------- Perfil, cache de provedores, conquistas ----------

const profileFile = (): string => join(root(), 'profile.json')

export interface StoredProfile extends DevProfile {
  gitlabBaseUrl?: string
  community?: CommunityStats
}

export function getProfile(): StoredProfile {
  return { displayName: '', headline: '', featured: [], ...readJson<Partial<StoredProfile>>(profileFile(), {}) }
}

export function saveProfile(patch: Partial<StoredProfile>): StoredProfile {
  const next = { ...getProfile(), ...patch }
  writeJson(profileFile(), next)
  return next
}

const providerCacheFile = (): string => join(root(), 'provider-stats.json')

export function getProviderCache(): ProviderStats[] {
  return readJson<ProviderStats[]>(providerCacheFile(), [])
}

export function saveProviderCache(stats: ProviderStats[]): void {
  writeJson(providerCacheFile(), stats)
}

const achievementsFile = (): string => join(root(), 'achievements.json')

export function getAchievementStates(): Record<string, AchievementState> {
  return readJson<Record<string, AchievementState>>(achievementsFile(), {})
}

export function saveAchievementStates(states: Record<string, AchievementState>): void {
  writeJson(achievementsFile(), states)
}

// ---------- Agenda ----------

const agendaFile = (): string => join(root(), 'agenda.json')

interface StoredAgenda {
  events: AgendaEvent[]
  feeds: IcsFeed[]
}

function getAgenda(): StoredAgenda {
  return { events: [], feeds: [], ...readJson<Partial<StoredAgenda>>(agendaFile(), {}) }
}

export function getAgendaEvents(): AgendaEvent[] {
  return getAgenda().events
}

export function saveAgendaEvents(events: AgendaEvent[]): AgendaEvent[] {
  writeJson(agendaFile(), { ...getAgenda(), events })
  return events
}

export function getIcsFeeds(): IcsFeed[] {
  return getAgenda().feeds
}

export function saveIcsFeeds(feeds: IcsFeed[]): IcsFeed[] {
  writeJson(agendaFile(), { ...getAgenda(), feeds })
  return feeds
}

const icsDir = (): string => join(root(), 'ics')

export function saveIcsText(feedId: string, text: string): void {
  mkdirSync(icsDir(), { recursive: true })
  writeFileSync(join(icsDir(), `${feedId}.ics`), text, 'utf8')
}

export function readIcsText(feedId: string): string | null {
  const f = join(icsDir(), `${feedId}.ics`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

export function deleteIcsText(feedId: string): void {
  rmSync(join(icsDir(), `${feedId}.ics`), { force: true })
}
