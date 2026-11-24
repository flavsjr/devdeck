import type { ThemePref } from '@shared/types'

// Regra pura do tema (H06.1, ADR-020): qual preferência vale e qual cor de fundo a janela usa
// antes do CSS carregar. Sem electron: o main passa `nativeTheme.shouldUseDarkColors` como dado.

export type { ThemePref }

/** Valores aceitos, na ordem do seletor. Fonte única para o `z.enum` do IPC. */
export const THEME_PREFS = ['system', 'dark', 'light'] as const satisfies readonly ThemePref[]

/** Garante em tempo de compilação que a lista cobre todo o tipo (nada a mais, nada a menos). */
type _Cobre = ThemePref extends (typeof THEME_PREFS)[number] ? true : never
const _cobre: _Cobre = true
void _cobre

const isThemePref = (v: unknown): v is ThemePref => typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v)

/**
 * Preferência efetiva a partir do valor lido do disco.
 * - valor válido passa;
 * - presente mas inválido (arquivo editado à mão, versão futura) vira 'system', sem lançar;
 * - ausente com settings já existente (quem usava antes do tema claro) fica 'dark', como sempre foi;
 * - ausente em instalação nova segue o sistema.
 */
export function resolveTheme(raw: unknown, settingsExistia: boolean): ThemePref {
  if (isThemePref(raw)) return raw
  if (raw !== undefined) return 'system'
  return settingsExistia ? 'dark' : 'system'
}

/**
 * Fundo da janela por tema efetivo, igual ao `--bg` de cada tema em `styles/tokens.css`
 * (tests/unit/main/theme.test.ts confere). Mapa fixo no main: nunca vem do renderer.
 */
export const THEME_BG = {
  dark: '#0b0d12',
  light: '#ffffff'
} as const satisfies Record<'dark' | 'light', string>

/** Cor de fundo para `BrowserWindow`: recebe `nativeTheme.shouldUseDarkColors`. */
export function themeBg(shouldUseDarkColors: boolean): string {
  return shouldUseDarkColors ? THEME_BG.dark : THEME_BG.light
}
