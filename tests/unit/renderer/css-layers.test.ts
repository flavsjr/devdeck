import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectorClasses, topLevelBlocks } from './cssLayers'

// Varredura de camadas CSS (Sprint 05, H05.9; ação da retro da Sprint 04): regra nova no `shell` que reusa um
// nome de classe do `legacy` sobrescreve variantes sem avisar (dois bugs da Sprint 04 vieram daí).
const STYLES = resolve(__dirname, '../../../src/renderer/src/styles')
const read = (f: string): string => readFileSync(join(STYLES, f), 'utf8')
const LAYER_OF: Record<string, string> = {
  'tokens.css': 'tokens',
  'app.css': 'legacy',
  'community.css': 'legacy',
  'base.css': 'base',
  'components.css': 'shell',
  'shell.css': 'shell',
  'views.css': 'views'
}
const LEGACY_FILES = Object.keys(LAYER_OF).filter((f) => LAYER_OF[f] === 'legacy')
const SHELL_FILES = Object.keys(LAYER_OF).filter((f) => LAYER_OF[f] === 'shell')
const shellClasses = (): Set<string> => new Set(SHELL_FILES.flatMap((f) => [...selectorClasses(read(f))]))

/**
 * Catraca do legado (H06.5): o total de linhas dos arquivos em `@layer legacy` só desce. Migrou uma área?
 * Baixe o número. Meta da Sprint 06: ≤ 835 (era 1.668).
 */
const LEGACY_MAX_LINES = 799

/**
 * Classes que hoje existem no shell e no legado (herança da Sprint 04). A lista só encolhe: classe nova
 * compartilhada quebra o teste, e classe que deixou de ser compartilhada precisa sair daqui.
 */
const SHARED_EXCEPTIONS: string[] = [
  'active', 'app', 'btn', 'card', 'danger', 'ghost', 'hover-only', 'icon-btn', 'logo', 'meter', 'modal', 'modal-backdrop',
  'on', 'primary', 'rail', 'rail-badge', 'rail-btn', 'right', 'sb-item', 'seg', 'session-row', 'session-title',
  'side-title', 'sidebar', 'sm', 'statusbar', 'top', 'tree-ctx', 'tree-row', 'view-pad', 'warn', 'ws-header'
]

/**
 * Classes que a camada `views` (a última, vence o shell) divide com o shell. Só com escopo da aba
 * (ex.: `.level-row .meter`); a lista só encolhe.
 */
const VIEWS_SHELL_SHARED: string[] = ['meter', 'on']

describe('camadas CSS (H05.9, H06.5)', () => {
  it('index.css declara a ordem das camadas', () => {
    expect(read('index.css')).toMatch(/@layer\s+tokens,\s*legacy,\s*base,\s*shell,\s*views\s*;/)
  })

  it.each(Object.entries(LAYER_OF))('%s tem tudo dentro de @layer %s', (file, layer) => {
    const blocks = topLevelBlocks(read(file))
    const outside = blocks.filter((b) => !new RegExp(`^@layer\\s+${layer}\\s*\\{`).test(b))
    expect(outside, `regra fora de @layer ${layer} em ${file} (CSS sem camada vence todas as camadas)`).toEqual([])
  })

  it('shell não reusa nome de classe do legacy fora da lista de exceções', () => {
    const legacy = new Set(LEGACY_FILES.flatMap((f) => [...selectorClasses(read(f))]))
    const shared = [...shellClasses()].filter((c) => legacy.has(c)).sort()
    const novas = shared.filter((c) => !SHARED_EXCEPTIONS.includes(c))
    expect(novas, 'classe nova do shell com nome do legacy: use prefixo ou escopo (ex.: .statusbar .meter)').toEqual([])
    const resolvidas = SHARED_EXCEPTIONS.filter((c) => !shared.includes(c))
    expect(resolvidas, 'classe não é mais compartilhada: tire da lista SHARED_EXCEPTIONS').toEqual([])
  })

  it('legado só encolhe (catraca de linhas, H06.5)', () => {
    const linhas = LEGACY_FILES.reduce((n, f) => n + read(f).split('\n').length - 1, 0)
    expect(linhas, `legado cresceu: ${linhas} > ${LEGACY_MAX_LINES}`).toBeLessThanOrEqual(LEGACY_MAX_LINES)
    expect(LEGACY_MAX_LINES - linhas, `legado encolheu para ${linhas}: baixe LEGACY_MAX_LINES`).toBeLessThan(20)
  })

  it('views não reusa classe do shell fora da lista (views vence o shell)', () => {
    const shell = shellClasses()
    const shared = [...selectorClasses(read('views.css'))].filter((c) => shell.has(c)).sort()
    expect(shared.filter((c) => !VIEWS_SHELL_SHARED.includes(c)), 'classe da views com nome do shell: use escopo da aba').toEqual([])
    expect(VIEWS_SHELL_SHARED.filter((c) => !shared.includes(c)), 'tire da lista VIEWS_SHELL_SHARED').toEqual([])
  })

  it('views não usa !important', () => {
    expect(read('views.css')).not.toMatch(/!important/)
  })
})
