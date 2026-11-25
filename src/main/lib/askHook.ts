import type { HookCallback, HookCallbackMatcher, HookEvent, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'

/**
 * Tools de comando que sempre passam pelo card de aprovação do DevDeck (ADR-022).
 *
 * Em `permissionMode: 'default'` o Claude Code libera sozinho o comando que considera só-leitura
 * (`git status`, `ls`…) sem chamar `canUseTool`. Num repositório confiado, um `git status` dentro de
 * um repositório embutido roda o filtro dele sem o usuário ver. O hook `PreToolUse` responde `ask`
 * e devolve a decisão ao `canUseTool`.
 */
export const ALWAYS_ASK_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])

/**
 * Tools tiradas da sessão (`disallowedTools`). `Monitor` roda comando de shell em segundo plano com o mesmo
 * avaliador "só-leitura" do Bash e o card do DevDeck não sabe mostrá-la (comando ou WebSocket).
 */
export const DISALLOWED_TOOLS: readonly string[] = ['Monitor']

/** Saída do hook para uma tool: `ask` nas tools de comando; nas outras, segue o fluxo normal. */
export function askOutputFor(toolName: string): HookJSONOutput {
  if (!ALWAYS_ASK_TOOLS.has(toolName)) return {}
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'DevDeck: todo comando pede aprovação.'
    }
  }
}

export const forceAskHook: HookCallback = async (input) =>
  input.hook_event_name === 'PreToolUse' ? askOutputFor(input.tool_name) : {}

/**
 * Hooks passados ao `query()`. `onFailure: 'block'` fecha em falha: se o hook der erro, o comando
 * é bloqueado em vez de seguir sem aprovação.
 */
export function alwaysAskHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [{ matcher: [...ALWAYS_ASK_TOOLS].join('|'), hooks: [forceAskHook], onFailure: 'block' }]
  }
}
