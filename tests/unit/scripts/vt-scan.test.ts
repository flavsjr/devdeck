import { describe, expect, it } from 'vitest'
import { campo, scan, statsValidas, uploadUrlValida, VT_ORIGIN, type OpcoesScan } from '../../../scripts/vt-scan.mjs'

const SHA = 'a'.repeat(64)
const STATS = { malicious: 0, suspicious: 1, undetected: 60, harmless: 0, timeout: 2 }
const CHAVE = 'chave-falsa-do-teste-0000'

type Rota = (url: string, init: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>

/** fetch falso: responde pela rota e guarda cada pedido (url, método, headers, redirect). */
function fakeFetch(rota: Rota) {
  const pedidos: { url: string; method: string; headers: Record<string, string>; redirect?: RequestInit['redirect'] }[] = []
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    pedidos.push({ url, method: init.method ?? 'GET', headers: { ...(init.headers as Record<string, string>) }, redirect: init.redirect })
    const r = await rota(url, init)
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status })
  }) as typeof fetch
  return { f, pedidos }
}

function opcoes(f: typeof fetch, over: Partial<OpcoesScan> = {}): OpcoesScan & { linhas: string[] } {
  const linhas: string[] = []
  let t = 0
  return {
    key: CHAVE,
    sha256: SHA,
    arquivo: new Blob(['MZ instalador falso']),
    nome: 'DevDeck-Setup-0.7.0.exe',
    fetch: f,
    sleep: async (ms) => {
      t += ms
    },
    now: () => t,
    log: (l) => linhas.push(l),
    linhas,
    ...over
  }
}

const UPLOAD = `${VT_ORIGIN}/_ah/upload/abc`
const fluxoUpload =
  (analises: Array<{ status: number; body?: unknown }>): Rota =>
  (url) => {
    if (url.endsWith(`/files/${SHA}`)) return { status: 404, body: { error: { code: 'NotFoundError' } } }
    if (url.endsWith('/files/upload_url')) return { status: 200, body: { data: UPLOAD } }
    if (url === UPLOAD) return { status: 200, body: { data: { type: 'analysis', id: 'ZTRiNjgx==' } } }
    if (url.includes('/analyses/')) return analises.shift() ?? { status: 200, body: { data: { attributes: { status: 'queued' } } } }
    return { status: 500 }
  }

