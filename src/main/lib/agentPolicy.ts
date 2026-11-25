import type { HookCallback, HookCallbackMatcher, HookEvent, HookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'

/**
 * Política de tools do agente do chat (ADR-022 e emenda da H06.10). Pura: o `agent.ts` só espalha
 * `agentToolOptions()` nas opções do `query()`.
 */

/**
 * Lista branca: só tools que o card de aprovação do DevDeck sabe mostrar (H06.10). O SDK 0.3.330 oferece 31
 * por padrão, entre elas RemoteTrigger, PublishPlugin, CronCreate e Workflow, que cairiam no card genérico
 * com JSON cru. `Task` é o subagente; o modelo chama pelo nome novo `Agent`. Subagente herda esta lista.
 */
export const AGENT_TOOLS: readonly string[] = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell', 'WebSearch', 'Task']

/** Nomes que o modelo usa para uma tool da lista. */
const TOOL_ALIASES: Readonly<Record<string, string>> = { Agent: 'Task' }

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
 * avaliador "só-leitura" do Bash. Já fica fora da lista branca; segue aqui como defesa em profundidade.
 */
export const DISALLOWED_TOOLS: readonly string[] = ['Monitor']

/**
 * Origens de MCP aceitas (`mcp_server.source` do hook): `dynamic` = servidores que o DevDeck passa em
 * `mcpServers`; `project` = `.mcp.json` de workspace confiado (ADR-013). Conectores do claude.ai, MCP de
 * settings do usuário, de plugin ou de agente são negados. Origem ausente ou desconhecida: negada.
 */
export const ALLOWED_MCP_SOURCES: ReadonlySet<string> = new Set(['dynamic', 'project'])

export interface ToolCall {
  tool_name: string
  mcp_server?: { name: string; source: string }
  /** Modo de permissão de quem chama; um agente de projeto pode declarar outro no frontmatter. */
  permission_mode?: string
}

/** Modos em que o card do DevDeck decide sozinho (a sessão do DevDeck roda sempre em `default`). */
const SAFE_MODES: ReadonlySet<string> = new Set(['default', 'plan'])

const deny = (reason: string): HookJSONOutput => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
})

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

/**
 * Decisão em tempo de execução (trava pedida pela Cybersecurity na H06.10): não depende de o SDK respeitar
 * `tools`. Tool fora da lista → `deny`; MCP de origem não aceita → `deny`; comando → `ask`; resto segue.
 */
export function policyFor(call: ToolCall): HookJSONOutput {
  const name = call.tool_name
  if (name.startsWith('mcp__')) {
    const source = call.mcp_server?.source
    if (source && ALLOWED_MCP_SOURCES.has(source)) return {}
    return deny('DevDeck: este servidor MCP não foi configurado no DevDeck nem no .mcp.json confiado.')
  }
  const canonical = Object.hasOwn(TOOL_ALIASES, name) ? TOOL_ALIASES[name] : name
  if (!AGENT_TOOLS.includes(canonical)) return deny(`DevDeck: a ferramenta ${name} não está liberada no chat.`)
  // Agente de projeto pode declarar `permissionMode` (security review da H06.10). Medido no SDK 0.3.330:
  // `bypassPermissions` é ignorado e `acceptEdits` ainda chama o canUseTool. Defesa em profundidade:
  // `acceptEdits` vira `ask` (card de sempre); qualquer outro modo fora de default/plan é negado.
  const mode = call.permission_mode
  if (mode && !SAFE_MODES.has(mode)) {
    if (mode !== 'acceptEdits') return deny(`DevDeck: modo de permissão ${mode} não é aceito no chat.`)
    return {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'DevDeck: edição passa pelo card.' }
    }
  }
  return askOutputFor(canonical)
}

export const agentPolicyHook: HookCallback = async (input) =>
  input.hook_event_name === 'PreToolUse'
    ? policyFor({ tool_name: input.tool_name, mcp_server: input.mcp_server, permission_mode: input.permission_mode })
    : {}

/**
 * Hooks passados ao `query()`. Sem matcher: vale para toda tool, inclusive MCP. `onFailure: 'block'` fecha
 * em falha: se o hook der erro, a tool é bloqueada em vez de seguir sem passar pela política.
 */
export function agentHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return { PreToolUse: [{ hooks: [agentPolicyHook], onFailure: 'block' }] }
}

/**
 * Opções de tools do `query()` num lugar só, para o teste pegar quem tirar uma delas (H06.10).
 * `disableClaudeAiConnectors` vale como flag: `true` aqui vence `false` de settings do projeto.
 */
export function agentToolOptions(): Pick<Options, 'tools' | 'disallowedTools' | 'hooks' | 'settings'> {
  return {
    tools: [...AGENT_TOOLS],
    disallowedTools: [...DISALLOWED_TOOLS],
    hooks: agentHooks(),
    settings: { disableClaudeAiConnectors: true }
  }
}
