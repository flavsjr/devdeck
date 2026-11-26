// Textos e rótulos acessíveis das notificações (H06.2, ADR-021; microcopy em
// docs/sprints/sprint-06/ux-notificacoes.md). Puro: `components/Notifications.tsx` só monta o JSX.
import { conquistaVisivel, type AcaoNotificacao, type EstadoNotificacoes, type Notificacao, type TipoNotificacao } from './notifications'
import type { View } from './views'

/** Tipo dito em texto para o leitor de tela, nunca só pela cor (visualmente oculto). */
export const PREFIXO_LEITOR: Readonly<Record<TipoNotificacao, string>> = {
  erro: 'Erro:',
  aviso: 'Aviso:',
  sucesso: 'Sucesso:',
  info: 'Info:',
  conquista: 'Conquista:'
}

export const ROTULO_FECHAR = 'Fechar notificação'
export const TITULO_CONQUISTA = 'Conquista desbloqueada'

/** Rótulo fixo do botão da ação "navegar", por destino (tabela do UX). */
export const ROTULO_DESTINO: Readonly<Record<View, string>> = {
  chat: 'Ver no chat',
  changes: 'Abrir Alterações',
  mcp: 'Abrir MCP',
  profile: 'Ver no perfil',
  agenda: 'Abrir na agenda',
  community: 'Abrir Comunidade',
  costs: 'Abrir Custos',
  settings: 'Abrir Configurações'
}

/** Rótulo fixo da ação "repetir", qualquer que seja a operação. */
export const ROTULO_REPETIR = 'Tentar de novo'

export function rotuloAcao(acao: AcaoNotificacao): string {
  switch (acao.tipo) {
    case 'navegar':
      return ROTULO_DESTINO[acao.destino]
    case 'repetir':
      return ROTULO_REPETIR
    case 'abrirSessao':
      return ROTULO_DESTINO.chat
  }
}

/** "Fechar todos (N)" na tela e "Fechar todas as N notificações" para o leitor de tela. */
export function rotuloFecharTodos(total: number): { visivel: string; leitor: string } {
  return { visivel: `Fechar todos (${total})`, leitor: `Fechar todas as ${total} notificações` }
}

/** Contador de repetição: "×N" na tela e "repetida N vezes" para o leitor de tela; null se chegou uma vez só. */
export function rotuloRepeticoes(n: number): { visivel: string; leitor: string } | null {
  if (!Number.isFinite(n) || n <= 1) return null
  const vezes = Math.floor(n)
  return { visivel: `×${vezes}`, leitor: `repetida ${vezes} vezes` }
}

/** "+1 erro" / "+N erros": erros que não couberam na tela; string vazia quando não há nenhum. */
export function rotuloErrosRecolhidos(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? '+1 erro' : `+${n} erros`
}

/** Versão longa do resumo, para o leitor de tela e o title do botão. */
export function descricaoErrosRecolhidos(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? '1 erro a mais, fora da tela' : `${n} erros a mais, fora da tela`
}

/** "+50 XP" (null sem XP válido). */
export function rotuloXp(xp: number | undefined): string | null {
  if (xp === undefined || !Number.isFinite(xp) || xp <= 0) return null
  return `+${Math.round(xp)} XP`
}

/** Texto da conquista, sem emoji: "Título (+N XP)" (ou só o título sem XP válido). */
export function textoConquista(titulo: string, xp?: number): string {
  const r = rotuloXp(xp)
  return r ? `${titulo} (${r})` : titulo
}

/**
 * Texto que o cartão da conquista mostra abaixo do título: nenhum quando o texto só repete o
 * título (com ou sem XP), senão o próprio texto.
 */
export function detalheConquista(n: Pick<Notificacao, 'texto' | 'conquista'>): string | null {
  if (!n.conquista) return n.texto
  const { titulo, xp } = n.conquista
  return n.texto === titulo || n.texto === textoConquista(titulo, xp) ? null : n.texto
}

/** Frase completa que o leitor de tela ouve para uma notificação. */
export function textoLeitor(n: Pick<Notificacao, 'tipo' | 'texto' | 'repeticoes' | 'conquista'>): string {
  const partes = [PREFIXO_LEITOR[n.tipo]]
  if (n.tipo === 'conquista' && n.conquista) {
    partes.push(n.conquista.titulo)
    const xp = rotuloXp(n.conquista.xp)
    if (xp) partes.push(xp)
    const detalhe = detalheConquista(n)
    if (detalhe) partes.push(detalhe)
  } else partes.push(n.texto)
  const rep = rotuloRepeticoes(n.repeticoes)
  if (rep) partes.push(`(${rep.leitor})`)
  return partes.join(' ')
}

/**
 * O que vai para a tela, cada grupo da mais antiga para a mais nova: erros (role="alert" na
 * primeira vez), demais tipos (região status polite) e a conquista da vez (faixa própria).
 */
export function gruposExibicao(s: EstadoNotificacoes): { erros: Notificacao[]; outros: Notificacao[]; conquista: Notificacao | null } {
  return {
    erros: s.visiveis.filter((n) => n.tipo === 'erro'),
    outros: s.visiveis.filter((n) => n.tipo !== 'erro'),
    conquista: conquistaVisivel(s)
  }
}

/** Espera até o próximo vencimento, em ms (nunca negativa), ou null quando nada vence. */
export function esperaAteExpirar(proxima: number | null, now: number): number | null {
  return proxima === null ? null : Math.max(0, proxima - now)
}

/**
 * Para onde vai o foco quando o usuário fecha a notificação focada: a seguinte na ordem da tela,
 * senão a anterior, senão null (o componente devolve o foco a quem estava antes de entrar na pilha).
 */
export function vizinhaAoFechar(ordem: string[], id: string): string | null {
  const i = ordem.indexOf(id)
  if (i < 0) return null
  return ordem[i + 1] ?? ordem[i - 1] ?? null
}

// ---------- sino do histórico (T48; desenho do UX na Sprint 07) ----------

export const ROTULO_PAINEL_HISTORICO = 'Histórico de notificações'
export const ROTULO_LISTA_HISTORICO = 'Últimas 20 notificações da sessão'
export const HISTORICO_VAZIO = 'Nenhuma notificação nesta sessão.'
export const ROTULO_LIMPAR_HISTORICO = 'Limpar (só desta sessão)'

/** Badge do sino: nada com 0; "9+" a partir de 10. */
export function badgeNaoLidas(n: number): string | null {
  if (n <= 0) return null
  return n > 9 ? '9+' : String(n)
}

/** Rótulo acessível do sino: o número em texto (nunca só a cor do badge). */
export function rotuloSino(n: number): string {
  if (n <= 0) return 'Notificações'
  return `Notificações, ${n} ${n === 1 ? 'não lida' : 'não lidas'}`
}

/** "agora", "há 3 min", "há 2 h", "há 1 dia" (relativo ao `now` injetado). */
export function tempoRelativo(quando: number, now: number): string {
  const s = Math.max(0, Math.floor((now - quando) / 1000))
  if (s < 60) return 'agora'
  const min = Math.floor(s / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** title da hora: HH:mm:ss local. */
export function horaExata(quando: number): string {
  const d = new Date(quando)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
