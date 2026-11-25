// Estado da conta do Claude para a barra de status (H06.3, H06.7, T21). Puro: deriva da lista de
// itens da sessão ativa. O chip aparece com o último erro de autenticação ou de créditos e some no
// próximo turno concluído com sucesso.
import type { AgentErrorCode, ChatItem } from '@shared/types'

export type EstadoAuth = 'sessao_expirada' | 'chave_recusada' | 'sem_conta' | 'sem_creditos'

/** Códigos de erro que viram estado da conta; os demais (limite, rede…) não mexem no chip. */
const ESTADO_POR_CODIGO: Partial<Record<AgentErrorCode, EstadoAuth>> = {
  auth_expired: 'sessao_expirada',
  auth_invalid_key: 'chave_recusada',
  auth_missing: 'sem_conta',
  billing: 'sem_creditos'
}

export const TEXTO_ESTADO_AUTH: Readonly<Record<EstadoAuth, string>> = {
  sessao_expirada: 'Claude: sessão expirada',
  chave_recusada: 'Claude: chave recusada',
  sem_conta: 'Claude: sem conta',
  sem_creditos: 'Claude: sem créditos'
}

/**
 * Do fim para o começo: turno concluído (result sem erro) antes de achar um erro de conta → null;
 * erro de autenticação ou créditos sem turno concluído depois → o estado dele.
 */
export function estadoAuth(items: readonly ChatItem[]): EstadoAuth | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'result' && !it.isError) return null
    if (it.kind === 'error' && it.code) {
      const estado = ESTADO_POR_CODIGO[it.code]
      if (estado) return estado
    }
  }
  return null
}

/** Texto do chip e rótulo acessível do botão (a ação leva ao chat). */
export function chipAuth(items: readonly ChatItem[]): { texto: string; rotulo: string } | null {
  const estado = estadoAuth(items)
  if (!estado) return null
  const texto = TEXTO_ESTADO_AUTH[estado]
  return { texto, rotulo: `${texto}. Ver no chat` }
}
