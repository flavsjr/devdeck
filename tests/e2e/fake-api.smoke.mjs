// Fumaça do servidor falso da API (T14, Sprint 06): sobe o helper e confere cada cenário com fetch.
// Não lança o app. Roda com: node tests/e2e/fake-api.smoke.mjs
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  CENARIOS,
  FAKE_API_KEY,
  FAKE_BODY_KEY,
  FAKE_BODY_TOKEN,
  SEGREDOS_FALSOS,
  TEXTO_OK,
  fakeApiEnv,
  startFakeApi
} from './helpers/fake-api.mjs'

let failures = 0
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures++
}

const MODEL = 'claude-e2e-model'
const headers = { 'content-type': 'application/json', 'x-api-key': FAKE_API_KEY, 'anthropic-version': '2023-06-01' }
const pedido = (stream) => JSON.stringify({ model: MODEL, max_tokens: 64, stream, messages: [{ role: 'user', content: 'oi' }] })

/** Lê um corpo SSE e devolve [{ event, data }]. */
function parseSse(texto) {
  return texto
    .split('\n\n')
    .filter((b) => b.trim())
    .map((b) => {
      const ev = /^event: (.+)$/m.exec(b)?.[1]
      const data = /^data: (.+)$/m.exec(b)?.[1]
      return { event: ev, data: data ? JSON.parse(data) : undefined }
    })
}

