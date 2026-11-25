// Reduz as capturas brutas do spike a fixtures sem caminho local, id de sessão ou env.
import fs from 'node:fs'
import path from 'node:path'

const [inDir, outDir] = process.argv.slice(2)
const origem = {
  invalid_key: 'ANTHROPIC_API_KEY falsa + servidor local devolvendo 401 authentication_error',
  rate_limit: 'ANTHROPIC_API_KEY falsa + servidor local devolvendo 429 rate_limit_error',
  overloaded: 'ANTHROPIC_API_KEY falsa + servidor local devolvendo 529 overloaded_error',
  billing: 'ANTHROPIC_API_KEY falsa + servidor local devolvendo 400 "credit balance is too low"',
  no_network: 'ANTHROPIC_API_KEY falsa + ANTHROPIC_BASE_URL em porta fechada (127.0.0.1:9)',
  missing_credentials: 'CLAUDE_CONFIG_DIR vazio, sem ANTHROPIC_API_KEY nem OAuth'
}

fs.mkdirSync(outDir, { recursive: true })
for (const f of fs.readdirSync(inDir).filter((n) => n.endsWith('.raw.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(inDir, f), 'utf8'))
  const init = raw.messages.find((m) => m.type === 'system' && m.subtype === 'init')
  const assistant = raw.messages.find((m) => m.type === 'assistant')
  const result = raw.messages.find((m) => m.type === 'result')
  const fixture = {
    scenario: raw.scenario,
    sdk: raw.sdk,
    capturedAt: raw.capturedAt.slice(0, 10),
    origem: origem[raw.scenario],
    init: { apiKeySource: init?.apiKeySource },
    assistant: assistant && {
      error: assistant.error,
      text: assistant.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    },
    result: result && {
      subtype: result.subtype,
      is_error: result.is_error,
      result: result.result,
      errors: result.errors,
      api_error_status: result.api_error_status
    },
    thrown: raw.thrown && { message: raw.thrown.message }
  }
  const name = raw.scenario.replace(/_/g, '-') + '.json'
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(fixture, null, 2) + '\n')
  // Só o nome do arquivo: a fixture tem campos de credencial (apiKeySource), que não vão para o console (CodeQL).
  console.log(`gravada: ${name}`)
}
