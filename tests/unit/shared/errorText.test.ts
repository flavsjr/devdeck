import { describe, expect, it } from 'vitest'
import { TEXTO_GENERICO, TEXTOS_ERRO, erroComContexto, errorText, motivoConhecido, semPrefixoIpc } from '@shared/lib/errorText'

/** Erro como o Node cria (code na propriedade e na mensagem). */
function errno(code: string, msg: string): Error {
  return Object.assign(new Error(`${code}: ${msg}`), { code })
}

/** Erro do Supabase (PostgrestError é objeto simples, não Error). */
const pg = (code: string, message: string): { code: string; message: string; details: string; hint: string } => ({ code, message, details: '', hint: '' })

const ipc = (msg: string, nome = 'Error'): Error => new Error(`Error invoking remote method 'mcp:test': ${nome}: ${msg}`)

describe('prefixo do IPC', () => {
  it('sai da mensagem e o texto do main passa intacto', () => {
    expect(errorText(ipc('Nenhum workspace aberto.'))).toBe('Nenhum workspace aberto.')
    expect(semPrefixoIpc("Error invoking remote method 'git:status': Error: Git não encontrado no PATH.")).toBe('Git não encontrado no PATH.')
  })
  it('sem prefixo, a mensagem fica como está', () => {
    expect(semPrefixoIpc('Comando obrigatório para stdio.')).toBe('Comando obrigatório para stdio.')
  })
  it('funciona com string pura', () => {
    expect(errorText("Error invoking remote method 'x': Error: Caminho fora do workspace.")).toBe('Caminho fora do workspace.')
  })
  it('TypeError vindo pelo IPC vira genérico', () => {
    expect(errorText(ipc("Cannot read properties of undefined (reading 'x')", 'TypeError'))).toBe(TEXTO_GENERICO)
  })
})

describe('Supabase', () => {
  it('23505 → "Isso já existe."', () => {
    expect(errorText(pg('23505', 'duplicate key value violates unique constraint "profiles_username_key"'))).toBe('Isso já existe.')
  })
  it('limite de curtidas da 0002 (P0001)', () => {
    expect(errorText(pg('P0001', 'Limite de 120 curtidas por hora atingido. Tente de novo mais tarde.'))).toBe(TEXTOS_ERRO.limiteCurtidas)
  })
  it('limite de denúncias da 0002 (P0001)', () => {
    expect(errorText(pg('P0001', 'Limite de 10 denúncias por dia atingido.'))).toBe(TEXTOS_ERRO.limiteDenuncias)
  })
  it('outro P0001 e código não mapeado viram genérico (sem texto do servidor em inglês)', () => {
    expect(errorText(pg('P0001', 'Usuário não identificado.'))).toBe(TEXTO_GENERICO)
    expect(errorText(pg('42501', 'new row violates row-level security policy for table "posts"'))).toBe(TEXTO_GENERICO)
    expect(errorText(pg('PGRST116', 'JSON object requested, multiple (or no) rows returned'))).toBe(TEXTO_GENERICO)
  })
  it('falha de fetch do supabase-js vira sem conexão', () => {
    expect(errorText({ code: '', message: 'TypeError: Failed to fetch', details: '', hint: '' })).toBe(TEXTOS_ERRO.semConexao)
  })
})

describe('sistema de arquivos', () => {
  it('ENOENT', () => {
    expect(errorText(errno('ENOENT', "no such file or directory, open 'C:\\x\\a.json'"))).toBe('Arquivo ou pasta não encontrado.')
  })
  it('EACCES e EPERM', () => {
    expect(errorText(errno('EACCES', "permission denied, open '/etc/x'"))).toBe('Sem permissão para acessar esse arquivo ou pasta.')
    expect(errorText(errno('EPERM', "operation not permitted, unlink 'C:\\x'"))).toBe(TEXTOS_ERRO.semPermissao)
  })
  it('ENOENT reconhecido só pela mensagem, depois do IPC (que perde o code)', () => {
    expect(errorText(ipc("ENOENT: no such file or directory, open 'C:\\x'"))).toBe(TEXTOS_ERRO.naoEncontrado)
  })
  it('código do Node não mapeado vira genérico, sem caminho na tela', () => {
    expect(errorText(errno('EISDIR', "illegal operation on a directory, read 'C:\\x'"))).toBe(TEXTO_GENERICO)
    expect(errorText(Object.assign(new Error('The "path" argument must be of type string'), { code: 'ERR_INVALID_ARG_TYPE' }))).toBe(TEXTO_GENERICO)
  })
})

describe('rede', () => {
  it.each([
    ['fetch do Chromium', new TypeError('Failed to fetch')],
    ['undici com cause', Object.assign(new TypeError('fetch failed'), { cause: errno('ENOTFOUND', 'getaddrinfo ENOTFOUND api.github.com') })],
    ['ECONNREFUSED', errno('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:443')],
    ['net do Electron', new Error('net::ERR_INTERNET_DISCONNECTED')],
    ['net do Electron pelo IPC', ipc('net::ERR_NAME_NOT_RESOLVED')],
    ['ETIMEDOUT na mensagem', new Error('ETIMEDOUT: connect timed out')]
  ])('%s → sem conexão', (_nome, err) => {
    expect(errorText(err)).toBe('Sem conexão. Confira a internet e tente de novo.')
  })
  it('erro de certificado não é "sem conexão"', () => {
    expect(motivoConhecido(new Error('net::ERR_CERT_AUTHORITY_INVALID'))).toBeNull()
  })
})

describe('genérico', () => {
  it.each([null, undefined, '', 42, {}, new Error(''), new RangeError('Invalid array length')])('%s → genérico', (err) => {
    expect(errorText(err)).toBe(TEXTO_GENERICO)
  })
  it('texto do genérico', () => {
    expect(TEXTO_GENERICO).toBe('Não foi possível concluir. Tente de novo.')
  })
})

describe('erroComContexto (main)', () => {
  it('junta contexto e motivo conhecido', () => {
    expect(erroComContexto('Não foi possível ler config.json', errno('ENOENT', 'no such file'))).toBe(
      'Não foi possível ler config.json: Arquivo ou pasta não encontrado.'
    )
  })
  it('tolera pontuação no fim do contexto', () => {
    expect(erroComContexto('Não foi possível importar a agenda: ', new TypeError('fetch failed'))).toBe(
      'Não foi possível importar a agenda: Sem conexão. Confira a internet e tente de novo.'
    )
  })
  it('motivo desconhecido não repassa o texto cru', () => {
    expect(erroComContexto('Não foi possível ler config.json', new SyntaxError('Unexpected token } in JSON at position 3'))).toBe(
      'Não foi possível ler config.json. Tente de novo.'
    )
  })
})
