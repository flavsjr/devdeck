import { describe, expect, it } from 'vitest'
import {
  DURACAO_MS,
  ESTADO_INICIAL,
  LIMITE_HISTORICO,
  RETRY_OPS,
  avisoErroDoTurno,
  conquistaVisivel,
  errosRecolhidos,
  mostrarFecharTodos,
  notificacoesReducer as r,
  proximaExpiracao,
  totalFecharTodos,
  type AcaoNotificacao,
  type EstadoNotificacoes,
  type NovaNotificacao,
  type TipoNotificacao
} from '../../../src/renderer/src/lib/notifications'
import { VIEWS } from '../../../src/renderer/src/lib/views'
import type { ChatItem } from '../../../src/shared/types'

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
  it('com 3 erros, não-erro entra e o erro mais antigo vai para o início dos recolhidos', () => {
    const s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4'], ['aviso', 'a']])
    expect(textos(s)).toEqual(['e2', 'e3', 'a'])
    expect(s.errosRecolhidos.map((n) => n.texto)).toEqual(['e1', 'e4'])
  })
  it('quando o não-erro expira, o erro deslocado volta sem ser anunciado de novo', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['sucesso', 's']], 0) // s vence em 3000 + 4000
    expect(s.visiveis.find((n) => n.texto === 'e2')?.alerta).toBe(true)
    s = r(s, { type: 'expirar', now: 7000 })
    expect(textos(s)).toEqual(['e2', 'e3', 'e1'])
    expect(errosRecolhidos(s)).toBe(0)
    const e1 = s.visiveis.find((n) => n.texto === 'e1')
    expect(e1?.alerta).toBe(false)
    expect(e1?.anunciada).toBe(true)
  })
  it('quando o não-erro é fechado, o erro deslocado também volta', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['info', 'i']])
    s = r(s, { type: 'fechar', id: s.visiveis[2].id, now: 9000 })
    expect(textos(s)).toEqual(['e2', 'e3', 'e1'])
  })
  it('erro que nunca esteve na tela é anunciado quando sobe', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4']])
    expect(s.errosRecolhidos[0].anunciada).toBe(false)
    s = r(s, { type: 'fechar', id: s.visiveis[0].id, now: 9000 })
    const e4 = s.visiveis.find((n) => n.texto === 'e4')
    expect(e4?.alerta).toBe(true)
  })
  it('não-erro nunca tem alerta', () => {
    const s = seq([['aviso', 'a'], ['sucesso', 's'], ['info', 'i']])
    expect(s.visiveis.every((n) => !n.alerta)).toBe(true)
  })
  it('fechar um erro sobe o recolhido mais antigo', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4'], ['erro', 'e5']])
    s = r(s, { type: 'fechar', id: s.visiveis[1].id, now: 9000 })
    expect(textos(s)).toEqual(['e1', 'e3', 'e4'])
    expect(errosRecolhidos(s)).toBe(1)
  })
  it('fechar um recolhido funciona', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4']])
    s = r(s, { type: 'fechar', id: s.errosRecolhidos[0].id, now: 9000 })
    expect(errosRecolhidos(s)).toBe(0)
    expect(textos(s)).toEqual(['e1', 'e2', 'e3'])
  })
})

