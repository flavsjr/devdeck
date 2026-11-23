// Tipos compartilhados entre main, preload e renderer.

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AppSettings {
  model: string
  effort: EffortLevel | ''
  /** Teto diário (USD) — alerta visual ao passar de 80% e 100%. 0 = sem teto. */
  dailyBudgetUsd: number
  /** Teto por sessão (USD), repassado ao SDK como maxBudgetUsd. 0 = sem teto. */
  sessionBudgetUsd: number
  /** Carrega CLAUDE.md e .claude/settings.json do projeto. */
  loadProjectSettings: boolean
  appendSystemPrompt: string
  spotifyUrl: string
  hasApiKey: boolean
  /** Derivado: cofre do sistema disponível para cifrar segredos. Nunca persiste. */
  encryptionAvailable: boolean
  /** Derivado: há segredos antigos em texto puro esperando o cofre do sistema. Nunca persiste. */
  secretsPending: boolean
  lastWorkspace: string | null
}

export type McpTransport = 'stdio' | 'http' | 'sse'
export type ToolPolicy = 'auto' | 'ask'

export interface McpServerEntry {
  name: string
  enabled: boolean
  type: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  /** Política por tool (nome curto da tool no servidor). Ausente = 'ask'. */
  toolPolicies?: Record<string, ToolPolicy>
}

/** Como o renderer vê um servidor MCP: valores de env/headers só como máscara. */
export interface McpServerView extends Omit<McpServerEntry, 'env' | 'headers'> {
  envMasked?: Record<string, string>
  headersMasked?: Record<string, string>
  /** Havia segredo guardado que não pôde ser decifrado (redigite). */
  secretsLost?: boolean
}

/**
 * Entrada do renderer para salvar/testar. Valor `null` = manter o valor guardado,
 * aceito só se transporte, URL, comando e argumentos não mudaram.
 */
export interface McpServerInput extends Omit<McpServerEntry, 'env' | 'headers'> {
  env?: Record<string, string | null>
  headers?: Record<string, string | null>
}

export interface McpTestResult {
  ok: boolean
  error?: string
  serverName?: string
  serverVersion?: string
  tools: { name: string; description?: string; readOnly?: boolean }[]
  resources: { uri: string; name?: string }[]
  prompts: { name: string; description?: string }[]
  ms: number
}

export interface TreeNode {
  name: string
  path: string // relativo ao workspace, separador '/'
  dir: boolean
  size?: number
}

export interface FileContent {
  path: string
  content: string | null
  truncated: boolean
  binary: boolean
  size: number
}

export interface GitFileChange {
  path: string
  status: string // M, A, D, R, ?? ...
}

export interface GitStatus {
  isRepo: boolean
  branch?: string
  files: GitFileChange[]
}

// ---------- Chat / agente ----------

export interface SessionMeta {
  id: string
  title: string
  cwd: string
  claudeSessionId?: string
  createdAt: number
  updatedAt: number
  totalCostUsd: number
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string; context?: string[]; ts: number }
  | { kind: 'assistant'; id: string; text: string; ts: number }
  | { kind: 'thinking'; id: string; ts: number }
  | { kind: 'tool'; id: string; toolUseId: string; name: string; summary: string; input: unknown; ts: number; result?: string; isError?: boolean }
  | { kind: 'change'; id: string; filePath: string; patch: string; created: boolean; reverted?: boolean; ts: number }
  | { kind: 'result'; id: string; costUsd: number; durationMs: number; turns: number; isError: boolean; errors?: string[]; ts: number }
  | { kind: 'error'; id: string; text: string; ts: number }

export type ApprovalKind = 'edit' | 'write' | 'command' | 'tool'

export interface ApprovalRequest {
  id: string
  sessionId: string
  kind: ApprovalKind
  toolName: string
  title: string
  /** edit/write */
  filePath?: string
  relPath?: string
  before?: string
  after?: string
  isNewFile?: boolean
  /** command */
  command?: string
  description?: string
  /** tool genérica / MCP */
  input?: unknown
  mcpServer?: string
  ts: number
}

export type ApprovalDecision =
  | { approve: true; alwaysForSession?: boolean }
  | { approve: false; feedback?: string }

