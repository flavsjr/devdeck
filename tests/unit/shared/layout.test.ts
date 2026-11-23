import { describe, expect, it } from 'vitest'
import { DEFAULT_UI, RIGHT_PANEL_DEFAULT, RIGHT_PANEL_MAX, RIGHT_PANEL_MIN, clampPanelWidth, rightPanelVisible, sanitizeUi } from '../../../src/shared/layout'
import * as v from '../../../src/main/lib/validation'

describe('clampPanelWidth', () => {
  it('limita à faixa e arredonda', () => {
    expect(clampPanelWidth(100)).toBe(RIGHT_PANEL_MIN)
    expect(clampPanelWidth(5000)).toBe(RIGHT_PANEL_MAX)
    expect(clampPanelWidth(451.6)).toBe(452)
  })
  it('NaN e infinito voltam ao padrão', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(RIGHT_PANEL_DEFAULT)
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(RIGHT_PANEL_DEFAULT)
  })
})

describe('sanitizeUi', () => {
  it('preenche o que falta e corrige valor velho do disco', () => {
    expect(sanitizeUi(undefined)).toEqual(DEFAULT_UI)
    expect(sanitizeUi({ rightPanelWidth: 9999 }).rightPanelWidth).toBe(RIGHT_PANEL_MAX)
    expect(sanitizeUi({ sidebarOpen: 'sim' as unknown as boolean }).sidebarOpen).toBe(true)
  })
})

describe('rightPanelVisible (B4)', () => {
  it('aprovação pendente trava o painel aberto', () => {
    expect(rightPanelVisible({ ...DEFAULT_UI, rightPanelOpen: false }, 1)).toBe(true)
    expect(rightPanelVisible({ ...DEFAULT_UI, rightPanelOpen: false }, 0)).toBe(false)
  })
  it('janela estreita: só abre a pedido ou com aprovação (não cobre o chat por padrão)', () => {
    expect(rightPanelVisible(DEFAULT_UI, 0, true, false)).toBe(false)
    expect(rightPanelVisible(DEFAULT_UI, 0, true, true)).toBe(true)
    expect(rightPanelVisible({ ...DEFAULT_UI, rightPanelOpen: false }, 2, true, false)).toBe(true)
  })
})

describe('settingsPatch.ui (zod)', () => {
  const ok = { sidebarOpen: true, rightPanelOpen: false, rightPanelWidth: 400 }
  it('aceita formato válido', () => {
    expect(v.settingsPatch.safeParse({ ui: ok }).success).toBe(true)
  })
  it('recusa largura fora da faixa, fracionária, campo extra ou faltando', () => {
    expect(v.settingsPatch.safeParse({ ui: { ...ok, rightPanelWidth: RIGHT_PANEL_MAX + 1 } }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ ui: { ...ok, rightPanelWidth: 400.5 } }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ ui: { ...ok, x: 1 } }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ ui: { sidebarOpen: true } }).success).toBe(false)
  })
})
