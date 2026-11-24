import type { IcsFeed, IcsFeedInput, IcsFeedView, McpServerEntry, McpServerInput, McpServerView } from '@shared/types'

// Segredos de configuração (env/headers de MCP, link ICS): cifrados em disco, mascarados para o renderer.
// Lógica pura: a cifra é injetada (safeStorage no main, cifra falsa nos testes).

export interface Cipher {
  /** false quando não há cofre do sistema (ou só `basic_text` no Linux). */
  available(): boolean
  encrypt(plain: string): string
  decrypt(enc: string): string
}

export const MASK = '••••'

export class SecretError extends Error {}

/** Máscara mostrada no renderer: só os 4 últimos caracteres, e só quando o valor é longo. */
export function maskValue(v: string): string {
  return v.length >= 16 ? `${MASK}${v.slice(-4)}` : MASK
}

/** Link ICS costuma carregar o token no caminho: mostra só esquema + host. */
export function maskIcsUrl(url: string): string {
  const m = /^(https|webcal):\/\/([^/?#@]+@)?([^/?#:]+)/i.exec(url)
  return m ? `${m[1].toLowerCase()}://${m[3]}/…` : MASK
}

const maskRecord = (rec?: Record<string, string>): Record<string, string> | undefined =>
  rec && Object.keys(rec).length ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, maskValue(v)])) : undefined

/** Mesmo destino = mesmo transporte, URL, comando e argumentos. Só assim um segredo guardado pode ser reaproveitado. */
export function sameTarget(a: Pick<McpServerEntry, 'type' | 'url' | 'command' | 'args'>, b: Pick<McpServerEntry, 'type' | 'url' | 'command' | 'args'>): boolean {
  const args = (x: string[] | undefined): string => JSON.stringify(x ?? [])
  return a.type === b.type && (a.url ?? '') === (b.url ?? '') && (a.command ?? '') === (b.command ?? '') && args(a.args) === args(b.args)
}

/**
 * Junta a entrada do renderer com os valores guardados.
 * `null` = manter (só com destino inalterado); string = substituir; chave ausente = remover.
 */
export function mergeSecrets(
  input: Record<string, string | null> | undefined,
  stored: Record<string, string> | undefined,
  keepAllowed: boolean,
  label: string
): Record<string, string> | undefined {
  if (!input) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null) {
      if (!keepAllowed) throw new SecretError(`O destino do servidor mudou: digite de novo o valor de ${label} "${k}".`)
      const prev = stored?.[k]
      if (prev === undefined) throw new SecretError(`Não há valor guardado para ${label} "${k}": digite o valor.`)
      out[k] = prev
    } else {
      if (v.startsWith(MASK)) throw new SecretError(`O valor de ${label} "${k}" é a máscara, não o segredo: digite o valor real ou deixe a linha como estava.`)
      out[k] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** Resolve uma entrada do renderer contra o servidor guardado (se houver) e devolve a entrada completa, só no main. */
/**
 * Variáveis que mudam como o processo carrega código ou para onde a rede vai: com elas novas ou alteradas,
 * um segredo mantido poderia ser desviado mesmo com o mesmo comando (security review da Sprint 04).
 */
const RISKY_ENV = /^(node_options|node_extra_ca_certs|node_tls_reject_unauthorized|node_path|ld_preload|ld_library_path|dyld_.*|.*_proxy|ssl_cert_file|requests_ca_bundle|python(path|startup)|electron_run_as_node)$/i

export function changesRiskyEnv(input: Record<string, string | null> | undefined, stored: Record<string, string> | undefined): boolean {
  return Object.entries(input ?? {}).some(([k, v]) => v !== null && RISKY_ENV.test(k) && stored?.[k] !== v)
}

/** Parâmetros de query com cara de credencial (H05.8): ficariam em claro no disco e na tela. */
const SECRET_QUERY = /^(token|access_?token|api_?key|apikey|key|secret|client_?secret|password|pass|pwd|auth|authorization|sig|signature|bearer|jwt|session|code)$/i

/** URL de MCP com credencial na query ou no usuário/senha → recusa com orientação. */
export function assertNoSecretInUrl(url: string | undefined): void {
  if (!url) return
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return
  }
  if (u.username || u.password) throw new SecretError('A URL do servidor tem usuário/senha embutidos: use um header (ex.: Authorization) em vez disso.')
  for (const k of u.searchParams.keys())
    if (SECRET_QUERY.test(k)) throw new SecretError(`A URL do servidor tem o parâmetro "${k}", que parece uma credencial e ficaria visível: mova para um header (ex.: Authorization: Bearer …).`)
}

