// vt-scan (H07.5) contra um servidor HTTP real em 127.0.0.1, com o fetch do Node: redirect recusado,
// upload multipart de verdade e teto de tamanho da resposta. A base só entra por parâmetro (Sec).
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_RESPOSTA, scan } from '../../scripts/vt-scan.mjs'

const SHA = 'b'.repeat(64)
const CHAVE = 'chave-falsa-integracao-0000'
type Modo = 'normal' | 'redirect' | 'gigante'
let modo: Modo = 'normal'
const vistos: { path: string; apikey?: string; tipo?: string; tamanho: number }[] = []
let base = ''
let server: http.Server

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let tamanho = 0
    req.on('data', (c: Buffer) => (tamanho += c.length))
    req.on('end', () => {
      const path = req.url ?? '/'
      vistos.push({ path, apikey: req.headers['x-apikey'] as string | undefined, tipo: req.headers['content-type'], tamanho })
      const json = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      if (modo === 'redirect' && path.startsWith('/api/v3/files/')) {
        res.writeHead(302, { location: 'http://127.0.0.2:1/roubar' })
        res.end()
        return
      }
      if (modo === 'gigante') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(`{"data":"${'x'.repeat(MAX_RESPOSTA + 10)}"}`)
        return
      }
      if (path === `/api/v3/files/${SHA}`) return json(404, { error: { code: 'NotFoundError' } })
      if (path === '/api/v3/files/upload_url') return json(200, { data: `${base}/_ah/upload/abc` })
      if (path === '/_ah/upload/abc' && req.method === 'POST') return json(200, { data: { id: 'YW5hbGlzZQ==' } })
      if (path === '/api/v3/analyses/YW5hbGlzZQ%3D%3D')
        return json(200, { data: { attributes: { status: 'completed', stats: { malicious: 0, suspicious: 0, undetected: 70, harmless: 0 } } } })
      json(500, {})
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const rodar = () =>
  scan({ key: CHAVE, sha256: SHA, arquivo: new Blob([Buffer.alloc(256 * 1024, 7)]), nome: 'DevDeck-Setup-0.7.0.exe', base, sleep: async () => undefined, log: () => undefined })

describe('vt-scan com servidor real (H07.5)', () => {
  it('fluxo completo: lookup 404 → upload multipart com o arquivo → análise', async () => {
    modo = 'normal'
    vistos.length = 0
    expect(await rodar()).toEqual({ status: 'ok', sha256: SHA, stats: { malicious: 0, suspicious: 0, undetected: 70, harmless: 0 } })
    const up = vistos.find((v) => v.path === '/_ah/upload/abc')
    expect(up?.tipo).toMatch(/^multipart\/form-data; boundary=/)
    expect(up?.tamanho).toBeGreaterThan(256 * 1024)
    expect(vistos.every((v) => v.apikey === CHAVE)).toBe(true)
  })

  it('redirect: o fetch recusa (a chave não segue para outro host) → pendente', async () => {
    modo = 'redirect'
    vistos.length = 0
    expect(await rodar()).toMatchObject({ status: 'pendente', motivo: 'api' })
    expect(vistos).toHaveLength(1)
  })

  it('resposta maior que o teto → pendente, sem guardar o corpo', async () => {
    modo = 'gigante'
    expect(await rodar()).toMatchObject({ status: 'pendente', motivo: 'api' })
  })
})
