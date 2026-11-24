import { describe, expect, it } from 'vitest'
import { TEXTOS_ERRO } from '../../../src/shared/lib/errorText'
import { HttpStatusError, MensagemUsuario, falhaComContexto, mensagemHttp } from '../../../src/main/lib/userError'

// T11 (H06.2): o main monta a mensagem em PT-BR com contexto antes do throw/retorno.

const errno = (code: string, message: string): Error => Object.assign(new Error(message), { code })

describe('mensagemHttp', () => {
  it('texto por faixa de status, com o código para o suporte', () => {
    expect(mensagemHttp(401, 'O GitHub')).toBe('O GitHub recusou o acesso (HTTP 401). Confira o token ou o link.')
    expect(mensagemHttp(403, 'O GitLab')).toContain('recusou o acesso (HTTP 403)')
    expect(mensagemHttp(404, 'O servidor do calendário')).toBe('O servidor do calendário não encontrou o recurso (HTTP 404).')
    expect(mensagemHttp(429, 'O Bitbucket')).toContain('limitou as requisições (HTTP 429)')
    expect(mensagemHttp(502, 'O GitHub')).toContain('está com problema (HTTP 502)')
    expect(mensagemHttp(418, 'O GitHub')).toBe('O GitHub respondeu com erro (HTTP 418).')
  })
})

describe('falhaComContexto', () => {
  const ctx = 'Não foi possível baixar o calendário'
  it('mensagem pronta passa como está', () => {
    expect(falhaComContexto(ctx, new MensagemUsuario('Resposta não é um calendário ICS.'))).toBe('Resposta não é um calendário ICS.')
  })
  it('HTTP vira texto por status com o serviço como sujeito', () => {
    expect(falhaComContexto(ctx, new HttpStatusError(404), 'O servidor do calendário')).toBe('O servidor do calendário não encontrou o recurso (HTTP 404).')
    expect(falhaComContexto(ctx, new HttpStatusError(500))).toContain('O servidor está com problema')
  })
  it('timeout do AbortController ou do AbortSignal.timeout', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' })
    for (const e of [abort, timeout]) {
      const msg = falhaComContexto(ctx, e)
      expect(msg).toBe(`${ctx}: tempo esgotado. Confira a internet e tente de novo.`)
      expect(msg).not.toMatch(/aborted|timed out/)
    }
  })
  it('ENOENT, EACCES, EPERM e rede: contexto + motivo do dicionário', () => {
    expect(falhaComContexto('Não foi possível ler a.txt', errno('ENOENT', "ENOENT: no such file or directory, open 'C:\\x\\a.txt'"))).toBe(
      `Não foi possível ler a.txt: ${TEXTOS_ERRO.naoEncontrado}`
    )
    expect(falhaComContexto('Não foi possível gravar a.txt', errno('EACCES', 'EACCES: permission denied'))).toBe(`Não foi possível gravar a.txt: ${TEXTOS_ERRO.semPermissao}`)
    expect(falhaComContexto('Não foi possível gravar a.txt', errno('EPERM', 'EPERM: operation not permitted'))).toBe(`Não foi possível gravar a.txt: ${TEXTOS_ERRO.semPermissao}`)
    expect(falhaComContexto(ctx, new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(`${ctx}: ${TEXTOS_ERRO.semConexao}`)
    expect(falhaComContexto(ctx, errno('ENOTFOUND', 'getaddrinfo ENOTFOUND cal.example.com'))).toBe(`${ctx}: ${TEXTOS_ERRO.semConexao}`)
  })
  it('motivo desconhecido não repassa o texto cru', () => {
    const msg = falhaComContexto(ctx, new SyntaxError('Unexpected token < in JSON at position 0'))
    expect(msg).toBe(`${ctx}. Tente de novo.`)
  })
})
