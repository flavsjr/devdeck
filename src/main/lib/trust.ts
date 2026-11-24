import { createHash } from 'node:crypto'

// Resumo das configurações de projeto que executam código (hooks, permissões, MCPs, helpers)
// para o diálogo "confiar neste workspace". Puro: quem chama lê os arquivos.

export interface ProjectConfigSummary {
  hooks: string[]
  allow: string[]
  env: string[]
  helpers: string[]
  mcpServers: string[]
  /** Chaves de settings.json que o DevDeck não reconhece (H05.5): pedem confiança. */
  unknown: string[]
  invalid: string[]
  /** Outros arquivos em .claude/ (skills, comandos, agentes…): carregam com as configurações do projeto. */
  claudeFiles: string[]
  /** .claude/ grande demais para conferir: pergunta sempre (falha fechada). */
  overflow: boolean
  hash: string
  risky: boolean
}

const HELPER_KEYS = ['apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh', 'otelHeadersHelper', 'statusLine']
/** Chaves que trazem código ou ampliam acesso sem passar pela aprovação do DevDeck. */
const EXTENSION_KEYS = ['enabledPlugins', 'extraKnownMarketplaces', 'additionalMarketplaces', 'plugins']

/**
 * Chaves de topo de settings.json que o DevDeck conhece: as que só guardam preferência e as que já
 * são resumidas acima. Qualquer outra pede confiança (lista de permitidas, H05.5).
 */
const KNOWN_KEYS = new Set([
  '$schema',
  'model',
  'cleanupPeriodDays',
  'includeCoAuthoredBy',
  'includeGitInstructions',
  'attribution',
  'outputStyle',
  'language',
  'alwaysThinkingEnabled',
  'spinnerTipsEnabled',
  'respectGitignore',
  'companyAnnouncements',
  'hooks',
  'permissions',
  'env',
  'enableAllProjectMcpServers',
  'enabledMcpjsonServers',
  'disabledMcpjsonServers',
  ...HELPER_KEYS,
  ...EXTENSION_KEYS
])
/** Dentro de `permissions`, só estas passam sem diálogo (as outras ampliam acesso ou são desconhecidas). */
const KNOWN_PERMISSION_KEYS = new Set(['deny', 'ask'])
const RESUMED_PERMISSION_KEYS = new Set(['allow', 'additionalDirectories', 'defaultMode'])

/** Texto do repositório é não confiável: tira caracteres de controle/bidi e corta com reticências. */
export function clip(text: string, max = 200): string {
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function sha(text: string | null): string {
  return createHash('sha256')
    .update(text ?? '<ausente>')
    .digest('hex')
}

function tryParse(text: string | null, label: string, invalid: string[]): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const v: unknown = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    invalid.push(`${label}: não é um objeto JSON`)
  } catch {
    invalid.push(`${label}: JSON inválido`)
  }
  return null
}

function describeHook(h: unknown): string {
  if (!h || typeof h !== 'object') return '?'
  const o = h as Record<string, unknown>
  const body = o.command ?? o.prompt ?? o.url ?? o.tool ?? o.type ?? '?'
  return `${clip(String(o.type ?? 'command'), 40)}: ${clip(String(body))}`
}

// ---------- .claude/** (Sprint 04, H04.7) ----------

export interface ClaudeDirEntry {
  /** Caminho relativo a .claude/, com separador já normalizado ou não (normalizamos aqui). */
  path: string
  kind: 'file' | 'link' | 'other'
  /** sha256 do conteúdo (arquivo) ou alvo do link. */
  digest: string
}

export interface ClaudeDirScan {
  entries: ClaudeDirEntry[]
  overflow: boolean
}

/** Limites da varredura: acima disso o diálogo aparece sempre e a confiança não é guardada. */
export const CLAUDE_DIR_LIMITS = { files: 400, bytes: 4 * 1024 * 1024, depth: 8 }

/** settings.json já é resumido à parte; settings.local.json é do próprio usuário e não vem com a fonte 'project'. */
const ROOT_IGNORED = new Set(['settings.json', 'settings.local.json'])

