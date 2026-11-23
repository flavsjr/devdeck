import { createHash } from 'node:crypto'

// Resumo das configurações de projeto que executam código (hooks, permissões, MCPs, helpers)
// para o diálogo "confiar neste workspace". Puro: quem chama lê os arquivos.

export interface ProjectConfigSummary {
  hooks: string[]
  allow: string[]
  env: string[]
  helpers: string[]
  mcpServers: string[]
  invalid: string[]
  hash: string
  risky: boolean
}

const HELPER_KEYS = ['apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'gcpAuthRefresh', 'otelHeadersHelper', 'statusLine']
/** Chaves que trazem código ou ampliam acesso sem passar pela aprovação do DevDeck. */
const EXTENSION_KEYS = ['enabledPlugins', 'extraKnownMarketplaces', 'additionalMarketplaces', 'plugins']

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

export function summarizeProjectConfig(settingsText: string | null, mcpText: string | null): ProjectConfigSummary {
  const invalid: string[] = []
  const hooks: string[] = []
  const allow: string[] = []
  const env: string[] = []
  const helpers: string[] = []
  const mcpServers: string[] = []

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
    }
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

  const hash = `${sha(settingsText)}:${sha(mcpText)}`
  const risky = [hooks, allow, env, helpers, mcpServers, invalid].some((l) => l.length > 0)
  return { hooks, allow, env, helpers, mcpServers, invalid, hash, risky }
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
    block('Arquivos inválidos', s.invalid)
  ]
    .filter(Boolean)
    .join('\n')
}
