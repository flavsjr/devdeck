// Ids que chegam de evento ou de estado e viram navegação (H07.4, ADR-021). Pura: sem `window`/`document`.
// O main gera ids de sessão e de item com `randomUUID()` (v4); o renderer só aceita UUID antes de navegar.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** UUID canônico (36 caracteres, versão 1–8, variante RFC). Qualquer outro valor é recusado. */
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && v.length === 36 && UUID_RE.test(v)
}
