import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Config em .mjs (sem "type": "module" no package.json) => main e preload saem em CommonJS.
// O Claude Agent SDK é ESM-only: o main carrega via `await import()` (preservado no bundle CJS).

/** A chave do Supabase vai embutida no app: só a publishable/anon é aceitável. */
function assertPublicSupabaseKey(mode) {
  const key = loadEnv(mode, process.cwd(), 'RENDERER_VITE_').RENDERER_VITE_SUPABASE_KEY ?? ''
  if (!key) return
  let role = ''
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? ''
    } catch {
      role = ''
    }
  }
  if (key.startsWith('sb_secret_') || role === 'service_role' || /service_role/i.test(key)) {
    throw new Error('RENDERER_VITE_SUPABASE_KEY parece ser uma chave secreta (service_role/sb_secret_). Use a chave publishable/anon.')
  }
}

// Remove do CSP de produção o que só existe para o HMR do Vite em dev.
const prodCsp = {
  name: 'devdeck-prod-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace(' ws://localhost:*', '')
}

export default defineConfig(({ mode }) => {
  assertPublicSupabaseKey(mode)
  return {
    main: {
      resolve: {
        alias: { '@shared': resolve('src/shared') }
      }
    },
    preload: {
      resolve: {
        alias: { '@shared': resolve('src/shared') }
      }
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react(), prodCsp],
      build: {
        // Fonte nunca vira data: URI (a CSP só aceita font-src 'self'); demais assets seguem o padrão do Vite.
        assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined)
      }
    }
  }
})
