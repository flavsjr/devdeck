import { describe, expect, it } from 'vitest'
import type { McpServerEntry, McpServerInput } from '../../../src/shared/types'
import {
  MASK,
  SecretError,
  assertNoSecretInUrl,
  feedView,
  maskIcsUrl,
  maskValue,
  mcpView,
  mergeSecrets,
  migrateFeeds,
  migrateMcpList,
  redact,
  resolveFeedInput,
  resolveMcpInput,
  sameTarget,
  sealFeed,
  sealMcp,
  secretValues,
  unsealFeed,
  unsealMcp,
  urlOrigin,
  type Cipher,
  type StoredMcpEntry
} from '../../../src/main/lib/secrets'

/** Cifra falsa e reversível: prova que nada sai em claro sem depender do safeStorage. */
const cipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (p) => `enc:${Buffer.from(p, 'utf8').toString('base64')}`,
  decrypt: (e) => {
    if (!e.startsWith('enc:')) throw new Error('blob inválido')
    return Buffer.from(e.slice(4), 'base64').toString('utf8')
  }
})

// Valor obviamente falso, montado em tempo de execução para não parecer credencial ao gitleaks.
const TOKEN = ['FAKE', 'x'.repeat(16), 'WXYZ'].join('-')
const gh: McpServerEntry = { name: 'github', enabled: true, type: 'stdio', command: 'npx', args: ['-y', 'server-github'], env: { GITHUB_TOKEN: TOKEN } }
const remote: McpServerEntry = { name: 'remoto', enabled: true, type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: `Bearer ${TOKEN}` } }

describe('máscaras', () => {
  it('maskValue mostra só os 4 últimos e só em valores longos', () => {
    expect(maskValue(TOKEN)).toBe(`${MASK}WXYZ`)
    expect(maskValue('curto')).toBe(MASK)
    expect(maskValue('')).toBe(MASK)
  })

  it('maskIcsUrl mostra só esquema e host (o token mora no caminho ou no usuário)', () => {
    expect(maskIcsUrl('https://outlook.office365.com/owa/calendar/abc/SECRETO/calendar.ics')).toBe('https://outlook.office365.com/…')
    expect(maskIcsUrl('webcal://user:senha@cal.example.com:8443/x.ics?token=1')).toBe('webcal://cal.example.com/…')
    expect(maskIcsUrl('lixo')).toBe(MASK)
  })
})

describe('sameTarget', () => {
  it('compara transporte, URL, comando e argumentos', () => {
    expect(sameTarget(gh, { ...gh })).toBe(true)
    expect(sameTarget(gh, { ...gh, command: 'node' })).toBe(false)
    expect(sameTarget(gh, { ...gh, args: ['-y', 'outro'] })).toBe(false)
    expect(sameTarget(remote, { ...remote, url: 'https://evil.example.com/mcp' })).toBe(false)
    expect(sameTarget(remote, { ...remote, type: 'sse' })).toBe(false)
  })
})

describe('mergeSecrets', () => {
  it('null mantém o guardado; string substitui; chave ausente some', () => {
    expect(mergeSecrets({ A: null, B: 'novo' }, { A: 'velho', C: 'x' }, true, 'variável')).toEqual({ A: 'velho', B: 'novo' })
  })
  it('null com destino alterado é recusado', () => {
    expect(() => mergeSecrets({ A: null }, { A: 'velho' }, false, 'header')).toThrow(SecretError)
  })
  it('null sem valor guardado é recusado', () => {
    expect(() => mergeSecrets({ A: null }, {}, true, 'variável')).toThrow(/Não há valor guardado/)
  })
  it('a máscara nunca vira valor', () => {
    expect(() => mergeSecrets({ A: `${MASK}WXYZ` }, { A: 'velho' }, true, 'variável')).toThrow(/máscara/)
  })
  it('entrada vazia → undefined', () => {
    expect(mergeSecrets({}, { A: 'x' }, true, 'variável')).toBeUndefined()
    expect(mergeSecrets(undefined, { A: 'x' }, true, 'variável')).toBeUndefined()
  })
})