describe('conquista: faixa própria', () => {
  const conquista = (s: EstadoNotificacoes, titulo: string, now: number): EstadoNotificacoes =>
    r(s, { type: 'adicionar', notificacao: { tipo: 'conquista', texto: `${titulo} (+50 XP)`, conquista: { titulo, xp: 50 } }, now })

  it('fica fora do teto de 3 e não derruba ninguém', () => {
    let s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3']])
    s = conquista(s, 'Primeiro turno', 5000)
    expect(textos(s)).toEqual(['e1', 'e2', 'e3'])
    expect(errosRecolhidos(s)).toBe(0)
    expect(conquistaVisivel(s)?.conquista).toEqual({ titulo: 'Primeiro turno', xp: 50 })
  })
  it('uma por vez: a próxima espera sem prazo e começa a contar quando a primeira sai', () => {
    let s = conquista(ESTADO_INICIAL, 'A', 0)
    s = conquista(s, 'B', 1000)
    expect(conquistaVisivel(s)?.conquista?.titulo).toBe('A')
    expect(s.conquistas[1].expiraEm).toBeNull()
    expect(proximaExpiracao(s)).toBe(6000)
    s = r(s, { type: 'expirar', now: 6000 })
    expect(conquistaVisivel(s)?.conquista?.titulo).toBe('B')
    expect(conquistaVisivel(s)?.expiraEm).toBe(12_000)
  })
  it('fechar a da vez passa para a próxima, com prazo a partir do fechamento', () => {
    let s = conquista(conquista(ESTADO_INICIAL, 'A', 0), 'B', 0)
    s = r(s, { type: 'fechar', id: s.conquistas[0].id, now: 2000 })
    expect(conquistaVisivel(s)?.conquista?.titulo).toBe('B')
    expect(conquistaVisivel(s)?.expiraEm).toBe(8000)
  })
  it('pausa e retoma só a da vez', () => {
    let s = conquista(conquista(ESTADO_INICIAL, 'A', 0), 'B', 0)
    s = r(s, { type: 'pausar', id: s.conquistas[0].id, now: 1000 })
    expect(proximaExpiracao(s)).toBeNull()
    s = r(s, { type: 'retomar', id: s.conquistas[0].id, now: 10_000 })
    expect(proximaExpiracao(s)).toBe(15_000)
    expect(r(s, { type: 'pausar', id: s.conquistas[1].id, now: 0 }).conquistas[1]).toEqual(s.conquistas[1])
  })
  it('dado de conquista só fica em notificação do tipo conquista', () => {
    const s = r(ESTADO_INICIAL, { type: 'adicionar', notificacao: { tipo: 'info', texto: 'x', conquista: { titulo: 'x' } }, now: 0 })
    expect(s.visiveis[0]).not.toHaveProperty('conquista')
  })
})

