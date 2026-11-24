import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectorClasses, topLevelBlocks } from './cssLayers'

// Varredura de camadas CSS (Sprint 05, H05.9; ação da retro da Sprint 04): regra nova no `shell` que reusa um
// nome de classe do `legacy` sobrescreve variantes sem avisar (dois bugs da Sprint 04 vieram daí).
const STYLES = resolve(__dirname, '../../../src/renderer/src/styles')
const read = (f: string): string => readFileSync(join(STYLES, f), 'utf8')
const LAYER_OF: Record<string, string> = { 'tokens.css': 'tokens', 'app.css': 'legacy', 'views.css': 'legacy', 'base.css': 'base', 'shell.css': 'shell' }

/**
 * Classes que hoje existem nas duas camadas (herança da Sprint 04). A lista só encolhe: classe nova
 * compartilhada quebra o teste, e classe que deixou de ser compartilhada precisa sair daqui.
 * Some de vez quando o `@layer legacy` for migrado (Sprint 06).
 */
const SHARED_EXCEPTIONS: string[] = [
  'ach', 'ach-icon', 'ach-title', 'active', 'app', 'approval', 'bad', 'btn', 'card', 'change-file', 'danger', 'empty',
  'ghost', 'hover-only', 'icon-btn', 'locked', 'logo', 'meter', 'modal', 'modal-backdrop', 'muted', 'on', 'pending-banner',
  'primary', 'rail', 'rail-badge', 'rail-btn', 'reminder', 'right', 'sb-item', 'seg', 'session-row', 'session-title',
  'side-title', 'sidebar', 'sm', 'small', 'statusbar', 'toast', 'tool-head', 'top', 'tree-ctx', 'tree-row', 'view-pad',
  'warn', 'ws-header'
]

describe('camadas CSS (H05.9)', () => {
  it('index.css declara a ordem das camadas', () => {
    expect(read('index.css')).toMatch(/@layer\s+tokens,\s*legacy,\s*base,\s*shell\s*;/)
  })

  it.each(Object.entries(LAYER_OF))('%s tem tudo dentro de @layer %s', (file, layer) => {
    const blocks = topLevelBlocks(read(file))
    const outside = blocks.filter((b) => !new RegExp(`^@layer\\s+${layer}\\s*\\{`).test(b))
    expect(outside, `regra fora de @layer ${layer} em ${file} (CSS sem camada vence todas as camadas)`).toEqual([])
  })

  it('shell não reusa nome de classe do legacy fora da lista de exceções', () => {
    const legacy = new Set([...selectorClasses(read('app.css')), ...selectorClasses(read('views.css'))])
    const shared = [...selectorClasses(read('shell.css'))].filter((c) => legacy.has(c)).sort()
    const novas = shared.filter((c) => !SHARED_EXCEPTIONS.includes(c))
    expect(novas, 'classe nova do shell com nome do legacy: use prefixo ou escopo (ex.: .statusbar .meter)').toEqual([])
    const resolvidas = SHARED_EXCEPTIONS.filter((c) => !shared.includes(c))
    expect(resolvidas, 'classe não é mais compartilhada: tire da lista SHARED_EXCEPTIONS').toEqual([])
  })
})
