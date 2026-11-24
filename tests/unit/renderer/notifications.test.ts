import { describe, expect, it } from 'vitest'
import {
  DURACAO_MS,
  ESTADO_INICIAL,
  LIMITE_HISTORICO,
  RETRY_OPS,
  errosRecolhidos,
  mostrarFecharTodos,
  notificacoesReducer as r,
  proximaExpiracao,
  type AcaoNotificacao,
  type EstadoNotificacoes,
  type NovaNotificacao,
  type TipoNotificacao
} from '../../../src/renderer/src/lib/notifications'
import { VIEWS } from '../../../src/renderer/src/lib/views'

const add = (s: EstadoNotificacoes, tipo: TipoNotificacao, texto: string, now: number, acao?: AcaoNotificacao): EstadoNotificacoes => {
  const notificacao: NovaNotificacao = acao ? { tipo, texto, acao } : { tipo, texto }
  return r(s, { type: 'adicionar', notificacao, now })
}

/** Aplica uma sequência de (tipo, texto) com 1 s entre cada uma, a partir de t0. */
function seq(itens: Array<[TipoNotificacao, string]>, t0 = 0, s = ESTADO_INICIAL): EstadoNotificacoes {
  return itens.reduce((acc, [tipo, texto], i) => add(acc, tipo, texto, t0 + i * 1000), s)
}

const textos = (s: EstadoNotificacoes): string[] => s.visiveis.map((n) => n.texto)

describe('durações', () => {
  it('por tipo, como dado', () => {
    expect(DURACAO_MS).toEqual({ sucesso: 4000, info: 5000, conquista: 6000, aviso: 8000, erro: null })
  })
  it('expiraEm = now + duração; erro sem prazo', () => {
    const s = seq([['sucesso', 'a'], ['erro', 'b']], 100)
    expect(s.visiveis[0].expiraEm).toBe(4100)
    expect(s.visiveis[1].expiraEm).toBeNull()
  })
})

describe('teto de 3', () => {
  it('ao exceder, sai a não-erro mais antiga', () => {
    const s = seq([['info', 'a'], ['erro', 'b'], ['sucesso', 'c'], ['aviso', 'd']])
    expect(textos(s)).toEqual(['b', 'c', 'd'])
  })
  it('erro conta no teto e não sai para dar lugar', () => {
    const s = seq([['erro', 'e1'], ['erro', 'e2'], ['info', 'i'], ['sucesso', 's']])
    expect(textos(s)).toEqual(['e1', 'e2', 's'])
  })
  it('com 3 erros, erro a mais fica recolhido e contado ("+N erros")', () => {
    const s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4'], ['erro', 'e5']])
    expect(textos(s)).toEqual(['e1', 'e2', 'e3'])
    expect(errosRecolhidos(s)).toBe(2)
  })
  it('com 3 erros, não-erro não derruba erro (fica só no histórico)', () => {
    const s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['conquista', 'c']])
    expect(textos(s)).toEqual(['e1', 'e2', 'e3'])
    expect(errosRecolhidos(s)).toBe(0)
    expect(s.historico.map((n) => n.texto)).toContain('c')
  })
  it('fechar um erro sobe o recolhido mais antigo', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4'], ['erro', 'e5']])
    s = r(s, { type: 'fechar', id: s.visiveis[1].id })
    expect(textos(s)).toEqual(['e1', 'e3', 'e4'])
    expect(errosRecolhidos(s)).toBe(1)
  })
  it('fechar um recolhido funciona', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4']])
    s = r(s, { type: 'fechar', id: s.errosRecolhidos[0].id })
    expect(errosRecolhidos(s)).toBe(0)
    expect(textos(s)).toEqual(['e1', 'e2', 'e3'])
  })
})

describe('erro nunca sai sozinho', () => {
  it('expirar muito depois não remove erro', () => {
    const s = r(seq([['erro', 'e'], ['sucesso', 's']]), { type: 'expirar', now: 10_000_000 })
    expect(textos(s)).toEqual(['e'])
  })
  it('só "fechar" ou "fecharTodos" removem erro', () => {
    const s = seq([['erro', 'e']])
    expect(r(s, { type: 'fechar', id: s.visiveis[0].id }).visiveis).toEqual([])
    expect(r(s, { type: 'fecharTodos' }).visiveis).toEqual([])
  })
})

describe('expirar', () => {
  it('remove só o que venceu, no limite exato', () => {
    const s = seq([['sucesso', 's'], ['info', 'i'], ['aviso', 'a']], 0) // vencem em 4000, 6000, 10000
    expect(textos(r(s, { type: 'expirar', now: 3999 }))).toEqual(['s', 'i', 'a'])
    expect(textos(r(s, { type: 'expirar', now: 4000 }))).toEqual(['i', 'a'])
    expect(textos(r(s, { type: 'expirar', now: 10_000 }))).toEqual([])
  })
  it('sem nada vencido devolve o mesmo estado', () => {
    const s = seq([['info', 'i']])
    expect(r(s, { type: 'expirar', now: 1 })).toBe(s)
  })
  it('proximaExpiracao ignora erro', () => {
    expect(proximaExpiracao(seq([['erro', 'e'], ['aviso', 'a'], ['sucesso', 's']], 0))).toBe(6000)
    expect(proximaExpiracao(seq([['erro', 'e']]))).toBeNull()
  })
})

