import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, RETRY_OPS, TIPOS_NOTIFICACAO, notificacoesReducer as r, type EstadoNotificacoes, type NovaNotificacao } from '../../../src/renderer/src/lib/notifications'
import {
  PREFIXO_LEITOR,
  ROTULO_DESTINO,
  ROTULO_FECHAR,
  descricaoErrosRecolhidos,
  detalheConquista,
  esperaAteExpirar,
  gruposExibicao,
  rotuloAcao,
  rotuloErrosRecolhidos,
  rotuloFecharTodos,
  rotuloRepeticoes,
  rotuloXp,
  textoConquista,
  textoLeitor,
  vizinhaAoFechar
} from '../../../src/renderer/src/lib/notificationText'
import { VIEWS } from '../../../src/renderer/src/lib/views'

const adicionar = (s: EstadoNotificacoes, notificacao: NovaNotificacao, now = 0): EstadoNotificacoes => r(s, { type: 'adicionar', notificacao, now })

describe('prefixo para o leitor de tela', () => {
  it('um por tipo, como no inventário do UX', () => {
    expect(PREFIXO_LEITOR).toEqual({ erro: 'Erro:', aviso: 'Aviso:', sucesso: 'Sucesso:', info: 'Info:', conquista: 'Conquista:' })
  })
  it('cobre todos os tipos', () => {
    for (const t of TIPOS_NOTIFICACAO) expect(PREFIXO_LEITOR[t]).toMatch(/:$/)
  })
  it('fechar tem o rótulo combinado', () => {
    expect(ROTULO_FECHAR).toBe('Fechar notificação')
  })
})

describe('rótulo da ação (fixo, tabela do UX)', () => {
  it('cada aba tem rótulo', () => {
    for (const v of VIEWS) expect(ROTULO_DESTINO[v]).toBeTruthy()
  })
  it('navegar usa o destino', () => {
    expect(rotuloAcao({ tipo: 'navegar', destino: 'agenda' })).toBe('Abrir na agenda')
    expect(rotuloAcao({ tipo: 'navegar', destino: 'chat' })).toBe('Ver no chat')
    expect(rotuloAcao({ tipo: 'abrirSessao', sessionId: '123e4567-e89b-42d3-a456-426614174000' })).toBe('Ver no chat')
    expect(rotuloAcao({ tipo: 'navegar', destino: 'profile' })).toBe('Ver no perfil')
  })
  it.each(RETRY_OPS)('repetir %s é sempre "Tentar de novo"', (op) => {
    expect(rotuloAcao({ tipo: 'repetir', op })).toBe('Tentar de novo')
  })
})

describe('contadores', () => {
  it('×N só a partir de 2, com rótulo "repetida N vezes"', () => {
    expect(rotuloRepeticoes(1)).toBeNull()
    expect(rotuloRepeticoes(2)).toEqual({ visivel: '×2', leitor: 'repetida 2 vezes' })
    expect(rotuloRepeticoes(Number.NaN)).toBeNull()
  })
  it('"+N erros" no singular e no plural', () => {
    expect(rotuloErrosRecolhidos(0)).toBe('')
    expect(rotuloErrosRecolhidos(1)).toBe('+1 erro')
    expect(rotuloErrosRecolhidos(3)).toBe('+3 erros')
    expect(descricaoErrosRecolhidos(1)).toBe('1 erro a mais, fora da tela')
    expect(descricaoErrosRecolhidos(2)).toBe('2 erros a mais, fora da tela')
  })
  it('"Fechar todos (N)" com aria-label por extenso', () => {
    expect(rotuloFecharTodos(4)).toEqual({ visivel: 'Fechar todos (4)', leitor: 'Fechar todas as 4 notificações' })
  })
})

describe('conquista', () => {
  it('texto sem emoji: "Título (+N XP)"', () => {
    expect(textoConquista('Primeiro turno', 50)).toBe('Primeiro turno (+50 XP)')
    expect(textoConquista('Sem XP')).toBe('Sem XP')
    expect(rotuloXp(0)).toBeNull()
    expect(rotuloXp(12.6)).toBe('+13 XP')
  })
  it('o cartão não repete o título quando o texto é só título + XP', () => {
    expect(detalheConquista({ texto: 'A (+5 XP)', conquista: { titulo: 'A', xp: 5 } })).toBeNull()
    expect(detalheConquista({ texto: 'A', conquista: { titulo: 'A', xp: 5 } })).toBeNull()
    expect(detalheConquista({ texto: 'Outro texto', conquista: { titulo: 'A' } })).toBe('Outro texto')
    expect(detalheConquista({ texto: 'Sem dados' })).toBe('Sem dados')
  })
})

describe('textoLeitor', () => {
  it('prefixo + texto + repetição', () => {
    expect(textoLeitor({ tipo: 'erro', texto: 'Falhou.', repeticoes: 1 })).toBe('Erro: Falhou.')
    expect(textoLeitor({ tipo: 'aviso', texto: 'Cuidado.', repeticoes: 3 })).toBe('Aviso: Cuidado. (repetida 3 vezes)')
  })
  it('conquista com título e XP, sem repetir o texto', () => {
    expect(textoLeitor({ tipo: 'conquista', texto: 'A (+5 XP)', repeticoes: 1, conquista: { titulo: 'A', xp: 5 } })).toBe('Conquista: A +5 XP')
  })
})

describe('gruposExibicao', () => {
  it('separa erros, demais tipos e a conquista da vez', () => {
    let s = adicionar(ESTADO_INICIAL, { tipo: 'info', texto: 'i' })
    s = adicionar(s, { tipo: 'erro', texto: 'e' })
    s = adicionar(s, { tipo: 'conquista', texto: 'c1' })
    s = adicionar(s, { tipo: 'conquista', texto: 'c2' })
    const g = gruposExibicao(s)
    expect(g.erros.map((n) => n.texto)).toEqual(['e'])
    expect(g.outros.map((n) => n.texto)).toEqual(['i'])
    expect(g.conquista?.texto).toBe('c1')
  })
  it('estado vazio', () => {
    expect(gruposExibicao(ESTADO_INICIAL)).toEqual({ erros: [], outros: [], conquista: null })
  })
})

describe('timer e foco', () => {
  it('espera nunca é negativa', () => {
    expect(esperaAteExpirar(null, 10)).toBeNull()
    expect(esperaAteExpirar(100, 40)).toBe(60)
    expect(esperaAteExpirar(100, 500)).toBe(0)
  })
  it('ao fechar, o foco vai para a seguinte, senão a anterior, senão volta à origem (null)', () => {
    expect(vizinhaAoFechar(['a', 'b', 'c'], 'b')).toBe('c')
    expect(vizinhaAoFechar(['a', 'b', 'c'], 'c')).toBe('b')
    expect(vizinhaAoFechar(['a'], 'a')).toBeNull()
    expect(vizinhaAoFechar(['a'], 'x')).toBeNull()
  })
})