describe('resolveMcpInput (B1: segredo não vai para destino novo)', () => {
  it('liga/desliga mantendo o token', () => {
    const r = resolveMcpInput({ ...gh, enabled: false, env: { GITHUB_TOKEN: null } }, gh)
    expect(r.env).toEqual({ GITHUB_TOKEN: TOKEN })
    expect(r.enabled).toBe(false)
  })
  it('mesmo nome com outra URL e header "mantido" → recusa', () => {
    expect(() => resolveMcpInput({ ...remote, url: 'https://evil.example.com/mcp', headers: { Authorization: null } }, remote)).toThrow(SecretError)
  })
  it('mesmo nome com outro comando e env "mantido" → recusa', () => {
    expect(() => resolveMcpInput({ ...gh, command: 'node', args: ['steal.js'], env: { GITHUB_TOKEN: null } }, gh)).toThrow(SecretError)
  })
  it('destino novo com segredo redigitado → aceita', () => {
    const r = resolveMcpInput({ ...remote, url: 'https://novo.example.com/mcp', headers: { Authorization: 'Bearer outro' } }, remote)
    expect(r.headers).toEqual({ Authorization: 'Bearer outro' })
  })
  it('servidor novo sem guardado e com null → recusa', () => {
    expect(() => resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null } }, undefined)).toThrow(SecretError)
  })
  it('stdio descarta headers; http descarta env', () => {
    expect(resolveMcpInput({ ...gh, env: { A: 'x' }, headers: { B: 'y' } }, undefined).headers).toBeUndefined()
    expect(resolveMcpInput({ ...remote, env: { A: 'x' }, headers: { B: 'y' } }, undefined).env).toBeUndefined()
  })
})

describe('seal/unseal de MCP', () => {
  it('nada de env/headers em claro no formato gravado', () => {
    const stored = sealMcp(gh, cipher())
    expect(JSON.stringify(stored)).not.toContain(TOKEN)
    expect(stored.env).toBeUndefined()
    expect(unsealMcp(stored, cipher()).entry.env).toEqual(gh.env)
  })
  it('sem segredo não exige cofre', () => {
    const plain: McpServerEntry = { name: 'fs', enabled: true, type: 'stdio', command: 'npx' }
    expect(sealMcp(plain, cipher(false))).toEqual(plain)
  })
  it('com segredo e sem cofre → recusa (nunca grava em claro)', () => {
    expect(() => sealMcp(gh, cipher(false))).toThrow(/indisponível/)
  })
  it('blob corrompido → lost, sem derrubar', () => {
    const r = unsealMcp({ ...gh, env: undefined, secretsEnc: 'corrompido' }, cipher())
    expect(r.lost).toBe(true)
    expect(r.entry.env).toBeUndefined()
  })
  it('a view só leva máscara', () => {
    const view = mcpView(sealMcp(remote, cipher()), cipher())
    expect(JSON.stringify(view)).not.toContain(TOKEN)
    expect(view.headersMasked).toEqual({ Authorization: `${MASK}WXYZ` })
  })
})

describe('migrateMcpList', () => {
  it('cifra entradas antigas e é idempotente', () => {
    const legacy: StoredMcpEntry[] = [gh, { name: 'fs', enabled: true, type: 'stdio', command: 'npx' }]
    const first = migrateMcpList(legacy, cipher())
    expect(first.changed).toBe(true)
    expect(JSON.stringify(first.list)).not.toContain(TOKEN)
    const second = migrateMcpList(first.list, cipher())
    expect(second.changed).toBe(false)
    expect(second.list).toEqual(first.list)
    expect(unsealMcp(first.list[0], cipher()).entry.env).toEqual(gh.env)
  })
  it('sem cofre não mexe e marca pendente', () => {
    const r = migrateMcpList([gh], cipher(false))
    expect(r).toMatchObject({ changed: false, pending: true })
    expect(r.list[0]).toEqual(gh)
  })
  it('valor já cifrado vence o resto em claro da mesma chave', () => {
    const mixed: StoredMcpEntry = { ...sealMcp(gh, cipher()), env: { GITHUB_TOKEN: 'antigo', EXTRA: '1' } }
    const r = migrateMcpList([mixed], cipher())
    expect(unsealMcp(r.list[0], cipher()).entry.env).toEqual({ GITHUB_TOKEN: TOKEN, EXTRA: '1' })
  })
})