/** Só esquema + host + caminho: query e credenciais nunca vão para log ou mensagem de erro. */
export function urlOrigin(url: string | undefined): string | undefined {
  if (!url) return url
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return MASK
  }
}

export function resolveMcpInput(input: McpServerInput, stored: McpServerEntry | undefined): McpServerEntry {
  if (input.type !== 'stdio') assertNoSecretInUrl(input.url)
  const { env, headers, ...rest } = input
  const keep = Boolean(stored) && sameTarget(input, stored!) && !changesRiskyEnv(env, stored?.env)
  return {
    ...rest,
    env: input.type === 'stdio' ? mergeSecrets(env, stored?.env, keep, 'variável') : undefined,
    headers: input.type !== 'stdio' ? mergeSecrets(headers, stored?.headers, keep, 'header') : undefined
  }
}

// ---------- Formato em disco ----------

/** Servidor como fica no arquivo: sem env/headers em claro. */
export interface StoredMcpEntry extends Omit<McpServerEntry, 'env' | 'headers'> {
  /** JSON `{ env, headers }` cifrado (base64). */
  secretsEnc?: string
  /** Só em arquivos antigos (antes da v0.4.0) ou não migrados. */
  env?: Record<string, string>
  headers?: Record<string, string>
}

const hasAny = (rec?: Record<string, string>): boolean => Boolean(rec && Object.keys(rec).length)

export function sealMcp(e: McpServerEntry, c: Cipher): StoredMcpEntry {
  const { env, headers, ...rest } = e
  if (!hasAny(env) && !hasAny(headers)) return rest
  if (!c.available()) throw new SecretError('Criptografia do sistema indisponível: segredos do MCP não foram salvos.')
  return { ...rest, secretsEnc: c.encrypt(JSON.stringify({ env, headers })) }
}

/** Decifra. `lost` = havia segredo e não deu para abrir (outra máquina/usuário, cofre trocado). */
export function unsealMcp(s: StoredMcpEntry, c: Cipher): { entry: McpServerEntry; lost: boolean } {
  const { secretsEnc, env, headers, ...rest } = s
  if (!secretsEnc) return { entry: { ...rest, env, headers }, lost: false }
  try {
    const parsed = JSON.parse(c.decrypt(secretsEnc)) as { env?: Record<string, string>; headers?: Record<string, string> }
    return { entry: { ...rest, env: parsed.env, headers: parsed.headers }, lost: false }
  } catch {
    return { entry: rest, lost: true }
  }
}

export function mcpView(s: StoredMcpEntry, c: Cipher): McpServerView {
  const { entry, lost } = unsealMcp(s, c)
  const { env, headers, ...rest } = entry
  return { ...rest, envMasked: maskRecord(env), headersMasked: maskRecord(headers), secretsLost: lost || undefined }
}

