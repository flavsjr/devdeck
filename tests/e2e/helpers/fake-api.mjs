// Servidor falso da API Messages da Anthropic para os E2E da Sprint 06 (T14; usado por T24 e T25).
// - Escuta só em 127.0.0.1, porta escolhida pelo SO (0). Nunca 0.0.0.0.
// - O app aponta para ele por ANTHROPIC_BASE_URL no env do processo (o agentEnv repassa a variável),
//   sem gancho de teste no pacote (decisão do PO no tema "como provar no E2E").
// - Cenários: 'ok' (200, mensagem curta; SSE quando o pedido traz stream:true), 'auth401', 'rate429',
//   'overloaded529' e 'billing400' (corpos iguais aos do spike T01, scripts/sdk-errors/capture.mjs).
// - Todas as chaves e tokens daqui são falsos e montados por partes (o gitleaks do CI não confunde
//   com segredo real).
//
// O que o Claude Code (SDK 0.3.330) pede, conferido no probe da T14:
//   HEAD /api/hello                 -> checagem de conectividade (respondemos 200); some com
//                                      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 (fakeApiEnv)
//   POST /v1/messages?beta=true     -> primeiro com stream:true; se o stream falhar, repete com stream:false
import http from 'node:http'

/** Chave falsa que o app manda para o servidor (vai no ANTHROPIC_API_KEY do processo do E2E). */
export const FAKE_API_KEY = ['sk', 'ant', 'api03', 'E2EFAKEKEY', 'x'.repeat(16), '0000'].join('-')

/** Chave falsa que só aparece no CORPO do 401 (diferente da que o app manda, para saber de onde veio um vazamento). */
export const FAKE_BODY_KEY = ['sk', 'ant', 'api03', 'E2EBODYKEY', 'y'.repeat(16), '1111'].join('-')
/** Token falso que só aparece no CORPO do 401, depois de "Bearer ". */
export const FAKE_BODY_TOKEN = ['e2e', 'bearer', 'z'.repeat(20), 'TOKEN'].join('-')

/** Valores que nunca podem aparecer na tela, no stdout/stderr do Electron nem no JSON da sessão (T24). */
export const SEGREDOS_FALSOS = [FAKE_API_KEY, FAKE_BODY_KEY, FAKE_BODY_TOKEN]

/** Texto da resposta do cenário 'ok' (o E2E procura este texto no chat). */
export const TEXTO_OK = 'Olá! Resposta do servidor falso do E2E.'

export const CENARIOS = ['ok', 'auth401', 'rate429', 'overloaded529', 'billing400']

/** Teto do corpo do pedido (o do Claude Code tem ~60 KB com prompt de sistema e ferramentas). */
const MAX_BODY = 20 * 1024 * 1024

const errBody = (type, message) => JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_e2e_fake' })

const ERROS = {
  auth401: {
    status: 401,
    headers: {},
    body: () => errBody('authentication_error', `invalid x-api-key ${FAKE_BODY_KEY} Authorization: Bearer ${FAKE_BODY_TOKEN}`)
  },
  rate429: {
    status: 429,
    headers: { 'retry-after': '1' },
    body: () => errBody('rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit')
  },
  overloaded529: {
    status: 529,
    headers: {},
    body: () => errBody('overloaded_error', 'Overloaded')
  },
  billing400: {
    status: 400,
    headers: {},
    body: () => errBody('invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.')
  }
}

const usage = (output) => ({ input_tokens: 12, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })

