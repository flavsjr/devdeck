import { erroComContexto } from '@shared/lib/errorText'

// Mensagens de falha para o usuário montadas no main antes do throw/retorno (H06.2, T11, ADR-021).
// Puro: fs e rede chegam como erro; o dicionário é o de src/shared/lib/errorText.

/** Erro cuja mensagem já foi escrita para o usuário (PT-BR): repassada como está. */
export class MensagemUsuario extends Error {
  override name = 'MensagemUsuario'
}

/** Resposta HTTP sem sucesso de um serviço externo (GitHub, GitLab, Bitbucket, ICS). */
export class HttpStatusError extends Error {
  override name = 'HttpStatusError'
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/** Texto por status HTTP. `servico` é o sujeito da frase: "O GitHub", "O servidor do calendário". */
export function mensagemHttp(status: number, servico: string): string {
  if (status === 401 || status === 403) return `${servico} recusou o acesso (HTTP ${status}). Confira o token ou o link.`
  if (status === 404) return `${servico} não encontrou o recurso (HTTP 404).`
  if (status === 429) return `${servico} limitou as requisições (HTTP 429). Tente de novo mais tarde.`
  if (status >= 500) return `${servico} está com problema (HTTP ${status}). Tente de novo mais tarde.`
  return `${servico} respondeu com erro (HTTP ${status}).`
}

/** Timeout do AbortController (`AbortError`) ou do `AbortSignal.timeout` (`TimeoutError`). */
function expirou(err: unknown): boolean {
  const name = err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined
  return name === 'AbortError' || name === 'TimeoutError'
}

/**
 * Mensagem final de uma falha em operação de rede ou disco:
 * mensagem pronta → como está; HTTP → texto por status; timeout → "tempo esgotado";
 * ENOENT/EACCES/EPERM/rede → contexto + motivo; resto → contexto + "Tente de novo" (sem texto cru).
 */
export function falhaComContexto(contexto: string, err: unknown, servico = 'O servidor'): string {
  if (err instanceof MensagemUsuario) return err.message
  if (err instanceof HttpStatusError) return mensagemHttp(err.status, servico)
  if (expirou(err)) return `${contexto.trim().replace(/[.:\s]+$/, '')}: tempo esgotado. Confira a internet e tente de novo.`
  return erroComContexto(contexto, err)
}