describe('pausa com mouse ou foco', () => {
  it('pausada não expira e retoma com o tempo que faltava', () => {
    let s = seq([['sucesso', 's']], 0)
    const id = s.visiveis[0].id
    s = r(s, { type: 'pausar', id, now: 1000 })
    expect(s.visiveis[0].expiraEm).toBeNull()
    expect(r(s, { type: 'expirar', now: 60_000 }).visiveis).toHaveLength(1)
    s = r(s, { type: 'retomar', id, now: 50_000 })
    expect(s.visiveis[0].expiraEm).toBe(53_000)
  })
  it('pausar erro não muda nada', () => {
    const s = seq([['erro', 'e']])
    expect(r(s, { type: 'pausar', id: s.visiveis[0].id, now: 5 }).visiveis[0]).toEqual(s.visiveis[0])
  })
})

describe('dedupe', () => {
  it('mesmo tipo e texto em < 5 s incrementa o contador e renova o prazo', () => {
    let s = add(ESTADO_INICIAL, 'aviso', 'Nome inválido', 0)
    s = add(s, 'aviso', 'Nome inválido', 4999)
    expect(s.visiveis).toHaveLength(1)
    expect(s.visiveis[0].repeticoes).toBe(2)
    expect(s.visiveis[0].expiraEm).toBe(4999 + 8000)
    expect(s.historico).toHaveLength(1)
    expect(s.historico[0].repeticoes).toBe(2)
  })
  it('a janela conta da última repetição', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'x', 0)
    s = add(s, 'erro', 'x', 4000)
    s = add(s, 'erro', 'x', 8000)
    expect(s.visiveis).toHaveLength(1)
    expect(s.visiveis[0].repeticoes).toBe(3)
  })
  it('5 s ou mais depois vira notificação nova', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'x', 0)
    s = add(s, 'erro', 'x', 5000)
    expect(s.visiveis).toHaveLength(2)
  })
  it('mesmo texto com tipo diferente não junta', () => {
    const s = seq([['info', 'x'], ['aviso', 'x']])
    expect(s.visiveis).toHaveLength(2)
  })
  it('vale também para erro recolhido', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4']])
    s = add(s, 'erro', 'e4', 4000)
    expect(errosRecolhidos(s)).toBe(1)
    expect(s.errosRecolhidos[0].repeticoes).toBe(2)
  })
})

describe('"Fechar todos"', () => {
  it('aparece a partir de 2 erros, contando os recolhidos', () => {
    expect(mostrarFecharTodos(seq([['erro', 'e1'], ['info', 'i']]))).toBe(false)
    expect(mostrarFecharTodos(seq([['erro', 'e1'], ['erro', 'e2']]))).toBe(true)
  })
  it('limpa a tela e os recolhidos, mas mantém o histórico', () => {
    const antes = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4']])
    const s = r(antes, { type: 'fecharTodos' })
    expect(s.visiveis).toEqual([])
    expect(errosRecolhidos(s)).toBe(0)
    expect(s.historico).toHaveLength(4)
  })
})

describe('histórico', () => {
  it(`guarda só as últimas ${LIMITE_HISTORICO}, da mais antiga para a mais nova`, () => {
    const itens = Array.from({ length: 25 }, (_, i): [TipoNotificacao, string] => ['info', `m${i}`])
    const s = seq(itens)
    expect(s.historico).toHaveLength(LIMITE_HISTORICO)
    expect(s.historico[0].texto).toBe('m5')
    expect(s.historico.at(-1)?.texto).toBe('m24')
  })
  it('ids são únicos e estáveis', () => {
    const s = seq([['info', 'a'], ['info', 'b'], ['info', 'c']])
    expect(new Set(s.historico.map((n) => n.id)).size).toBe(3)
  })
})

describe('ação da notificação', () => {
  it('guarda a ação recebida', () => {
    const s = add(ESTADO_INICIAL, 'info', 'Lembrete: daily', 0, { tipo: 'navegar', destino: 'agenda' })
    expect(s.visiveis[0].acao).toEqual({ tipo: 'navegar', destino: 'agenda' })
    expect(add(ESTADO_INICIAL, 'info', 'x', 0).visiveis[0]).not.toHaveProperty('acao')
  })
  it('destino de navegar é uma aba conhecida', () => {
    const acao: AcaoNotificacao = { tipo: 'navegar', destino: 'chat' }
    expect(VIEWS).toContain(acao.destino)
  })
})

describe('RetryOp: só leitura ou recarga', () => {
  // Nada que aprove alteração, ligue "Sempre", execute comando, envie ao agente ou grave.
  const PROIBIDO =
    /aprov|approv|allow|permit|sempre|always|exec|run|comando|command|bash|shell|envi|send|escrev|write|grav|salv|save|apag|delet|remov|revert|desfaz|undo|confi|trust|commit|push|instal/i

  it('a lista existe e não tem repetição', () => {
    expect(RETRY_OPS.length).toBeGreaterThan(0)
    expect(new Set(RETRY_OPS).size).toBe(RETRY_OPS.length)
  })
  it.each(RETRY_OPS)('%s não aprova, não liga "Sempre", não executa nem grava', (op) => {
    expect(op).not.toMatch(PROIBIDO)
  })
  it.each(RETRY_OPS)('%s é uma recarga', (op) => {
    expect(op).toMatch(/^recarregar[A-Z]/)
  })
  it('controle positivo: o filtro pega nomes perigosos', () => {
    for (const nome of ['aprovarAlteracao', 'ligarSempre', 'executarComando', 'salvarChave', 'reenviarMensagem', 'reverterArquivo', 'confiarWorkspace']) {
      expect(nome).toMatch(PROIBIDO)
    }
  })
})
