import { app } from 'electron'
import type { AppLocation } from './lib/origin'

// Localização da UI: o dev server só vale fora do app empacotado (variável de ambiente não abre brecha em produção).
// Fora do dev, a UI vem de app://devdeck (H05.2).
export function appLocation(): AppLocation {
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  return devUrl ? { devUrl } : { appScheme: true }
}
