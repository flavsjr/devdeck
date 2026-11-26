// Scan do instalador no VirusTotal (H07.5 da Sprint 07, ADR-019). Roda só no job `scan` do release.yml,
// no environment `release` (restrito a tags v*.*.*), sem npm e sem dependências.
// Uso no CI: node scripts/vt-scan.mts <instalador.exe> <vt.json>
//
// Fluxo: lookup por sha256 → se o VT não conhece, upload via upload_url (o instalador passa de 32 MB) →
// polling (1ª espera de 60 s, depois a cada 20 s, teto de 10 min; respeita 4 pedidos/min da chave grátis).
// Qualquer falha vira "pendente" com um motivo de lista fechada e o release segue (exit 0).
//
// Condições da Sec (D5, ajuste aceito na H07.5):
// - a chave só vem de VT_API_KEY no env; nada de header, corpo cru ou URL com chave em log ou erro;
// - fetch com redirect: 'error' (num redirect o x-apikey iria junto);
// - upload_url precisa ter a origem exata da API (new URL().origin), senão "pendente";
// - a URL base só muda por parâmetro de função (testes); nunca por env ou argv;
// - resposta com teto de tamanho e parse defensivo: a saída do VT é dado não confiável.
import { createHash } from 'node:crypto'
import { createReadStream, openAsBlob, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

export const VT_ORIGIN = 'https://www.virustotal.com'
export const MOTIVOS = ['sem-chave', 'api', 'cota', 'tempo'] as const
export type Motivo = (typeof MOTIVOS)[number]

export interface Stats {
  malicious: number
  suspicious: number
  undetected: number
  harmless: number
}
export type VtResultado = { status: 'ok'; sha256: string; stats: Stats } | { status: 'pendente'; sha256: string; motivo: Motivo }

/** Teto de uma resposta JSON da API (as do VT têm poucos KB; o relatório de arquivo, algumas dezenas). */
export const MAX_RESPOSTA = 2 * 1024 * 1024

export interface OpcoesScan {
  key: string | undefined
  sha256: string
  arquivo: Blob
  nome: string
  /** Só nos testes (servidor falso em 127.0.0.1). No CI é sempre VT_ORIGIN. */
  base?: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  primeiraEsperaMs?: number
  intervaloMs?: number
  tetoMs?: number
  log?: (linha: string) => void
}

const contagem = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000

/** As 4 contagens do VT, ou null se faltar alguma, não for inteira ou o total for zero. */
export function statsValidas(raw: unknown): Stats | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { malicious, suspicious, undetected, harmless } = raw as Record<string, unknown>
  if (!contagem(malicious) || !contagem(suspicious) || !contagem(undetected) || !contagem(harmless)) return null
  if (malicious + suspicious + undetected + harmless === 0) return null
  return { malicious, suspicious, undetected, harmless }
}

/** Segue um caminho de chaves num JSON desconhecido; undefined se algo no caminho não for objeto. */
export function campo(raw: unknown, ...caminho: string[]): unknown {
  let v = raw
  for (const k of caminho) {
    if (typeof v !== 'object' || v === null || !Object.hasOwn(v, k)) return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return v
}

/** upload_url aceita só com a origem exata da base (https://www.virustotal.com no CI). */
export function uploadUrlValida(u: unknown, base: string): string | null {
  if (typeof u !== 'string' || u.length > 2048) return null
  try {
    return new URL(u).origin === new URL(base).origin ? u : null
  } catch {
    return null
  }
}

const ID_ANALISE_RE = /^[A-Za-z0-9=_:-]{1,200}$/

async function lerLimitado(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      throw new Error('resposta grande demais')
    }
    partes.push(value)
  }
  return Buffer.concat(partes).toString('utf8')
}

