import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes da lógica pura (src/main/lib, src/renderer/src/lib, src/shared).
// Rodam duas vezes: São Paulo (sem horário de verão) e Nova York (com horário de verão).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/lib/**', 'src/renderer/src/lib/**', 'src/shared/achievements.ts', 'src/shared/layout.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 80 }
    },
    projects: [
      { extends: true, test: { name: 'tz-sao-paulo', env: { TZ: 'America/Sao_Paulo' } } },
      { extends: true, test: { name: 'tz-new-york', env: { TZ: 'America/New_York' } } }
    ]
  }
})