function mensagem(model, texto) {
  return {
    id: `msg_e2e_${Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: texto }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: usage(8)
  }
}

function enviarSse(res, model, texto) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': 'req_e2e_fake' })
  const ev = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const msg = mensagem(model, texto)
  ev('message_start', { type: 'message_start', message: { ...msg, content: [], stop_reason: null, usage: usage(1) } })
  ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  ev('ping', { type: 'ping' })
  // Duas partes, para o renderer exercitar o texto parcial (includePartialMessages).
  const meio = Math.ceil(texto.length / 2)
  for (const parte of [texto.slice(0, meio), texto.slice(meio)]) {
    ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: parte } })
  }
  ev('content_block_stop', { type: 'content_block_stop', index: 0 })
  ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } })
  ev('message_stop', { type: 'message_stop' })
  res.end()
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_e2e_fake', ...headers })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const loopback = (addr) => addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1'

/**
 * Sobe o servidor falso.
 * @param {{ cenario?: 'ok'|'auth401'|'rate429'|'overloaded529'|'billing400', texto?: string }} [opts]
 * @returns {Promise<{ url: string, hits: object[], cenario: () => string, setCenario: (c: string) => void, setAtraso: (ms: number) => void, close: () => Promise<void> }>}
 *
 * `hits` guarda um registro por pedido: { method, path, url, stream, model, temChave, cenario, status }.
 * Nunca guarda o valor de cabeçalho nem o corpo (só se havia x-api-key/Authorization).
 */
export async function startFakeApi({ cenario = 'ok', texto = TEXTO_OK } = {}) {
  const validar = (c) => {
    if (!CENARIOS.includes(c)) throw new Error(`cenário desconhecido: ${c} (use ${CENARIOS.join(', ')})`)
    return c
  }
  let atual = validar(cenario)
  let atrasoMs = 0
  const hits = []

  const server = http.createServer((req, res) => {
    // Defesa extra: mesmo escutando em 127.0.0.1, recusa qualquer origem que não seja loopback.
    if (!loopback(req.socket.remoteAddress)) {
      req.destroy()
      return
    }
    const u = new URL(req.url ?? '/', 'http://127.0.0.1')
    const hit = {
      method: req.method,
      path: u.pathname,
      url: req.url,
      stream: undefined,
      model: undefined,
      temChave: Boolean(req.headers['x-api-key'] || req.headers.authorization),
      cenario: atual,
      status: 0
    }
    hits.push(hit)

    const chunks = []
    let tamanho = 0
    req.on('data', (c) => {
      tamanho += c.length
      if (tamanho > MAX_BODY) {
        hit.status = 413
        json(res, 413, errBody('request_too_large', 'corpo grande demais para o servidor falso'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      // Checagem de conectividade do Claude Code.
      if (u.pathname === '/api/hello') {
        hit.status = 200
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(req.method === 'HEAD' ? undefined : 'ok')
        return
      }
      if (req.method !== 'POST' || (u.pathname !== '/v1/messages' && u.pathname !== '/v1/messages/count_tokens')) {
        hit.status = 404
        json(res, 404, errBody('not_found_error', `rota sem cenário no servidor falso: ${req.method} ${u.pathname}`))
        return
      }
      let body = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      } catch {
        hit.status = 400
        json(res, 400, errBody('invalid_request_error', 'JSON inválido'))
        return
      }
      hit.stream = body.stream === true
      hit.model = typeof body.model === 'string' ? body.model : undefined
      // Atraso opcional (H07.2): deixa o turno "trabalhando" tempo bastante para o E2E trocar de aba.
      if (atrasoMs > 0) setTimeout(() => !res.destroyed && responder(res, u, hit), atrasoMs)
      else responder(res, u, hit)
    })
  })

  /** Resposta do cenário atual para um POST em /v1/messages ou /v1/messages/count_tokens. */
  function responder(res, u, hit) {
    const erro = ERROS[atual]
    if (erro) {
      // A API real devolve o erro antes de abrir o stream: JSON com o status, igual para stream e não stream.
      hit.status = erro.status
      json(res, erro.status, erro.body(), erro.headers)
      return
    }
    hit.status = 200
    if (u.pathname === '/v1/messages/count_tokens') {
      json(res, 200, { input_tokens: 12 })
      return
    }
    const model = hit.model ?? 'claude-e2e-fake'
    if (hit.stream) enviarSse(res, model, texto)
    else json(res, 200, mensagem(model, texto))
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { address, port } = server.address()
  if (address !== '127.0.0.1') {
    server.close()
    throw new Error(`servidor falso subiu em ${address}, esperado 127.0.0.1`)
  }

  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    cenario: () => atual,
    setCenario: (c) => {
      atual = validar(c)
    },
    /** Atraso (ms) antes de responder a /v1/messages; 0 desliga. */
    setAtraso: (ms) => {
      atrasoMs = Math.max(0, Number(ms) || 0)
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

/**
 * Env completo para o processo do Electron (ou do SDK) apontado para o servidor falso.
 * - Parte de `base` (normalmente process.env) e tira credenciais herdadas: ANTHROPIC_AUTH_TOKEN,
 *   CLAUDE_CODE_OAUTH_TOKEN e a ANTHROPIC_API_KEY do usuário (troca pela FAKE_API_KEY).
 * - CLAUDE_CONFIG_DIR numa pasta vazia: o Claude Code não usa o login real (OAuth) nem a config do usuário.
 * - CLAUDE_CODE_MAX_RETRIES=0: 429/529 viram erro na hora, sem a espera do retry.
 * - CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1: sem telemetria/atualização indo para a internet.
 * Se o teste salvar uma chave no DevDeck, ela vai por cima da FAKE_API_KEY (agent.ts põe a chave salva no env).
 */
export function fakeApiEnv(base, url, claudeConfigDir) {
  if (!claudeConfigDir) throw new Error('fakeApiEnv: informe uma pasta vazia para CLAUDE_CONFIG_DIR')
  const env = { ...base }
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  return {
    ...env,
    ANTHROPIC_BASE_URL: url,
    ANTHROPIC_API_KEY: FAKE_API_KEY,
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    CLAUDE_CODE_MAX_RETRIES: '0',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  }
}
