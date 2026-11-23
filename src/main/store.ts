import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, rmSync, readdirSync, cpSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AchievementState,
  AgendaEvent,
  AppSettings,
  ChatItem,
  CommunityStats,
  DevProfile,
  IcsFeed,
  IcsFeedView,
  LedgerEntry,
  McpServerEntry,
  McpServerView,
  ProviderId,
  ProviderStats,
  SessionMeta
} from '@shared/types'
import { DEFAULT_UI, sanitizeUi } from '@shared/layout'
import { feedView, mcpView, migrateFeeds, migrateMcpList, sealFeed, sealMcp, unsealFeed, unsealMcp, type Cipher, type StoredIcsFeed, type StoredMcpEntry } from './lib/secrets'

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

/**
 * v0.4.0: env/headers de MCP e link ICS passam a ser cifrados. Migra o arquivo atual e a cópia legada
 * (%APPDATA%/vibedeck). Sem cofre do sistema, não mexe e marca `secretsPending` (a UI avisa).
 * Rode depois de `app.whenReady()` (o safeStorage exige no Linux/macOS).
 */
export function migrateSecrets(): void {
  let pending = false
  const legacyMcp = join(app.getPath('appData'), 'vibedeck', 'mcp-servers.json')
  for (const file of [mcpFile(), legacyMcp]) {
    if (!existsSync(file)) continue
    const r = migrateMcpList(readJson<StoredMcpEntry[]>(file, []), systemCipher)
    if (r.changed) writeJson(file, r.list)
    pending ||= r.pending
  }
  if (existsSync(agendaFile())) {
    const raw = getAgendaRaw()
    const r = migrateFeeds(raw.feeds, systemCipher)
    if (r.changed) writeJson(agendaFile(), { ...raw, feeds: r.list })
    pending ||= r.pending
  }
  secretsPending = pending
}

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

