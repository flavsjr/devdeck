// Editor de segredos do MCP (H04.1). Puro: converte o texto do formulário no formato que o main aceita.

/**
 * Texto do editor → segredos para o main. Linha que ficou igual à máscara mostrada vira `null` (manter o valor
 * guardado); o main só aceita isso se o destino não mudou. Linha apagada = remover. Linha sem separador é ignorada.
 */
export function textToSecrets(text: string, sep: string, masked: Record<string, string> | undefined): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(sep)
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + sep.length).trim()
    if (!k) continue
    out[k] = masked?.[k] !== undefined && v === masked[k] ? null : v
  }
  return out
}

/** Mantém todos os segredos guardados (para ligar/desligar e mudar política sem redigitar). */
export const keepAll = (rec: Record<string, string> | undefined): Record<string, null> | undefined =>
  rec ? Object.fromEntries(Object.keys(rec).map((k) => [k, null])) : undefined
