import type { ChatItem } from '@shared/types'
import { redactAll } from './secrets'

// Saídas de erro do agente (H06.3, ADR-021): a mensagem do SDK/Claude Code pode trazer chave ou token.
// Tudo que vai para IPC, console ou disco passa por aqui, com redação por padrão e por valor exato.
// `known` = valores exatos conhecidos (apiKey salva, env/headers de MCP).

export type KnownSecrets = (string | null | undefined)[]

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Erro relançado para o renderer (vira mensagem de IPC): só a mensagem redigida, sem stack nem causa. */
export function redactedError(err: unknown, known: KnownSecrets): Error {
  return new Error(redactAll(messageOf(err), known))
}

/** Argumentos do `console.error` para uma linha do stderr do Claude Code. */
export function stderrLogArgs(sessionId: string, data: string, known: KnownSecrets): [string, string] {
  return [`[agent ${sessionId.slice(0, 8)}]`, redactAll(data.trimEnd(), known)]
}

/**
 * Texto do item de erro do turno. Neutro de propósito: o renderer mostra texto fixo por `code`
 * e a mensagem original (já redigida) só aparece em "Detalhes técnicos" (`detail`).
 */
export const ROTULO_ERRO_AGENTE = 'Erro no turno do Claude.'

/** Peças da mensagem original de um erro de turno, para montar "Detalhes técnicos". */
export interface AgentErrorParts {
  error?: string
  status?: number | null
  text?: string
}

/** "Detalhes técnicos" redigidos: enum do SDK, status HTTP e a mensagem original. */
export function agentErrorDetail(parts: AgentErrorParts, known: KnownSecrets): string {
  const head = [parts.error, typeof parts.status === 'number' ? `HTTP ${parts.status}` : null].filter(Boolean).join(' · ')
  const body = parts.text?.trim() ?? ''
  return redactAll([head, body].filter(Boolean).join('\n'), known)
}

/** Item de chat para a falha do pump (gravado no arquivo da sessão e emitido ao renderer). */
export function pumpErrorItem(err: unknown, known: KnownSecrets, id: string, ts: number): ChatItem {
  return { kind: 'error', id, text: ROTULO_ERRO_AGENTE, code: 'unknown', detail: redactAll(messageOf(err), known), ts }
}

/** `result.errors` do SDK, redigido antes de ir para o item `result`. */
export function redactResultErrors(errors: readonly string[] | undefined, known: KnownSecrets): string[] | undefined {
  return errors?.map((e) => redactAll(String(e), known))
}