describe('ICS', () => {
  const feed = { id: '5b0f8f8e-6d6f-4a8e-9a43-0f2a3c7a1b11', name: 'Trabalho', url: 'https://cal.example.com/SECRETO/basic.ics', enabled: true, remindMin: 10 }

  it('link cifrado em disco e só host na view', () => {
    const stored = sealFeed(feed, cipher())
    expect(JSON.stringify(stored)).not.toContain('SECRETO')
    expect(unsealFeed(stored, cipher()).feed.url).toBe(feed.url)
    const view = feedView(stored, cipher())
    expect(view.urlMasked).toBe('https://cal.example.com/…')
    expect(JSON.stringify(view)).not.toContain('SECRETO')
  })
  it('sem cofre → recusa', () => {
    expect(() => sealFeed(feed, cipher(false))).toThrow(/indisponível/)
  })
  it('blob ilegível → urlLost', () => {
    expect(feedView({ ...feed, url: undefined, urlEnc: 'x' }, cipher()).urlLost).toBe(true)
  })
  it('migrateFeeds cifra links antigos e é idempotente', () => {
    const r = migrateFeeds([feed], cipher())
    expect(r.changed).toBe(true)
    expect(JSON.stringify(r.list)).not.toContain('SECRETO')
    expect(migrateFeeds(r.list, cipher()).changed).toBe(false)
    expect(migrateFeeds([feed], cipher(false))).toMatchObject({ changed: false, pending: true })
  })
  it('resolveFeedInput: "" mantém o link e ignora estado vindo do renderer', () => {
    const stored = { ...feed, lastSync: 5, count: 3 }
    const r = resolveFeedInput({ id: feed.id, name: 'Novo', url: '', enabled: false, remindMin: 5 }, stored)
    expect(r).toMatchObject({ url: feed.url, name: 'Novo', enabled: false, lastSync: 5, count: 3 })
  })
  it('resolveFeedInput: máscara ou vazio sem guardado → recusa', () => {
    expect(() => resolveFeedInput({ id: '', name: 'x', url: 'https://cal.example.com/…', enabled: true, remindMin: 0 }, undefined)).toThrow(/máscara/)
    expect(() => resolveFeedInput({ id: '', name: 'x', url: '', enabled: true, remindMin: 0 }, undefined)).toThrow(/Informe/)
  })
})

describe('redact', () => {
  it('tira segredos de mensagens de erro', () => {
    expect(redact(`401 em https://x/?t=${TOKEN}`, [TOKEN])).toBe(`401 em https://x/?t=${MASK}`)
    expect(redact('erro', [undefined, '', 'ab'])).toBe('erro')
  })
})

describe('env perigosa exige redigitar segredos (security review)', () => {
  it('NODE_OPTIONS novo com token "mantido" → recusa', () => {
    expect(() => resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null, NODE_OPTIONS: '--import=data:text/javascript,x' } }, gh)).toThrow(SecretError)
  })
  it('HTTPS_PROXY novo com token "mantido" → recusa', () => {
    expect(() => resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null, HTTPS_PROXY: 'http://evil:8080' } }, gh)).toThrow(SecretError)
  })
  it('variável comum nova mantém o token', () => {
    expect(resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null, LOG_LEVEL: 'debug' } }, gh).env).toEqual({ GITHUB_TOKEN: TOKEN, LOG_LEVEL: 'debug' })
  })
  it('env perigosa já guardada e inalterada não bloqueia', () => {
    const stored = { ...gh, env: { ...gh.env, HTTPS_PROXY: 'http://corp:3128' } }
    expect(resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null, HTTPS_PROXY: null } }, stored).env).toEqual(stored.env)
    expect(resolveMcpInput({ ...gh, env: { GITHUB_TOKEN: null, HTTPS_PROXY: 'http://corp:3128' } }, stored).env).toEqual(stored.env)
  })
})

describe('URL de MCP sem credencial (H05.8)', () => {
  const http = (url: string): McpServerInput => ({ name: 'remoto', enabled: true, type: 'http', url })
  it('token na query é recusado com orientação de header', () => {
    for (const u of ['https://mcp.example.com/sse?token=abc', 'https://mcp.example.com/?api_key=x', 'https://mcp.example.com/?Access_Token=x', 'https://h/?x-api-key=1', 'https://h/?private_token=1', 'https://h/?auth_token=1', 'https://h/?api-key=1'])
      expect(() => resolveMcpInput(http(u), undefined), u).toThrow(/header/)
  })
  it('usuário e senha na URL são recusados', () => {
    expect(() => resolveMcpInput(http('https://u:p@mcp.example.com/'), undefined)).toThrow(/usuário\/senha/)
  })
  it('query sem credencial passa; stdio não é conferido', () => {
    expect(resolveMcpInput(http('https://mcp.example.com/mcp?version=2'), undefined).url).toBe('https://mcp.example.com/mcp?version=2')
    expect(() => assertNoSecretInUrl(undefined)).not.toThrow()
  })
  it('urlOrigin tira query; secretValues inclui a query para o redact', () => {
    expect(urlOrigin('https://mcp.example.com/a?x=1#f')).toBe('https://mcp.example.com/a')
    expect(secretValues({ name: 'r', enabled: true, type: 'http', url: 'https://h/?v=segredo123' })).toContain('segredo123')
  })
})