describe('erro nunca sai sozinho', () => {
  it('expirar muito depois não remove erro', () => {
    const s = r(seq([['erro', 'e'], ['sucesso', 's']]), { type: 'expirar', now: 10_000_000 })
    expect(textos(s)).toEqual(['e'])
  })
  it('só "fechar" ou "fecharTodos" removem erro', () => {
    const s = seq([['erro', 'e']])
    expect(r(s, { type: 'fechar', id: s.visiveis[0].id, now: 1 }).visiveis).toEqual([])
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
  it('sem limite de tempo enquanto aberta; erro só soma (continua sem prazo)', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'x', 0)
    s = add(s, 'erro', 'x', 60_000)
    s = add(s, 'erro', 'x', 600_000)
    expect(s.visiveis).toHaveLength(1)
    expect(s.visiveis[0].repeticoes).toBe(3)
    expect(s.visiveis[0].expiraEm).toBeNull()
  })
  it('depois de fechada, uma ocorrência nova abre card novo', () => {
    let s = add(ESTADO_INICIAL, 'erro', 'x', 0)
    const primeiro = s.visiveis[0].id
    s = r(s, { type: 'fechar', id: primeiro, now: 1000 })
    s = add(s, 'erro', 'x', 2000)
    expect(s.visiveis).toHaveLength(1)
    expect(s.visiveis[0].id).not.toBe(primeiro)
    expect(s.visiveis[0].repeticoes).toBe(1)
  })
  it('depois de expirar, uma ocorrência nova abre card novo', () => {
    let s = add(ESTADO_INICIAL, 'sucesso', 'ok', 0)
    s = r(s, { type: 'expirar', now: 4000 })
    s = add(s, 'sucesso', 'ok', 4001)
    expect(s.visiveis[0].repeticoes).toBe(1)
  })
  it('pausada: soma e guarda a duração cheia para quando retomar', () => {
    let s = add(ESTADO_INICIAL, 'info', 'i', 0)
    s = r(s, { type: 'pausar', id: s.visiveis[0].id, now: 1000 })
    s = add(s, 'info', 'i', 2000)
    expect(s.visiveis[0].restanteMs).toBe(5000)
    expect(s.visiveis[0].expiraEm).toBeNull()
  })
  it('conquista repetida na fila soma sem iniciar prazo', () => {
    const c = { tipo: 'conquista' as const, texto: 'B (+10 XP)' }
    let s = r(ESTADO_INICIAL, { type: 'adicionar', notificacao: { tipo: 'conquista', texto: 'A' }, now: 0 })
    s = r(s, { type: 'adicionar', notificacao: c, now: 0 })
    s = r(s, { type: 'adicionar', notificacao: c, now: 100 })
    expect(s.conquistas).toHaveLength(2)
    expect(s.conquistas[1].repeticoes).toBe(2)
    expect(s.conquistas[1].expiraEm).toBeNull()
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
  it('total de "Fechar todos (N)" = na tela + recolhidos, sem a conquista', () => {
    const s = seq([['erro', 'e1'], ['erro', 'e2'], ['erro', 'e3'], ['erro', 'e4'], ['conquista', 'c']])
    expect(totalFecharTodos(s)).toBe(4)
  })
  it('não afeta a faixa da conquista', () => {
    const s = r(seq([['erro', 'e1'], ['erro', 'e2'], ['conquista', 'c']]), { type: 'fecharTodos' })
    expect(conquistaVisivel(s)?.texto).toBe('c')
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

describe('aviso do erro do turno (H07.2)', () => {
  const ATIVA = 's1'
  const user: ChatItem = { kind: 'user', id: 'u1', text: 'oi', ts: 1 }
  const erro: ChatItem = { kind: 'error', id: 'e1', text: 'Erro', code: 'auth_invalid_key', detail: 'invalid x-api-key [redigido]', ts: 2 }
  const ctx = (over: Partial<Parameters<typeof avisoErroDoTurno>[0]> = {}): Parameters<typeof avisoErroDoTurno>[0] => ({
    sessionId: ATIVA,
    activeId: ATIVA,
    view: 'chat',
    items: [user, erro],
    avisados: new Set(),
    ...over
  })

  it('sessão ativa com o chat na tela: marca o erro e não abre toast (o card basta)', () => {
    expect(avisoErroDoTurno(ctx())).toEqual({ erroId: 'e1', aviso: null })
  })

  it('sessão ativa em outra aba: um toast de erro com "Ver no chat", sem a mensagem original', () => {
    const r = avisoErroDoTurno(ctx({ view: 'agenda' }))
    expect(r?.erroId).toBe('e1')
    expect(r?.aviso).toEqual({ tipo: 'erro', texto: 'Erro no chat: a chave da API foi recusada.', acao: { tipo: 'navegar', destino: 'chat' } })
    expect(r?.aviso?.texto).not.toContain('redigido')
  })

  it('outra sessão: cita o título, sem ação', () => {
    const r = avisoErroDoTurno(ctx({ activeId: 's2', view: 'chat', tituloSessao: 'Refatorar' }))
    expect(r?.aviso).toEqual({ tipo: 'erro', texto: 'Erro no chat "Refatorar": a chave da API foi recusada.' })
  })

  it('fim de turno repetido (result e finally): o segundo não avisa de novo', () => {
    const avisados = new Set<string>()
    const primeiro = avisoErroDoTurno(ctx({ view: 'mcp', avisados }))
    expect(primeiro?.aviso).not.toBeNull()
    avisados.add(primeiro!.erroId)
    expect(avisoErroDoTurno(ctx({ view: 'mcp', avisados }))).toBeNull()
  })

  it('erro visto no chat não vira toast depois ao trocar de aba', () => {
    const avisados = new Set<string>()
    avisados.add(avisoErroDoTurno(ctx({ avisados }))!.erroId)
    expect(avisoErroDoTurno(ctx({ view: 'settings', avisados }))).toBeNull()
  })

  it('sem erro no último turno → nada (erro antigo, antes da última mensagem, não conta)', () => {
    expect(avisoErroDoTurno(ctx({ view: 'mcp', items: [user] }))).toBeNull()
    expect(avisoErroDoTurno(ctx({ view: 'mcp', items: [user, erro, { ...user, id: 'u2' }] }))).toBeNull()
  })

  it('o toast entra na fila como erro e só sai ao fechar (controle com o reducer)', () => {
    const aviso = avisoErroDoTurno(ctx({ view: 'agenda' }))!.aviso!
    const s = r(ESTADO_INICIAL, { type: 'adicionar', notificacao: aviso, now: 0 })
    const depois = r(s, { type: 'expirar', now: 10 * 60_000 })
    expect(depois.visiveis.map((n) => n.texto)).toEqual([aviso.texto])
    expect(r(depois, { type: 'adicionar', notificacao: aviso, now: 1 }).visiveis).toHaveLength(1)
  })
})