export async function scan(o: OpcoesScan): Promise<VtResultado> {
  const base = o.base ?? VT_ORIGIN
  const f = o.fetch ?? fetch
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = o.now ?? Date.now
  const log = o.log ?? ((l: string) => console.log(l))
  const pendente = (motivo: Motivo): VtResultado => {
    log(`VirusTotal: scan pendente (${motivo})`)
    return { status: 'pendente', sha256: o.sha256, motivo }
  }
  const ok = (stats: Stats): VtResultado => {
    log(`VirusTotal: ${stats.malicious + stats.suspicious} de ${stats.malicious + stats.suspicious + stats.undetected + stats.harmless} marcaram`)
    return { status: 'ok', sha256: o.sha256, stats }
  }
  if (!o.key) return pendente('sem-chave')
  const key = o.key

  /** Um pedido à API. Nunca lança: erro de rede, redirect ou resposta grande demais viram status 0. */
  const pedir = async (url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<{ status: number; json: unknown }> => {
    try {
      const res = await f(url, {
        ...init,
        headers: { accept: 'application/json', 'x-apikey': key },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      })
      const texto = await lerLimitado(res, MAX_RESPOSTA)
      let json: unknown = null
      try {
        json = JSON.parse(texto)
      } catch {
        json = null
      }
      return { status: res.status, json }
    } catch {
      return { status: 0, json: null }
    }
  }
  const falha = (status: number): VtResultado => pendente(status === 429 ? 'cota' : 'api')

  // 1) Lookup: o VT já conhece este sha256?
  const lookup = await pedir(`${base}/api/v3/files/${o.sha256}`)
  log(`VirusTotal: lookup HTTP ${lookup.status}`)
  if (lookup.status === 200) {
    const stats = statsValidas(campo(lookup.json, 'data', 'attributes', 'last_analysis_stats'))
    if (stats) return ok(stats)
  } else if (lookup.status !== 404) return falha(lookup.status)

  // 2) Upload pelo upload_url (aceita arquivo grande).
  const urlPedido = await pedir(`${base}/api/v3/files/upload_url`)
  if (urlPedido.status !== 200) return falha(urlPedido.status)
  const uploadUrl = uploadUrlValida(campo(urlPedido.json, 'data'), base)
  if (!uploadUrl) return pendente('api')
  const form = new FormData()
  form.append('file', o.arquivo, o.nome)
  const up = await pedir(uploadUrl, { method: 'POST', body: form }, 10 * 60_000)
  log(`VirusTotal: upload HTTP ${up.status}`)
  if (up.status !== 200) return falha(up.status)
  const id = campo(up.json, 'data', 'id')
  if (typeof id !== 'string' || !ID_ANALISE_RE.test(id)) return pendente('api')

  // 3) Polling da análise.
  const limite = now() + (o.tetoMs ?? 10 * 60_000)
  await sleep(o.primeiraEsperaMs ?? 60_000)
  while (now() < limite) {
    const a = await pedir(`${base}/api/v3/analyses/${encodeURIComponent(id)}`)
    if (a.status === 200 && campo(a.json, 'data', 'attributes', 'status') === 'completed') {
      const stats = statsValidas(campo(a.json, 'data', 'attributes', 'stats'))
      return stats ? ok(stats) : pendente('api')
    }
    // 429 no meio do polling: só espera mais (a cota volta no minuto seguinte).
    if (a.status !== 200 && a.status !== 429) return falha(a.status)
    await sleep(o.intervaloMs ?? 20_000)
  }
  return pendente('tempo')
}

async function sha256Arquivo(p: string): Promise<string> {
  const h = createHash('sha256')
  for await (const parte of createReadStream(p)) h.update(parte as Buffer)
  return h.digest('hex')
}

const isMain = import.meta.main ?? (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/vt-scan.mts')
if (isMain) {
  const instalador = process.argv[2] ?? ''
  const out = process.argv[3] ?? ''
  if (!instalador.endsWith('.exe') || !out || process.argv.length !== 4) {
    console.error('Uso: node scripts/vt-scan.mts <instalador.exe> <vt.json>')
    process.exit(1)
  }
  // Falha local (ler o instalador, hash) também vira "pendente": o motivo chega às notas (DevOps).
  let sha256 = ''
  let r: VtResultado
  try {
    sha256 = await sha256Arquivo(instalador)
    r = await scan({ key: process.env.VT_API_KEY, sha256, arquivo: await openAsBlob(instalador), nome: basename(instalador) })
  } catch {
    console.log('VirusTotal: scan pendente (falha local ao ler o instalador)')
    r = { status: 'pendente', sha256, motivo: 'api' }
  }
  writeFileSync(out, `${JSON.stringify(r)}\n`)
  console.log(`vt-scan: ${sha256 || '(sem sha)'} → ${out} (${r.status})`)
}
