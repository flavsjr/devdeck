// Quando um turno do agente conta para estatísticas e conquistas (bug do roteiro manual da Sprint 05:
// chat que falhou na autenticação desbloqueou "Hello, Claude"). Puro: recebe o resultado do SDK.

export interface TurnOutcome {
  subtype: string
  is_error?: boolean
}

/** Só turno concluído com sucesso conta (erro de autenticação, rede, limite ou orçamento não conta). */
export function countsAsTurn(r: TurnOutcome): boolean {
  return r.subtype === 'success' && !r.is_error
}
