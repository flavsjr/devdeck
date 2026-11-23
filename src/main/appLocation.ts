import { app } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppLocation } from './lib/origin'

// Localização da UI: o dev server só vale fora do app empacotado (variável de ambiente não abre brecha em produção).
export function appLocation(): AppLocation {
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  return devUrl ? { devUrl } : { fileUrl: pathToFileURL(join(__dirname, '../renderer/index.html')).href }
}