describe('vt-scan (H07.5)', () => {
  it('sem chave: pendente sem nenhum pedido', async () => {
    const { f, pedidos } = fakeFetch(() => ({ status: 500 }))
    expect(await scan(opcoes(f, { key: undefined }))).toEqual({ status: 'pendente', sha256: SHA, motivo: 'sem-chave' })
    expect(await scan(opcoes(f, { key: '' }))).toMatchObject({ motivo: 'sem-chave' })
    expect(pedidos).toHaveLength(0)
  })

  it('arquivo já conhecido: usa o lookup, sem upload; só as 4 contagens', async () => {
    const { f, pedidos } = fakeFetch(() => ({ status: 200, body: { data: { attributes: { last_analysis_stats: STATS } } } }))
    expect(await scan(opcoes(f))).toEqual({ status: 'ok', sha256: SHA, stats: { malicious: 0, suspicious: 1, undetected: 60, harmless: 0 } })
    expect(pedidos.map((p) => p.url)).toEqual([`${VT_ORIGIN}/api/v3/files/${SHA}`])
  })

  it('todo pedido leva a chave só no x-apikey e com redirect: "error"', async () => {
    const { f, pedidos } = fakeFetch(fluxoUpload([{ status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }]))
    await scan(opcoes(f))
    expect(pedidos.length).toBe(4)
    for (const p of pedidos) {
      expect(p.redirect).toBe('error')
      expect(p.headers['x-apikey']).toBe(CHAVE)
      expect(p.url).not.toContain(CHAVE)
    }
  })

  it('desconhecido: upload pelo upload_url e polling até completar', async () => {
    const { f, pedidos } = fakeFetch(
      fluxoUpload([
        { status: 200, body: { data: { attributes: { status: 'queued' } } } },
        { status: 429 },
        { status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }
      ])
    )
    const o = opcoes(f)
    expect(await scan(o)).toMatchObject({ status: 'ok', stats: { suspicious: 1, undetected: 60 } })
    expect(pedidos.filter((p) => p.method === 'POST').map((p) => p.url)).toEqual([UPLOAD])
    expect(pedidos.filter((p) => p.url.includes('/analyses/'))).toHaveLength(3)
    expect(o.linhas.join('\n')).not.toContain(CHAVE)
  })

  it('polling respeita a cota: 1ª espera de 60 s, depois 20 s', async () => {
    const esperas: number[] = []
    const { f } = fakeFetch(fluxoUpload([{ status: 200, body: { data: { attributes: { status: 'queued' } } } }, { status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }]))
    let t = 0
    await scan(
      opcoes(f, {
        sleep: async (ms) => {
          esperas.push(ms)
          t += ms
        },
        now: () => t
      })
    )
    expect(esperas).toEqual([60_000, 20_000])
  })

  it('análise que não termina em 10 min: pendente "tempo"', async () => {
    const { f, pedidos } = fakeFetch(fluxoUpload([]))
    expect(await scan(opcoes(f))).toMatchObject({ status: 'pendente', motivo: 'tempo' })
    // 60 s + 20 s × n < 600 s → 28 consultas no máximo (cabe em 4/min e em 500/dia)
    expect(pedidos.filter((p) => p.url.includes('/analyses/')).length).toBeLessThanOrEqual(28)
  })

  it('upload_url de outra origem: pendente, sem enviar o arquivo nem a chave para lá', async () => {
    for (const fora of ['https://evil.example/upload', 'https://www.virustotal.com.evil.example/x', 'http://www.virustotal.com/x', 'https://user@evil.example', 'não é url']) {
      const { f, pedidos } = fakeFetch((url) => (url.endsWith(`/files/${SHA}`) ? { status: 404 } : url.endsWith('/upload_url') ? { status: 200, body: { data: fora } } : { status: 200 }))
      expect(await scan(opcoes(f)), fora).toMatchObject({ status: 'pendente', motivo: 'api' })
      expect(pedidos.some((p) => p.method === 'POST')).toBe(false)
    }
  })

  it('API fora, chave recusada, cota, rede: pendente com motivo fechado (o release segue)', async () => {
    const casos: Array<[number, string]> = [
      [500, 'api'],
      [401, 'api'],
      [403, 'api'],
      [429, 'cota']
    ]
    for (const [status, motivo] of casos) {
      const { f } = fakeFetch(() => ({ status }))
      expect(await scan(opcoes(f)), String(status)).toMatchObject({ status: 'pendente', motivo })
    }
    const quebrado = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    expect(await scan(opcoes(quebrado))).toMatchObject({ status: 'pendente', motivo: 'api' })
  })

  it('id de análise estranho ou stats inválidas: pendente', async () => {
    const idRuim = fakeFetch((url) =>
      url.endsWith(`/files/${SHA}`) ? { status: 404 } : url.endsWith('/upload_url') ? { status: 200, body: { data: UPLOAD } } : { status: 200, body: { data: { id: '../../x?y' } } }
    )
    expect(await scan(opcoes(idRuim.f))).toMatchObject({ motivo: 'api' })
    const statsRuins = fakeFetch(fluxoUpload([{ status: 200, body: { data: { attributes: { status: 'completed', stats: { malicious: '1', suspicious: 0, undetected: 0, harmless: 0 } } } } }]))
    expect(await scan(opcoes(statsRuins.f))).toMatchObject({ motivo: 'api' })
  })

  it('lookup 200 sem análise (total zero) cai no upload', async () => {
    let lookup = 0
    const { f } = fakeFetch((url, init) => {
      if (url.endsWith(`/files/${SHA}`)) {
        lookup++
        return { status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } } } } }
      }
      return fluxoUpload([{ status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }])(url, init)
    })
    expect(await scan(opcoes(f))).toMatchObject({ status: 'ok' })
    expect(lookup).toBe(1)
  })
})

describe('vt-scan: validação pura', () => {
  it('statsValidas: só inteiros 0–1000, total > 0, sem campos extras', () => {
    expect(statsValidas(STATS)).toEqual({ malicious: 0, suspicious: 1, undetected: 60, harmless: 0 })
    for (const ruim of [null, 'x', {}, { ...STATS, malicious: -1 }, { ...STATS, harmless: 1.5 }, { ...STATS, undetected: 1e6 }, { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 }]) {
      expect(statsValidas(ruim)).toBeNull()
    }
  })

  it('campo: caminho em JSON desconhecido, sem herdar do protótipo', () => {
    expect(campo({ a: { b: 1 } }, 'a', 'b')).toBe(1)
    expect(campo({ a: 1 }, 'a', 'b')).toBeUndefined()
    expect(campo({}, 'constructor')).toBeUndefined()
    expect(campo(null, 'a')).toBeUndefined()
  })

  it('uploadUrlValida: origem exata', () => {
    expect(uploadUrlValida(`${VT_ORIGIN}/_ah/upload/x`, VT_ORIGIN)).toBe(`${VT_ORIGIN}/_ah/upload/x`)
    expect(uploadUrlValida('https://www.virustotal.com:443/x', VT_ORIGIN)).not.toBeNull()
    expect(uploadUrlValida('https://www.virustotal.com:8443/x', VT_ORIGIN)).toBeNull()
    expect(uploadUrlValida(42, VT_ORIGIN)).toBeNull()
    expect(uploadUrlValida(`${VT_ORIGIN}/${'x'.repeat(3000)}`, VT_ORIGIN)).toBeNull()
  })
})