/** Cifra entradas antigas em claro. Sem cifra disponível, não mexe em nada. */
export function migrateMcpList(list: StoredMcpEntry[], c: Cipher): { list: StoredMcpEntry[]; changed: boolean; pending: boolean } {
  const plain = list.some((s) => hasAny(s.env) || hasAny(s.headers))
  if (!plain) return { list, changed: false, pending: false }
  if (!c.available()) return { list, changed: false, pending: true }
  const next = list.map((s) => {
    if (!hasAny(s.env) && !hasAny(s.headers)) return s
    const { entry } = unsealMcp({ ...s, secretsEnc: undefined }, c)
    // Se já havia blob cifrado, o valor em claro (mais antigo) não vence: só junta chaves ausentes.
    const prev = s.secretsEnc ? unsealMcp({ ...s, env: undefined, headers: undefined }, c).entry : undefined
    return sealMcp({ ...entry, env: { ...entry.env, ...prev?.env }, headers: { ...entry.headers, ...prev?.headers } }, c)
  })
  return { list: next, changed: true, pending: false }
}

// ---------- ICS ----------

export interface StoredIcsFeed extends Omit<IcsFeed, 'url'> {
  urlEnc?: string
  /** Só em arquivos antigos. */
  url?: string
}

export function sealFeed(f: IcsFeed, c: Cipher): StoredIcsFeed {
  const { url, ...rest } = f
  if (!c.available()) throw new SecretError('Criptografia do sistema indisponível: link do calendário não foi salvo.')
  return { ...rest, urlEnc: c.encrypt(url) }
}

export function unsealFeed(s: StoredIcsFeed, c: Cipher): { feed: IcsFeed; lost: boolean } {
  const { urlEnc, url, ...rest } = s
  if (!urlEnc) return { feed: { ...rest, url: url ?? '' }, lost: !url }
  try {
    const url = c.decrypt(urlEnc)
    return { feed: { ...rest, url }, lost: !url }
  } catch {
    return { feed: { ...rest, url: '' }, lost: true }
  }
}

export function feedView(s: StoredIcsFeed, c: Cipher): IcsFeedView {
  const { feed, lost } = unsealFeed(s, c)
  const { url, ...rest } = feed
  return { ...rest, urlMasked: url ? maskIcsUrl(url) : MASK, urlLost: lost || undefined }
}

export function migrateFeeds(list: StoredIcsFeed[], c: Cipher): { list: StoredIcsFeed[]; changed: boolean; pending: boolean } {
  const plain = list.some((f) => f.url)
  if (!plain) return { list, changed: false, pending: false }
  if (!c.available()) return { list, changed: false, pending: true }
  const next = list.map((f) => {
    if (!f.url) return f
    const { url, urlEnc: _old, ...rest } = f
    return sealFeed({ ...rest, url }, c)
  })
  return { list: next, changed: true, pending: false }
}

/**
 * Junta a entrada do renderer com o feed guardado. `url: ''` = manter o link atual.
 * lastSync/error/count do renderer são ignorados (só o main escreve).
 */
export function resolveFeedInput(input: IcsFeedInput, stored: IcsFeed | undefined): IcsFeed {
  const url = input.url.trim()
  if (url.includes('•') || url.includes('…')) throw new SecretError('Cole o link completo do calendário, não a máscara.')
  if (!url && !stored?.url) throw new SecretError('Informe o link do calendário.')
  return {
    id: input.id,
    name: input.name,
    enabled: input.enabled,
    remindMin: input.remindMin,
    url: url || stored!.url,
    lastSync: stored?.lastSync,
    error: stored?.error,
    count: stored?.count
  }
}

/** Remove valores de segredo de mensagens de erro antes de irem para o renderer. */
export function redact(message: string, secrets: (string | undefined)[]): string {
  let out = message
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join(MASK)
  return out
}

/** Todos os valores secretos de uma entrada (para `redact`), incluindo a query da URL. */
export function secretValues(e: McpServerEntry): string[] {
  let query: string[] = []
  if (e.url) {
    try {
      const u = new URL(e.url)
      query = [u.search.slice(1), ...[...u.searchParams.values()]].filter(Boolean)
    } catch {
      query = []
    }
  }
  return [...Object.values(e.env ?? {}), ...Object.values(e.headers ?? {}), ...query]
}
