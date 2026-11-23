import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { isAppUrl } from './lib/origin'
import { describeZodError } from './lib/validation'

// Único ponto de registro de handlers IPC: valida a origem do chamador e os argumentos.

const devUrl = (): string | undefined => process.env.ELECTRON_RENDERER_URL

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  // Só o frame principal da UI do DevDeck; iframes (ex.: Spotify) e páginas externas são recusados.
  if (!frame || frame.parent !== null || !isAppUrl(frame.url, devUrl())) {
    throw new Error('Chamada IPC recusada: origem não autorizada.')
  }
}

/** Registra um handler com validação de origem e de argumentos (tupla zod). */
export function handle<A extends [] | [z.ZodType, ...z.ZodType[]], R>(
  channel: string,
  args: A,
  fn: (...values: { [K in keyof A]: A[K] extends z.ZodType ? z.output<A[K]> : never }) => R
): void {
  const schema = z.tuple(args as unknown as [z.ZodType, ...z.ZodType[]])
  ipcMain.handle(channel, (event, ...raw: unknown[]) => {
    assertTrustedSender(event)
    const parsed = (args.length ? schema.safeParse(raw) : { success: true as const, data: [] })
    if (!parsed.success) throw new Error(`Entrada inválida em ${channel}: ${describeZodError(parsed.error)}`)
    return fn(...(parsed.data as Parameters<typeof fn>))
  })
}
