import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, LIMITE_HISTORICO, historicoRecente, naoLidas, notificacoesReducer as r, type EstadoNotificacoes, type TipoNotificacao } from '../../../src/renderer/src/lib/notifications'
import { badgeNaoLidas, horaExata, rotuloSino, tempoRelativo } from '../../../src/renderer/src/lib/notificationText'

const add = (s: EstadoNotificacoes, tipo: TipoNotificacao, texto: string, now: number): EstadoNotificacoes => r(s, { type: 'adicionar', notificacao: { tipo, texto }, now })

describe('sino: não lidas e marcar como lidas (T48)', () => {
  it('conta o que chegou depois da última abertura, de qualquer tipo', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'a', 1000)
    s = add(s, 'sucesso', 'b', 2000)
    expect(naoLidas(s)).toBe(2)
    s = r(s, { type: 'marcarLidas', now: 2500 })
    expect(naoLidas(s)).toBe(0)
    s = add(s, 'info', 'c', 3000)
    expect(naoLidas(s)).toBe(1)
  })

  it('repetida (×N) depois de lida volta a contar como não lida', () => {
    let s = add(ESTADO_INICIAL, 'aviso', 'x', 1000)
    s = r(s, { type: 'marcarLidas', now: 1500 })
    s = add(s, 'aviso', 'x', 2000)
    expect(s.historico).toHaveLength(1)
    expect(naoLidas(s)).toBe(1)
  })

  it('marcarLidas não volta no tempo e não cria estado novo à toa', () => {
    const s = r(add(ESTADO_INICIAL, 'info', 'x', 1000), { type: 'marcarLidas', now: 5000 })
    expect(r(s, { type: 'marcarLidas', now: 4000 })).toBe(s)
    expect(r(s, { type: 'marcarLidas', now: 5000 })).toBe(s)
  })

  it('a pilha não muda ao marcar como lidas', () => {
    const s = add(ESTADO_INICIAL, 'erro', 'a', 1000)
    expect(r(s, { type: 'marcarLidas', now: 2000 }).visiveis).toBe(s.visiveis)
  })
})

describe('sino: limpar só o histórico (T48)', () => {
  it('esvazia o histórico e mantém o que está na tela', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'fica na tela', 1000)
    s = add(s, 'info', 'outra', 1100)
    const limpo = r(s, { type: 'limparHistorico' })
    expect(limpo.historico).toEqual([])
    expect(limpo.visiveis.map((n) => n.texto)).toEqual(['fica na tela', 'outra'])
    expect(naoLidas(limpo)).toBe(0)
    expect(r(limpo, { type: 'limparHistorico' })).toBe(limpo)
  })

  it('depois de limpar, a mesma mensagem ainda aberta que repete volta ao histórico', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'e', 1000)
    s = r(s, { type: 'limparHistorico' })
    s = add(s, 'erro', 'e', 2000)
    expect(s.historico.map((n) => [n.texto, n.repeticoes])).toEqual([['e', 2]])
  })
})

describe('sino: ordem e teto (T48)', () => {
  it('mais nova em cima, no máximo 20', () => {
    let s = ESTADO_INICIAL
    for (let i = 1; i <= LIMITE_HISTORICO + 5; i++) s = add(s, 'info', `n${i}`, i * 1000)
    const itens = historicoRecente(s)
    expect(itens).toHaveLength(LIMITE_HISTORICO)
    expect(itens[0].texto).toBe(`n${LIMITE_HISTORICO + 5}`)
    expect(itens.at(-1)?.texto).toBe('n6')
    expect(s.historico[0].texto).toBe('n6')
  })
})

describe('sino: textos (T48)', () => {
  it('badge: nada com 0, número até 9, "9+" depois', () => {
    expect(badgeNaoLidas(0)).toBeNull()
    expect(badgeNaoLidas(1)).toBe('1')
    expect(badgeNaoLidas(9)).toBe('9')
    expect(badgeNaoLidas(10)).toBe('9+')
    expect(badgeNaoLidas(20)).toBe('9+')
  })

  it('rótulo acessível leva o número em texto', () => {
    expect(rotuloSino(0)).toBe('Notificações')
    expect(rotuloSino(1)).toBe('Notificações, 1 não lida')
    expect(rotuloSino(12)).toBe('Notificações, 12 não lidas')
  })

  it('hora relativa', () => {
    const t = 1_000_000_000
    expect(tempoRelativo(t, t)).toBe('agora')
    expect(tempoRelativo(t, t + 59_000)).toBe('agora')
    expect(tempoRelativo(t, t + 3 * 60_000)).toBe('há 3 min')
    expect(tempoRelativo(t, t + 2 * 3_600_000)).toBe('há 2 h')
    expect(tempoRelativo(t, t + 24 * 3_600_000)).toBe('há 1 dia')
    expect(tempoRelativo(t, t + 72 * 3_600_000)).toBe('há 3 dias')
    expect(tempoRelativo(t + 5000, t)).toBe('agora')
  })

  it('hora exata HH:mm:ss local', () => {
    expect(horaExata(new Date(2026, 10, 26, 9, 5, 7).getTime())).toBe('09:05:07')
  })
})