/** Grava via arquivo temporário + rename: nunca deixa JSON pela metade nem cópia antiga ao lado. */
function writeJson(file: string, data: unknown): void {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

// ---------- Cofre do sistema ----------

/** safeStorage como `Cipher`. No Linux, `basic_text` (senha fixa) não conta como cofre. */
export const systemCipher: Cipher = {
  available: () =>
    safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (enc) => safeStorage.decryptString(Buffer.from(enc, 'base64'))
}

let secretsPending = false

// ---------- Settings ----------

interface StoredSettings extends Omit<AppSettings, 'hasApiKey' | 'encryptionAvailable' | 'secretsPending'> {
  apiKeyEnc?: string // base64 do safeStorage
  settingsVersion?: number
}

const SETTINGS_VERSION = 3

/**
 * v0.3.0: carregar configurações do projeto passou a exigir confiança explícita. Instalações antigas que
 * gravaram loadProjectSettings: true voltam para desligado uma única vez.
 */
export function migrateSettings(): void {
  const file = settingsFile()
  if (!existsSync(file)) return
  const raw = readJson<Partial<StoredSettings>>(file, {})
  if ((raw.settingsVersion ?? 0) >= SETTINGS_VERSION) return
  writeJson(file, { ...raw, loadProjectSettings: false, settingsVersion: SETTINGS_VERSION })
}

const DEFAULT_SETTINGS: StoredSettings = {
  model: 'claude-opus-5-5',
  effort: 'high',
  dailyBudgetUsd: 10,
  sessionBudgetUsd: 0,
  loadProjectSettings: false,
  appendSystemPrompt: 'Responda sempre em português do Brasil.',
  spotifyUrl: '',
  lastWorkspace: null,
  ui: DEFAULT_UI,
  settingsVersion: SETTINGS_VERSION
}

const settingsFile = (): string => join(root(), 'settings.json')

function loadStoredSettings(): StoredSettings {
  const raw = { ...DEFAULT_SETTINGS, ...readJson<Partial<StoredSettings>>(settingsFile(), {}) }
  // Valor de disco fora da faixa (arquivo editado à mão, versão antiga) volta para o limite.
  return { ...raw, ui: sanitizeUi(raw.ui) }
}

export function getSettings(): AppSettings {
  const { apiKeyEnc, ...rest } = loadStoredSettings()
  return { ...rest, hasApiKey: Boolean(apiKeyEnc), encryptionAvailable: systemCipher.available(), secretsPending }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadStoredSettings()
  // Campos derivados nunca persistem.
  const { hasApiKey: _a, encryptionAvailable: _b, secretsPending: _c, ...clean } = patch
  writeJson(settingsFile(), { ...current, ...clean, ...(clean.ui ? { ui: sanitizeUi(clean.ui) } : {}) })
  return getSettings()
}

export function setApiKey(key: string | null): AppSettings {
  const current = loadStoredSettings()
  if (!key) {
    delete current.apiKeyEnc
  } else {
    if (!systemCipher.available()) throw new Error('Criptografia do sistema indisponível; chave não salva.')
    current.apiKeyEnc = systemCipher.encrypt(key.trim())
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

const readMcpRaw = (): StoredMcpEntry[] => readJson<StoredMcpEntry[]>(mcpFile(), [])

/** Servidores com segredos decifrados — só para uso no main (agente, teste de conexão). */
export function getMcpServers(): McpServerEntry[] {
  return readMcpRaw().map((s) => unsealMcp(s, systemCipher).entry)
}

/** Versão mascarada para o renderer. */
export function listMcpServerViews(): McpServerView[] {
  return readMcpRaw().map((s) => mcpView(s, systemCipher))
}

/** Cifra e grava. Sem cofre do sistema e com segredo na lista, recusa (não grava em claro). */
export function saveMcpServers(list: McpServerEntry[]): McpServerView[] {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
  const raw = new Map(readMcpRaw().map((s) => [s.name, s]))
  writeJson(
    mcpFile(),
    sorted.map((e) => {
      const prev = raw.get(e.name)
      // Segredo que não abriu agora (cofre bloqueado?) não é descartado por um salvamento sem segredos.
      const keepBlob = prev?.secretsEnc && !e.env && !e.headers && unsealMcp(prev, systemCipher).lost
      return keepBlob ? { ...sealMcp(e, systemCipher), secretsEnc: prev.secretsEnc } : sealMcp(e, systemCipher)
    })
  )
  return listMcpServerViews()
}

// ---------- Sessões ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids viram nome de arquivo: só UUID passa (evita .. e caminhos arbitrários). */
function assertUuid(id: string): string {
  if (!UUID.test(id)) throw new Error('Id inválido.')
  return id
}

const sessionFile = (id: string): string => join(sessionsDir(), `${assertUuid(id)}.json`)

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
    if (!systemCipher.available()) throw new Error('Criptografia do sistema indisponível; token não salvo.')
    all[id] = systemCipher.encrypt(token.trim())
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
  feeds: StoredIcsFeed[]
}

function getAgenda(): StoredAgenda {
  return { events: [], feeds: [], ...readJson<Partial<StoredAgenda>>(agendaFile(), {}) }
}

const getAgendaRaw = getAgenda

export function getAgendaEvents(): AgendaEvent[] {
  return getAgenda().events
}

export function saveAgendaEvents(events: AgendaEvent[]): AgendaEvent[] {
  writeJson(agendaFile(), { ...getAgenda(), events })
  return events
}

/** Feeds com o link decifrado — só para uso no main. */
export function getIcsFeeds(): IcsFeed[] {
  return getAgendaRaw().feeds.map((f) => unsealFeed(f, systemCipher).feed)
}

export function listIcsFeedViews(): IcsFeedView[] {
  return getAgendaRaw().feeds.map((f) => feedView(f, systemCipher))
}

/** Cifra o link e grava. Sem cofre do sistema, recusa. */
export function saveIcsFeeds(feeds: IcsFeed[]): IcsFeedView[] {
  const raw = getAgendaRaw()
  const prev = new Map(raw.feeds.map((f) => [f.id, f]))
  const sealed = feeds.map((f) => {
    const old = prev.get(f.id)
    // Link que não abriu agora (cofre bloqueado?) não é trocado por vazio só porque outro feed foi salvo.
    if (!f.url && old?.urlEnc) {
      const { url: _url, ...rest } = f
      return { ...rest, urlEnc: old.urlEnc }
    }
    return sealFeed(f, systemCipher)
  })
  writeJson(agendaFile(), { ...raw, feeds: sealed })
  return listIcsFeedViews()
}

const icsDir = (): string => join(root(), 'ics')

export function saveIcsText(feedId: string, text: string): void {
  mkdirSync(icsDir(), { recursive: true })
  writeFileSync(join(icsDir(), `${assertUuid(feedId)}.ics`), text, 'utf8')
}

export function readIcsText(feedId: string): string | null {
  const f = join(icsDir(), `${assertUuid(feedId)}.ics`)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

export function deleteIcsText(feedId: string): void {
  rmSync(join(icsDir(), `${assertUuid(feedId)}.ics`), { force: true })
}

// ---------- Workspaces confiados ----------

const trustFile = (): string => join(root(), 'trusted-workspaces.json')

type TrustMap = Record<string, { hash: string; trustedAt: number }>

const trustKey = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p)

export function getTrustedHash(rootReal: string): string | null {
  return readJson<TrustMap>(trustFile(), {})[trustKey(rootReal)]?.hash ?? null
}

export function trustWorkspace(rootReal: string, hash: string): void {
  const all = readJson<TrustMap>(trustFile(), {})
  all[trustKey(rootReal)] = { hash, trustedAt: Date.now() }
  writeJson(trustFile(), all)
}
