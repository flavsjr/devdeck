// Spike T01 (Sprint 06): captura mensagens reais do SDK 0.3.330 para cada tipo de erro.
// Usa config vazia (CLAUDE_CONFIG_DIR temporário) e chave falsa contra servidor local:
// nunca toca a conta real do usuário.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = process.argv[2]
const outDir = process.argv[3]
const only = process.argv[4]
const sdk = await import(pathToFileURL(path.join(repo, 'node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs')).href)

const FAKE_KEY = 'sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKEFAKE-0000'
const FAKE_BEARER = 'Bearer eyJfake.eyJfake.fakesig'

function errBody(type, message) {
  return JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_fake' })
}

const scenarios = {
  invalid_key: { status: 401, body: errBody('authentication_error', `invalid x-api-key ${FAKE_KEY} ${FAKE_BEARER}`) },
  rate_limit: { status: 429, body: errBody('rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit'), headers: { 'retry-after': '1' } },
  overloaded: { status: 529, body: errBody('overloaded_error', 'Overloaded') },
  billing: { status: 400, body: errBody('invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.') },
  no_network: { closedPort: true },
  missing_credentials: { noKey: true }
}

async function run(name, sc) {
  let server
  let baseUrl
  const hits = []
  if (sc.closedPort) {
    baseUrl = 'http://127.0.0.1:9'
  } else if (!sc.noKey) {
    server = http.createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`)
      req.resume()
      res.writeHead(sc.status, { 'content-type': 'application/json', ...(sc.headers || {}) })
      res.end(sc.body)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  }
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-cfg-'))
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-cwd-'))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  if (!sc.noKey) env.ANTHROPIC_API_KEY = FAKE_KEY
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl
  env.CLAUDE_CODE_MAX_RETRIES = '0'
  const stderr = []
  const msgs = []
  let thrown = null
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 90_000)
  try {
    const q = sdk.query({
      prompt: 'oi',
      options: { cwd, env, maxTurns: 1, allowedTools: [], abortController: ac, stderr: (d) => stderr.push(String(d)) }
    })
    for await (const m of q) msgs.push(m)
  } catch (e) {
    thrown = { name: e?.name, message: String(e?.message ?? e) }
  } finally {
    clearTimeout(timer)
    server?.close()
  }
  const out = { scenario: name, sdk: '0.3.330', capturedAt: new Date().toISOString(), hits, thrown, stderr, messages: msgs }
  fs.writeFileSync(path.join(outDir, `${name}.raw.json`), JSON.stringify(out, null, 2))
  const summary = msgs.map((m) => `${m.type}${m.subtype ? '/' + m.subtype : ''}${m.error ? ' error=' + m.error : ''}${m.api_error_status !== undefined ? ' status=' + m.api_error_status : ''}${m.apiKeySource ? ' keySource=' + m.apiKeySource : ''}`)
  console.log(`== ${name}: hits=${hits.length} thrown=${thrown ? thrown.message.slice(0, 120) : '-'}`)
  console.log('   ' + summary.join(' | '))
}

fs.mkdirSync(outDir, { recursive: true })
for (const [name, sc] of Object.entries(scenarios)) {
  if (only && only !== name) continue
  await run(name, sc)
}
