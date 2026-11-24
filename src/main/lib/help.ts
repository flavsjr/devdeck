import type { HelpTopic } from '@shared/types'

// Páginas de ajuda abertas por `help:open` (H06.3, ADR-021). O renderer manda só a chave de uma
// lista fechada; a URL https fica neste mapa fixo no main e nunca vem do renderer.

export const HELP_TOPICS = ['claude-login'] as const satisfies readonly HelpTopic[]

export const HELP_URLS = {
  // Autenticação do Claude Code: entrar de novo, chave da API (conferida em 2026-11-24, 200 OK).
  'claude-login': 'https://code.claude.com/docs/en/iam'
} as const satisfies Record<HelpTopic, `https://${string}`>

/** URL fixa do tópico (o tópico já passou pelo `z.enum` do IPC). */
export function helpUrl(topic: HelpTopic): string {
  return HELP_URLS[topic]
}