const normPath = (p: string): string => p.split('\\').join('/').replace(/^\.\//, '')

/** Lista e hash determinísticos (ordem e separador normalizados) do que existe em .claude/. */
export function summarizeClaudeDir(scan: ClaudeDirScan): { files: string[]; hash: string } {
  const entries = scan.entries
    .map((e) => ({ ...e, path: normPath(e.path) }))
    .filter((e) => !ROOT_IGNORED.has(e.path.toLowerCase()))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const files = entries.map((e) => (e.kind === 'link' ? `${clip(e.path, 160)} (link)` : e.kind === 'other' ? `${clip(e.path, 160)} (especial)` : clip(e.path, 160)))
  // JSON evita ambiguidade quando o nome do arquivo contém separadores.
  const hash = sha(JSON.stringify(entries.map((e) => [e.kind, e.path, e.digest])))
  return { files, hash }
}

export function summarizeProjectConfig(settingsText: string | null, mcpText: string | null, claudeDir?: ClaudeDirScan): ProjectConfigSummary {
  const invalid: string[] = []
  const hooks: string[] = []
  const allow: string[] = []
  const env: string[] = []
  const helpers: string[] = []
  const mcpServers: string[] = []
  const unknown: string[] = []

  const settings = tryParse(settingsText, '.claude/settings.json', invalid)
  if (settings) {
    const h = settings.hooks
    if (h && typeof h === 'object') {
      for (const [event, groups] of Object.entries(h as Record<string, unknown>)) {
        for (const g of Array.isArray(groups) ? groups : []) {
          const matcher = g && typeof g === 'object' ? (g as Record<string, unknown>).matcher : undefined
          const list = g && typeof g === 'object' ? (g as Record<string, unknown>).hooks : undefined
          for (const hook of Array.isArray(list) ? list : []) hooks.push(`${clip(event, 60)}${matcher ? `[${clip(String(matcher), 80)}]` : ''} → ${describeHook(hook)}`)
        }
      }
    }
    const perms = settings.permissions
    if (perms && typeof perms === 'object') {
      const a = (perms as Record<string, unknown>).allow
      if (Array.isArray(a)) allow.push(...a.map((x) => clip(String(x))))
      const dirs = (perms as Record<string, unknown>).additionalDirectories
      if (Array.isArray(dirs)) allow.push(...dirs.map((d) => `additionalDirectories: ${clip(String(d))}`))
      const mode = (perms as Record<string, unknown>).defaultMode
      if (typeof mode === 'string' && mode !== 'default') allow.push(`defaultMode: ${clip(mode, 40)}`)
      for (const k of Object.keys(perms as object))
        if (!KNOWN_PERMISSION_KEYS.has(k) && !RESUMED_PERMISSION_KEYS.has(k)) unknown.push(`permissions.${clip(k, 60)}`)
    }
    for (const k of Object.keys(settings)) if (!KNOWN_KEYS.has(k)) unknown.push(clip(k, 60))
    if (settings.env && typeof settings.env === 'object') env.push(...Object.keys(settings.env as object).map((k) => clip(k, 80)))
    for (const k of HELPER_KEYS) if (settings[k] !== undefined) helpers.push(`${k}: ${clip(JSON.stringify(settings[k]))}`)
    for (const k of EXTENSION_KEYS) if (settings[k] !== undefined) helpers.push(`${k}: ${clip(JSON.stringify(settings[k]))}`)
    if (settings.enableAllProjectMcpServers === true) helpers.push('enableAllProjectMcpServers: true')
  }

  const mcp = tryParse(mcpText, '.mcp.json', invalid)
  const servers = mcp?.mcpServers
  if (servers && typeof servers === 'object') {
    for (const [name, cfg] of Object.entries(servers as Record<string, unknown>)) {
      const c = (cfg ?? {}) as Record<string, unknown>
      const target = c.command ? [c.command, ...(Array.isArray(c.args) ? c.args : [])].join(' ') : String(c.url ?? '?')
      mcpServers.push(`${clip(name, 80)}: ${clip(target)}`)
    }
  }

  const dir = claudeDir ? summarizeClaudeDir(claudeDir) : { files: [], hash: '' }
  // Link em .claude/ aponta para conteúdo fora do hash: pergunta sempre, como no overflow (security review).
  const overflow = Boolean(claudeDir?.overflow) || Boolean(claudeDir?.entries.some((e) => e.kind === 'link'))
  const claudeFiles = dir.files.slice(0, 40)
  if (dir.files.length > claudeFiles.length) claudeFiles.push(`… e mais ${dir.files.length - claudeFiles.length} arquivo(s)`)
  // Sem arquivos extras o hash mantém o formato antigo: confiança dada antes da v0.4.0 continua valendo.
  const hash = `${sha(settingsText)}:${sha(mcpText)}${dir.files.length ? `:${dir.hash}` : ''}`
  const risky = overflow || [hooks, allow, env, helpers, mcpServers, unknown, invalid, claudeFiles].some((l) => l.length > 0)
  return { hooks, allow, env, helpers, mcpServers, unknown, invalid, claudeFiles, overflow, hash, risky }
}

/** Texto do diálogo de confiança. */
export function describeSummary(s: ProjectConfigSummary): string {
  const block = (title: string, items: string[]): string => (items.length ? `${title}:\n${items.map((i) => `  • ${i}`).join('\n')}\n` : '')
  return [
    block('Hooks (executam comandos sem pedir aprovação)', s.hooks),
    block('Permissões liberadas sem aprovação', s.allow),
    block('Variáveis de ambiente', s.env),
    block('Comandos auxiliares', s.helpers),
    block('Servidores MCP do projeto (.mcp.json)', s.mcpServers),
    block('Chaves não reconhecidas (o DevDeck não sabe o que fazem)', s.unknown),
    block('Arquivos inválidos', s.invalid),
    block('Outros arquivos em .claude/ (skills, comandos e agentes podem pedir ferramentas e hooks)', s.claudeFiles),
    s.overflow ? `A pasta .claude/ tem links ou passa de ${CLAUDE_DIR_LIMITS.files} arquivos ou ${CLAUDE_DIR_LIMITS.bytes / 1024 / 1024} MB: o DevDeck não consegue conferir tudo e vai perguntar toda vez.` : '',
    s.claudeFiles.length || s.hooks.length ? 'Scripts chamados por hooks ou skills fora de .claude/ não são conferidos.' : ''
  ]
    .filter(Boolean)
    .join('\n')
}
