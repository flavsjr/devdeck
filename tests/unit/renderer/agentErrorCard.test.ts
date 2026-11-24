import { describe, expect, it } from 'vitest'
import type { AgentErrorCode, ChatItem } from '@shared/types'
import {
  CARTAO_ERRO,
  ROTULO_ACAO_ERRO,
  acaoChave,
  acaoExterna,
  cartaoErro,
  erroDoUltimoTurno,
  mensagemParaRepetir,
  rotuloAcessivelAcao,
  textoErroNoChat,
  trechosCorpo
} from '../../../src/renderer/src/lib/agentErrorCard'

const CODIGOS: AgentErrorCode[] = ['auth_expired', 'auth_invalid_key', 'auth_missing', 'rate_limit', 'overloaded', 'billing', 'network', 'unknown']

let seq = 0
const user = (text = 'oi'): Extract<ChatItem, { kind: 'user' }> => ({ kind: 'user', id: `u${++seq}`, text, ts: seq })
const erro = (code?: AgentErrorCode): Extract<ChatItem, { kind: 'error' }> => ({ kind: 'error', id: `e${++seq}`, text: 'Erro no turno do Claude.', code, ts: seq })
const result = (): ChatItem => ({ kind: 'result', id: `r${++seq}`, costUsd: 0, durationMs: 1, turns: 1, isError: true, ts: seq })

describe('cartões por código (T22)', () => {
  it.each(CODIGOS)('%s tem título, corpo e ação primária', (code) => {
    const c = CARTAO_ERRO[code]
    expect(c.titulo.length).toBeGreaterThan(5)
    expect(c.corpo.length).toBeGreaterThan(10)
    expect(c.acoes.length).toBeGreaterThan(0)
  })

  it('tom: conta/créditos/desconhecido em bad; limite/sobrecarga/rede em warn', () => {
    const tons = Object.fromEntries(CODIGOS.map((c) => [c, CARTAO_ERRO[c].tom]))
    expect(tons).toEqual({
      auth_expired: 'bad',
      auth_invalid_key: 'bad',
      auth_missing: 'bad',
      rate_limit: 'warn',
      overloaded: 'warn',
      billing: 'bad',
      network: 'warn',
      unknown: 'bad'
    })
  })

  it('ações na ordem da tabela do UX (primária primeiro)', () => {
    expect(CARTAO_ERRO.auth_expired.acoes).toEqual(['entrarDeNovo', 'usarChave', 'repetir'])
    expect(CARTAO_ERRO.auth_invalid_key.acoes).toEqual(['trocarChave', 'repetir'])
    expect(CARTAO_ERRO.auth_missing.acoes).toEqual(['entrar', 'adicionarChave', 'repetir'])
    expect(CARTAO_ERRO.billing.acoes).toEqual(['trocarChave', 'repetir'])
    for (const c of ['rate_limit', 'overloaded', 'network', 'unknown'] as const) expect(CARTAO_ERRO[c].acoes).toEqual(['repetir'])
  })

  it('chave recusada não fala de OAuth nem de login', () => {
    expect(CARTAO_ERRO.auth_invalid_key.corpo).not.toMatch(/oauth|login/i)
  })

  it('sem código → desconhecido', () => {
    expect(cartaoErro(undefined)).toBe(CARTAO_ERRO.unknown)
  })

  it('rótulos e classificação das ações', () => {
    expect(ROTULO_ACAO_ERRO.entrarDeNovo).toBe('Como entrar de novo')
    expect(rotuloAcessivelAcao('entrarDeNovo')).toBe('Como entrar de novo (abre no navegador)')
    expect(rotuloAcessivelAcao('entrar')).toBe('Como entrar (abre no navegador)')
    expect(rotuloAcessivelAcao('repetir')).toBe('Tentar de novo')
    expect(['usarChave', 'trocarChave', 'adicionarChave'].every((a) => acaoChave(a as never))).toBe(true)
    expect(acaoChave('repetir') || acaoExterna('repetir') || acaoExterna('usarChave')).toBe(false)
  })

  it('trechos do corpo: código entre crases', () => {
    expect(trechosCorpo('rode `claude` e digite `/login`.')).toEqual([
      { texto: 'rode ', codigo: false },
      { texto: 'claude', codigo: true },
      { texto: ' e digite ', codigo: false },
      { texto: '/login', codigo: true },
      { texto: '.', codigo: false }
    ])
  })
})

describe('textoErroNoChat (T21)', () => {
  it('inicial minúscula e ponto final', () => {
    expect(textoErroNoChat('auth_expired')).toBe('Erro no chat: sua sessão do Claude expirou.')
    expect(textoErroNoChat('overloaded')).toBe('Erro no chat: o Claude está sobrecarregado agora.')
  })
  it('sessão que não é a ativa: cita o título', () => {
    expect(textoErroNoChat('network', 'Refatorar login')).toBe('Erro no chat "Refatorar login": sem conexão com o Claude.')
  })
  it('título vazio cai no texto sem sessão', () => {
    expect(textoErroNoChat('billing', '  ')).toBe('Erro no chat: os créditos da sua chave da API acabaram.')
  })
})

describe('turno do erro', () => {
  it('erroDoUltimoTurno: erro com código depois da última mensagem do usuário', () => {
    const e = erro('rate_limit')
    expect(erroDoUltimoTurno([user(), e, result()])).toBe(e)
    expect(erroDoUltimoTurno([user(), erro('rate_limit'), result(), user()])).toBeNull()
    expect(erroDoUltimoTurno([user(), erro(undefined)])).toBeNull()
    expect(erroDoUltimoTurno([])).toBeNull()
  })

  it('mensagemParaRepetir: a mensagem que originou o turno do erro', () => {
    const u1 = user('primeira')
    const u2 = user('segunda')
    const e = erro('network')
    expect(mensagemParaRepetir([u1, result(), u2, e, result()], e.id)).toBe(u2)
  })

  it('card antigo (com mensagem do usuário depois) não repete', () => {
    const e = erro('network')
    expect(mensagemParaRepetir([user(), e, result(), user('nova')], e.id)).toBeNull()
  })

  it('erro sem mensagem antes ou id inexistente → null', () => {
    const e = erro('unknown')
    expect(mensagemParaRepetir([e], e.id)).toBeNull()
    expect(mensagemParaRepetir([user()], 'nada')).toBeNull()
  })
})
