// "Alternar tema" da paleta (T47, H06.8; ADR-020). Pura: o tema efetivo chega como dado.
import type { ThemePref } from '@shared/types'

/**
 * Alterna pelo que está na tela, não pela preferência: claro vira Escuro e escuro vira Claro, inclusive
 * em "Sistema" (sai do Sistema e fixa o oposto do que o Windows mostra agora). Voltar ao Sistema é em
 * Configurações → Aparência.
 */
export function proximoTema(claroAgora: boolean): Exclude<ThemePref, 'system'> {
  return claroAgora ? 'dark' : 'light'
}

/** Rótulo do comando: diz para onde vai (o leitor de tela e a busca leem o destino). */
export function rotuloAlternarTema(claroAgora: boolean): string {
  return claroAgora ? 'Alternar tema: usar Escuro' : 'Alternar tema: usar Claro'
}
