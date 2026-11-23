import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Config em .mjs (sem "type": "module" no package.json) => main e preload saem em CommonJS.
// O Claude Agent SDK é ESM-only: o main carrega via `await import()` (preservado no bundle CJS).
export default defineConfig({
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
    plugins: [react()]
  }
})