export interface SessionInfo {
  model?: string
  tools?: string[]
  mcpServers?: { name: string; status: string }[]
  apiKeySource?: string
  permissionMode?: string
}

export type AgentEvent =
  | { type: 'item'; sessionId: string; item: ChatItem }
  | { type: 'item-update'; sessionId: string; item: ChatItem }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'busy'; sessionId: string; busy: boolean }
  | { type: 'info'; sessionId: string; info: SessionInfo }
  | { type: 'context'; sessionId: string; used: number; window: number }
  | { type: 'approval'; approval: ApprovalRequest }
  | { type: 'approval-resolved'; id: string; sessionId: string; approved: boolean }
  | { type: 'session-meta'; meta: SessionMeta }
  | { type: 'costs-changed' }
  | { type: 'achievement'; def: AchievementDef }
  | { type: 'reminder'; occurrence: Occurrence; minutesLeft: number }
  | { type: 'agenda-changed' }

// ---------- Custos ----------

export interface LedgerEntry {
  ts: number
  sessionId: string
  model: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface ModelTotals {
  model: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface CostSummary {
  todayUsd: number
  monthUsd: number
  allTimeUsd: number
  dailyBudgetUsd: number
  byModelMonth: ModelTotals[]
  last14Days: { day: string; costUsd: number }[]
  bySession: { sessionId: string; title: string; costUsd: number }[]
  approvals: { approved: number; rejected: number }
  turns: number
  avgTurnMs: number
}

// ---------- Perfil e provedores git ----------

export type ProviderId = 'github' | 'gitlab' | 'bitbucket'

export interface ProviderConfig {
  id: ProviderId
  connected: boolean
  /** GitLab self-hosted. Padrão https://gitlab.com */
  baseUrl?: string
}

export interface ProviderStats {
  provider: ProviderId
  login: string
  name?: string
  avatarUrl?: string
  profileUrl?: string
  /** YYYY-MM-DD → commits (GitHub: contribuições) */
  days: Record<string, number>
  commits: number
  pullRequests: number
  reviews: number
  repos: { name: string; url?: string; language?: string; commits: number }[]
  languages: { name: string; count: number }[]
  windowDays: number
  fetchedAt: number
  error?: string
}

export interface DevProfile {
  displayName: string
  headline: string
  /** Até 3 conquistas em destaque. */
  featured: string[]
}

export interface LocalStats {
  turns: number
  approved: number
  rejected: number
  reverts: number
  focusSessions: number
  nightTurns: number
  earlyTurns: number
  eventsCreated: number
  mcpEnabled: number
  aiCostMonth: number
}

export interface ProfileSummary {
  profile: DevProfile
  providers: ProviderConfig[]
  stats: ProviderStats[]
  totals: {
    days: Record<string, number>
    commits: number
    pullRequests: number
    reviews: number
    activeDays: number
    currentStreak: number
    longestStreak: number
    languages: { name: string; count: number }[]
  }
  local: LocalStats
}

// ---------- Conquistas ----------

export type MetricKey =
  | 'turns'
  | 'approved'
  | 'rejected'
  | 'reverts'
  | 'focusSessions'
  | 'nightTurns'
  | 'earlyTurns'
  | 'eventsCreated'
  | 'icsFeeds'
  | 'mcpEnabled'
  | 'providers'
  | 'commits'
  | 'pullRequests'
  | 'reviews'
  | 'longestStreak'
  | 'languages'
  | 'profileComplete'
  | 'articles'
  | 'snippets'
  | 'likesReceived'

export type AchievementCategory = 'ia' | 'git' | 'foco' | 'agenda' | 'comunidade'

export interface AchievementDef {
  id: string
  title: string
  description: string
  icon: string
  category: AchievementCategory
  metric: MetricKey
  target: number
  xp: number
}

export interface AchievementState {
  id: string
  progress: number
  unlockedAt?: number
}

export interface AchievementsSummary {
  states: Record<string, AchievementState>
  xp: number
  level: number
  levelStartXp: number
  nextLevelXp: number
}

export interface CommunityStats {
  articles: number
  snippets: number
  likesReceived: number
}

// ---------- Agenda ----------

export type Recurrence = { kind: 'none' } | { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'weekly'; days: number[] }
export type EventKind = 'daily' | 'meeting' | 'reminder' | 'focus'

export interface AgendaEvent {
  id: string
  title: string
  notes?: string
  /** Data/hora local 'YYYY-MM-DDTHH:mm' da primeira ocorrência. */
  start: string
  durationMin: number
  recurrence: Recurrence
  /** Minutos de antecedência do lembrete. 0 = sem lembrete. */
  remindMin: number
  link?: string
  kind: EventKind
  /** Última data 'YYYY-MM-DD' (inclusive) para recorrentes. */
  until?: string
}

export interface IcsFeed {
  id: string
  name: string
  url: string
  enabled: boolean
  remindMin: number
  lastSync?: number
  error?: string
  count?: number
}

/** Feed como o renderer vê: o link (que carrega token) vira só esquema + host. */
export interface IcsFeedView extends Omit<IcsFeed, 'url'> {
  urlMasked: string
  urlLost?: boolean
}

/** Entrada do renderer: `url: ''` mantém o link guardado. */
export type IcsFeedInput = Pick<IcsFeed, 'id' | 'name' | 'url' | 'enabled' | 'remindMin'>

export interface Occurrence {
  key: string
  source: 'local' | 'ics'
  eventId: string
  feedName?: string
  title: string
  start: number
  end: number
  kind: EventKind
  link?: string
  notes?: string
  location?: string
  allDay?: boolean
}

// ---------- API exposta pelo preload ----------

export interface DeckApi {
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    setApiKey(key: string | null): Promise<AppSettings>
  }
  workspace: {
    pick(): Promise<string | null>
    list(relDir: string): Promise<TreeNode[]>
    read(relPath: string): Promise<FileContent>
  }
  git: {
    status(): Promise<GitStatus>
    diff(relPath: string): Promise<{ before: string; after: string }>
    restore(relPath: string): Promise<void>
  }
  mcp: {
    list(): Promise<McpServerView[]>
    save(entry: McpServerInput, previousName?: string): Promise<McpServerView[]>
    remove(name: string): Promise<McpServerView[]>
    /** previousName: servidor guardado de onde vêm os segredos mantidos (null). */
    test(entry: McpServerInput, previousName?: string): Promise<McpTestResult>
    importClaude(): Promise<{ imported: string[]; servers: McpServerView[] }>
  }
  agent: {
    sessions(): Promise<SessionMeta[]>
    create(title?: string): Promise<SessionMeta>
    load(id: string): Promise<{ meta: SessionMeta; items: ChatItem[]; busy: boolean; approvals: ApprovalRequest[] }>
    rename(id: string, title: string): Promise<SessionMeta>
    remove(id: string): Promise<void>
    send(id: string, text: string, context: string[]): Promise<void>
    interrupt(id: string): Promise<void>
    decide(approvalId: string, decision: ApprovalDecision): Promise<void>
    revertChange(sessionId: string, itemId: string): Promise<{ ok: boolean; error?: string }>
    onEvent(cb: (e: AgentEvent) => void): () => void
  }
  costs: {
    summary(): Promise<CostSummary>
  }
  profile: {
    get(): Promise<ProfileSummary>
    refresh(): Promise<ProfileSummary>
    update(patch: Partial<DevProfile>): Promise<ProfileSummary>
    setToken(id: ProviderId, token: string | null, baseUrl?: string): Promise<ProfileSummary>
  }
  achievements: {
    get(): Promise<AchievementsSummary>
    reportCommunity(stats: CommunityStats): Promise<void>
    focusCompleted(): Promise<void>
  }
  agenda: {
    occurrences(fromMs: number, toMs: number): Promise<Occurrence[]>
    events(): Promise<AgendaEvent[]>
    save(ev: AgendaEvent): Promise<AgendaEvent[]>
    remove(id: string): Promise<AgendaEvent[]>
    feeds(): Promise<IcsFeedView[]>
    saveFeed(feed: IcsFeedInput): Promise<IcsFeedView[]>
    removeFeed(id: string): Promise<IcsFeedView[]>
    syncFeeds(): Promise<IcsFeedView[]>
  }
  openExternal(url: string): Promise<void>
}