const api = await startFakeApi()
try {
  // ---------- Endereço ----------
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(api.url), `escuta em 127.0.0.1 com porta do SO (${api.url})`)
  check(api.cenario() === 'ok', 'cenário padrão é ok')
  const port = new URL(api.url).port
  const externo = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)
  if (externo) {
    let alcancou = true
    try {
      await fetch(`http://${externo.address}:${port}/api/hello`, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
    } catch {
      alcancou = false
    }
    check(!alcancou, `não responde no IP da rede (${externo.address}): não está em 0.0.0.0`)
  } else console.log('- sem interface de rede externa: checagem de 0.0.0.0 pulada')

  // ---------- Conectividade (o Claude Code faz HEAD /api/hello antes do turno) ----------
  const hello = await fetch(`${api.url}/api/hello`, { method: 'HEAD' })
  check(hello.status === 200, `HEAD /api/hello → ${hello.status}`)

  // ---------- ok sem stream ----------
  let r = await fetch(`${api.url}/v1/messages?beta=true`, { method: 'POST', headers, body: pedido(false) })
  let j = await r.json()
  check(r.status === 200 && j.type === 'message' && j.role === 'assistant', `ok sem stream → ${r.status} ${j.type}`)
  check(j.content?.[0]?.type === 'text' && j.content[0].text === TEXTO_OK, 'ok sem stream: texto curto esperado')
  check(j.model === MODEL && j.stop_reason === 'end_turn' && typeof j.usage?.input_tokens === 'number', 'ok sem stream: model ecoado, end_turn e usage')

  // ---------- ok com stream (SSE) ----------
  r = await fetch(`${api.url}/v1/messages?beta=true`, { method: 'POST', headers, body: pedido(true) })
  check(r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('text/event-stream'), `ok com stream → ${r.status} ${r.headers.get('content-type')}`)
  const eventos = parseSse(await r.text())
  const nomes = eventos.map((e) => e.event)
  check(nomes[0] === 'message_start' && nomes.at(-1) === 'message_stop', `SSE começa em message_start e termina em message_stop (${nomes.join(' > ')})`)
  check(eventos.every((e) => e.data?.type === e.event), 'SSE: data.type igual ao nome do evento')
  const texto = eventos.filter((e) => e.event === 'content_block_delta').map((e) => e.data.delta.text).join('')
  check(texto === TEXTO_OK, 'SSE: deltas somam o texto esperado')
  check(eventos.find((e) => e.event === 'message_delta')?.data.delta.stop_reason === 'end_turn', 'SSE: message_delta com end_turn')
  check(eventos[0].data.message.model === MODEL, 'SSE: model ecoado no message_start')

  // ---------- count_tokens e rota desconhecida ----------
  r = await fetch(`${api.url}/v1/messages/count_tokens?beta=true`, { method: 'POST', headers, body: pedido(false) })
  j = await r.json()
  check(r.status === 200 && j.input_tokens > 0, `count_tokens → ${r.status}`)
  r = await fetch(`${api.url}/v1/models`, { headers })
  j = await r.json()
  check(r.status === 404 && j.error?.type === 'not_found_error', `rota sem cenário → ${r.status} ${j.error?.type}`)

  // ---------- Cenários de erro (stream e sem stream recebem o mesmo JSON, como a API real) ----------
  const esperado = {
    auth401: { status: 401, tipo: 'authentication_error' },
    rate429: { status: 429, tipo: 'rate_limit_error' },
    overloaded529: { status: 529, tipo: 'overloaded_error' },
    billing400: { status: 400, tipo: 'invalid_request_error' }
  }
  for (const [cenario, exp] of Object.entries(esperado)) {
    api.setCenario(cenario)
    for (const stream of [true, false]) {
      const res = await fetch(`${api.url}/v1/messages?beta=true`, { method: 'POST', headers, body: pedido(stream) })
      const ct = res.headers.get('content-type') ?? ''
      const corpo = await res.text()
      const e = JSON.parse(corpo)
      check(
        res.status === exp.status && ct.startsWith('application/json') && e.type === 'error' && e.error?.type === exp.tipo,
        `${cenario} (stream=${stream}) → ${res.status} ${e.error?.type}`
      )
      if (cenario === 'auth401') {
        check(corpo.includes(FAKE_BODY_KEY) && corpo.includes(`Bearer ${FAKE_BODY_TOKEN}`), 'auth401: corpo traz sk-ant-… e Bearer … falsos')
        check(!corpo.includes(FAKE_API_KEY), 'auth401: corpo não ecoa a chave que o cliente mandou')
      }
      if (cenario === 'rate429') check(res.headers.get('retry-after') === '1', 'rate429: cabeçalho retry-after')
      if (cenario === 'billing400') check(/credit balance is too low/i.test(e.error.message), 'billing400: mensagem de créditos')
    }
  }
  // A checagem de conectividade continua 200 em cenário de erro (o erro vem só no /v1/messages).
  const hello2 = await fetch(`${api.url}/api/hello`, { method: 'HEAD' })
  check(hello2.status === 200, `HEAD /api/hello em billing400 → ${hello2.status}`)

  // ---------- Volta para ok ----------
  api.setCenario('ok')
  r = await fetch(`${api.url}/v1/messages?beta=true`, { method: 'POST', headers, body: pedido(false) })
  check(r.status === 200, `setCenario('ok') volta a responder 200 (${r.status})`)
  await r.text()

  // ---------- Entrada inválida ----------
  let lancou = false
  try {
    api.setCenario('nao-existe')
  } catch {
    lancou = true
  }
  check(lancou && api.cenario() === 'ok', 'setCenario com nome desconhecido lança e não muda o cenário')
  let rejeitou = false
  try {
    const outro = await startFakeApi({ cenario: 'nao-existe' })
    await outro.close()
  } catch {
    rejeitou = true
  }
  check(rejeitou, 'startFakeApi com cenário desconhecido rejeita')
  r = await fetch(`${api.url}/v1/messages`, { method: 'POST', headers, body: '{quebrado' })
  check(r.status === 400, `JSON inválido → ${r.status}`)
  await r.text()

  // ---------- hits ----------
  const posts = api.hits.filter((h) => h.method === 'POST' && h.path === '/v1/messages')
  check(posts.length === 2 + 2 * 4 + 1 + 1, `hits registra cada POST /v1/messages (${posts.length})`)
  check(posts.every((h) => h.temChave), 'hits: temChave true quando há x-api-key')
  check(posts.filter((h) => h.cenario === 'auth401').every((h) => h.status === 401), 'hits: cenário e status de cada pedido')
  check(posts.some((h) => h.stream === true) && posts.some((h) => h.stream === false), 'hits: registra stream true/false')
  const hitsJson = JSON.stringify(api.hits)
  check(SEGREDOS_FALSOS.every((s) => !hitsJson.includes(s)), 'hits: nenhum valor de chave/token guardado')

  // ---------- fakeApiEnv ----------
  const env = fakeApiEnv({ PATH: 'x', ANTHROPIC_AUTH_TOKEN: 'a', CLAUDE_CODE_OAUTH_TOKEN: 'b', ANTHROPIC_API_KEY: 'chave-real' }, api.url, 'C:/tmp/vazio')
  check(env.ANTHROPIC_BASE_URL === api.url && env.ANTHROPIC_API_KEY === FAKE_API_KEY, 'fakeApiEnv: base url e chave falsa')
  check(!('ANTHROPIC_AUTH_TOKEN' in env) && !('CLAUDE_CODE_OAUTH_TOKEN' in env), 'fakeApiEnv: tira tokens herdados')
  check(env.CLAUDE_CONFIG_DIR === 'C:/tmp/vazio' && env.CLAUDE_CODE_MAX_RETRIES === '0' && env.PATH === 'x', 'fakeApiEnv: config vazia, sem retry, resto do env mantido')
  let semDir = false
  try {
    fakeApiEnv({}, api.url)
  } catch {
    semDir = true
  }
  check(semDir, 'fakeApiEnv sem CLAUDE_CONFIG_DIR lança (não usa o login real por engano)')

  // ---------- Fonte sem chave literal (gitleaks) ----------
  const fonte = readFileSync(fileURLToPath(new URL('./helpers/fake-api.mjs', import.meta.url)), 'utf8')
  check(!/sk-ant-api03-/.test(fonte), 'fonte do helper não tem sk-ant-api03- literal')
} finally {
  await api.close()
}

// ---------- close ----------
let fechado = false
try {
  await fetch(`${api.url}/api/hello`, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
} catch {
  fechado = true
}
check(fechado, 'close() derruba o servidor')
check(CENARIOS.length === 5, `5 cenários: ${CENARIOS.join(', ')}`)

console.log(failures ? `\n${failures} falha(s)` : '\nfake-api: tudo certo')
// exitCode em vez de process.exit: no Windows, process.exit com socket do fetch fechando derruba o libuv (assert em async.c).
process.exitCode = failures ? 1 : 0
