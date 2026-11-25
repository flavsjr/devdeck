import { z } from 'zod'
import { RIGHT_PANEL_MAX, RIGHT_PANEL_MIN } from '@shared/layout'
import { HELP_TOPICS } from './help'
import { THEME_PREFS } from './theme'

// Esquemas de entrada do IPC. Tudo que vem do renderer passa por aqui antes de tocar disco, rede ou processo.

export const uuid = z.uuid()
/** '' (novo) ou UUID existente. */
export const newOrUuid = z.union([z.literal(''), uuid])
export const relPath = z.string().max(1024)
const shortText = (max: number): z.ZodString => z.string().max(max)
const money = z.number().finite().min(0).max(100_000)
const minutes = z.number().finite().min(0).max(24 * 60)
const httpsUrl = z.string().max(2000).regex(/^https:\/\//i, 'precisa começar com https://')

export const settingsPatch = z
  .strictObject({
    model: z.string().regex(/^claude-[a-z0-9.-]{1,60}$/),
    effort: z.enum(['', 'low', 'medium', 'high', 'xhigh', 'max']),
    dailyBudgetUsd: money,
    sessionBudgetUsd: money,
    loadProjectSettings: z.boolean(),
    appendSystemPrompt: shortText(4000),
    spotifyUrl: z.union([z.literal(''), z.string().max(300).regex(/^(https:\/\/open\.spotify\.com\/|spotify:)/)]),
    ui: z.strictObject({
      sidebarOpen: z.boolean(),
      rightPanelOpen: z.boolean(),
      rightPanelWidth: z.number().int().min(RIGHT_PANEL_MIN).max(RIGHT_PANEL_MAX)
    }),
    // Lista fechada (ADR-020): o valor vira `nativeTheme.themeSource`, nunca cor ou CSS do renderer.
    theme: z.enum(THEME_PREFS)
  })
  .partial()

export const apiKey = z.union([z.null(), z.string().min(1).max(512)])

export const devProfilePatch = z
  .strictObject({
    displayName: shortText(60),
    headline: shortText(120),
    featured: z.array(shortText(64)).max(3)
  })
  .partial()

export const providerId = z.enum(['github', 'gitlab', 'bitbucket'])
export const providerToken = z.union([z.null(), z.string().min(1).max(512)])

/** Valor de segredo vindo do renderer: `null` = manter o guardado (ver lib/secrets). */
const secretValue = z.union([z.null(), shortText(4000)])

export const mcpInput = z.strictObject({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  enabled: z.boolean(),
  type: z.enum(['stdio', 'http', 'sse']),
  command: shortText(1000).optional(),
  args: z.array(shortText(2000)).max(100).optional(),
  env: z.record(z.string().max(200), secretValue).optional(),
  url: z.string().max(2000).regex(/^https?:\/\//i).optional(),
  headers: z.record(z.string().max(200), secretValue).optional(),
  toolPolicies: z.record(z.string().max(200), z.enum(['auto', 'ask'])).optional()
})

export const mcpName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

const recurrence = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('daily') }),
  z.strictObject({ kind: z.literal('weekdays') }),
  z.strictObject({ kind: z.literal('weekly'), days: z.array(z.number().int().min(0).max(6)).max(7) })
])

export const agendaEvent = z.strictObject({
  id: newOrUuid,
  title: shortText(200),
  notes: shortText(5000).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  durationMin: z.number().finite().min(1).max(24 * 60),
  recurrence,
  remindMin: minutes,
  link: httpsUrl.optional(),
  kind: z.enum(['daily', 'meeting', 'reminder', 'focus']),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})

/** lastSync/error/count só o main escreve; `url: ''` mantém o link guardado. */
export const icsFeedInput = z.strictObject({
  id: newOrUuid,
  name: shortText(60),
  url: z.union([z.literal(''), z.string().max(2000).regex(/^(https|webcal):\/\//i)]),
  enabled: z.boolean(),
  remindMin: minutes
})

export const communityStats = z.strictObject({
  articles: z.number().int().min(0).max(1_000_000),
  snippets: z.number().int().min(0).max(1_000_000),
  likesReceived: z.number().int().min(0).max(100_000_000)
})

export const approvalDecision = z.union([
  z.strictObject({ approve: z.literal(true), alwaysForSession: z.boolean().optional() }),
  z.strictObject({ approve: z.literal(false), feedback: shortText(4000).optional() })
])

export const timestamp = z.number().finite().min(0).max(8.64e15)
export const chatText = shortText(200_000)
export const chatContext = z.array(relPath).max(50)
export const sessionTitle = shortText(200)
export const externalUrl = z.string().max(4000).regex(/^https?:\/\//i)
/** Tópico de ajuda: chave de lista fechada, nunca URL (a URL fica no mapa fixo de lib/help). */
export const helpTopic = z.enum(HELP_TOPICS)

/** Mensagem curta e legível a partir de um erro do zod. */
export function describeZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`)
    .join('; ')
}
