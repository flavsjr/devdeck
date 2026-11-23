import { applyPatch, createTwoFilesPatch, parsePatch, reversePatch } from 'diff'

// Simulação de Edit/Write e reversão por patch. Puro: quem chama lê/grava o disco.

/** Aplica a semântica do tool Edit do Claude Code sobre `before`. */
export function applyEdit(before: string, input: Record<string, unknown>): string {
  const oldS = String(input.old_string ?? '')
  const newS = String(input.new_string ?? '')
  if (!oldS) return before
  if (input.replace_all) return before.split(oldS).join(newS)
  const i = before.indexOf(oldS)
  return i < 0 ? before : before.slice(0, i) + newS + before.slice(i + oldS.length)
}

export function makePatch(relPath: string, before: string, after: string): string {
  return createTwoFilesPatch(relPath, relPath, before, after, undefined, undefined, { context: 3 })
}

export type RevertResult = { ok: true; text: string } | { ok: false; error: string }

/** Desfaz `patch` sobre o conteúdo atual. Falha se nada a reverter ou se houver conflito. */
export function revertText(current: string, patch: string): RevertResult {
  const [parsed] = parsePatch(patch)
  if (!parsed || parsed.hunks.length === 0) return { ok: false, error: 'Nada a reverter: a alteração não mudou o arquivo.' }
  const restored = applyPatch(current, reversePatch(parsed))
  if (restored === false) return { ok: false, error: 'O arquivo mudou depois desta alteração; reversão automática conflitou.' }
  return { ok: true, text: restored }
}
