import { describe, expect, it } from 'vitest'
import { APPROVAL_GUARD_MS, SHORTCUTS, isEditableTarget, keysFor, matchApprovalKey, matchShortcut, shortcutHelp, type KeyLike } from '../../../src/renderer/src/lib/shortcuts'

const k = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, altKey: false, shiftKey: false, ...mods })
const free = { editable: false }
const typing = { editable: true }

describe('matchShortcut', () => {
  it('Ctrl+K abre a paleta, inclusive digitando', () => {
    expect(matchShortcut(k('k', { ctrlKey: true }), free)).toBe('palette')
    expect(matchShortcut(k('K', { ctrlKey: true }), typing)).toBe('palette')
  })
  it('Ctrl+/ e F1 abrem a ajuda', () => {
    expect(matchShortcut(k('/', { ctrlKey: true }), typing)).toBe('help')
    expect(matchShortcut(k('F1'), free)).toBe('help')
  })
  it('Ctrl+1–8 trocam a aba fora de campo editável', () => {
    expect(matchShortcut(k('1', { ctrlKey: true }), free)).toBe('view:chat')
    expect(matchShortcut(k('8', { ctrlKey: true }), free)).toBe('view:settings')
    expect(matchShortcut(k('9', { ctrlKey: true }), free)).toBeNull()
  })
  it('em campo editável, Ctrl+B/L/N/1 não roubam a edição', () => {
    for (const key of ['b', 'l', 'n', '1']) expect(matchShortcut(k(key, { ctrlKey: true }), typing)).toBeNull()
  })
  it('Ctrl+B e Ctrl+Alt+B são ações diferentes', () => {
    expect(matchShortcut(k('b', { ctrlKey: true }), free)).toBe('toggleSidebar')
    expect(matchShortcut(k('b', { ctrlKey: true, altKey: true }), free)).toBe('toggleRightPanel')
  })
  it('AltGr (ABNT2) e composição de IME não disparam nada', () => {
    expect(matchShortcut(k('b', { ctrlKey: true, altKey: true, altGraph: true }), free)).toBeNull()
    expect(matchShortcut(k('k', { ctrlKey: true, isComposing: true }), free)).toBeNull()
  })
  it('modificador a mais não casa', () => {
    expect(matchShortcut(k('k', { ctrlKey: true, shiftKey: true }), free)).toBeNull()
    expect(matchShortcut(k('k'), free)).toBeNull()
  })
  it('com modal aberto só paleta e ajuda passam', () => {
    expect(matchShortcut(k('2', { ctrlKey: true }), { editable: false, modalOpen: true })).toBeNull()
    expect(matchShortcut(k('k', { ctrlKey: true }), { editable: true, modalOpen: true })).toBe('palette')
  })
  it('Cmd no macOS vale como Ctrl', () => {
    expect(matchShortcut(k('k', { metaKey: true }), free)).toBe('palette')
  })
})

describe('tabela de atalhos', () => {
  it('nenhum atalho global aprova ou rejeita', () => {
    expect(SHORTCUTS.map((s) => s.action).join(' ')).not.toMatch(/approv|reject|aprov/i)
  })
  it('sem duas entradas com a mesma combinação', () => {
    const combos = SHORTCUTS.map((s) => `${s.ctrl ? 'c' : ''}${s.alt ? 'a' : ''}${s.shift ? 's' : ''}+${s.key}`)
    expect(new Set(combos).size).toBe(combos.length)
  })
  it('ajuda agrupa teclas alternativas e keysFor devolve a primeira', () => {
    expect(shortcutHelp().find((h) => h.label === 'Atalhos de teclado')?.keys).toEqual(['Ctrl+/', 'F1'])
    expect(keysFor('view:agenda')).toBe('Ctrl+5')
  })
})

describe('isEditableTarget', () => {
  it('textarea, select, input de texto e contenteditable editam', () => {
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('checkbox, botão e nada não editam', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('matchApprovalKey (Cybersecurity B4)', () => {
  const shown = 1_000
  const later = shown + APPROVAL_GUARD_MS
  it('Alt+A aprova e Alt+R rejeita depois da janela de guarda', () => {
    expect(matchApprovalKey(k('a', { altKey: true }), shown, later)).toBe('approve')
    expect(matchApprovalKey(k('R', { altKey: true }), shown, later)).toBe('reject')
  })
  it('dentro dos 600 ms após o card aparecer, nada', () => {
    expect(matchApprovalKey(k('a', { altKey: true }), shown, later - 1)).toBeNull()
  })
  it('tecla repetida, IME, AltGr e outros modificadores não aprovam', () => {
    expect(matchApprovalKey(k('a', { altKey: true, repeat: true }), shown, later)).toBeNull()
    expect(matchApprovalKey(k('a', { altKey: true, isComposing: true }), shown, later)).toBeNull()
    expect(matchApprovalKey(k('a', { altKey: true, ctrlKey: true, altGraph: true }), shown, later)).toBeNull()
    expect(matchApprovalKey(k('a', { altKey: true, shiftKey: true }), shown, later)).toBeNull()
    expect(matchApprovalKey(k('a'), shown, later)).toBeNull()
  })
})
