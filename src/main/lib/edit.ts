import { applyPatch, createTwoFilesPatch, parsePatch, reversePatch } from 'diff'

// Simulação de Edit/Write e reversão por patch. Puro: quem chama lê/grava o disco.

export interface EditPreview {
  /** Conteúdo previsto depois do Edit (igual a `before` quando o Edit real vai falhar). */
  after: string
  /** Por que o Edit real vai falhar; a prévia mostra o aviso em vez de um diff enganoso. */
  error?: string
}

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const CRLF = CR + LF

/**
 * Semântica do tool Edit do Claude Code sobre `before`:
 * - `old_string` vazio só cria arquivo novo (ou vazio); com conteúdo, o Edit real falha.
 * - `old_string` ausente ou repetido sem `replace_all` → o Edit real falha.
 * - Arquivo CRLF com `old_string` em LF: o Claude Code normaliza as quebras; a prévia faz o mesmo e devolve CRLF.
 */
export function previewEdit(before: string, input: Record<string, unknown>): EditPreview {
  const oldS = String(input.old_string ?? '')
  const newS = String(input.new_string ?? '')
  if (!oldS) {
    if (before === '') return { after: newS }
    return { after: before, error: 'old_string vazio só cria arquivo novo: este arquivo já tem conteúdo e o Edit vai falhar.' }
  }
  const crlf = before.includes(CRLF) && !oldS.includes(CR)
  const text = crlf ? before.split(CRLF).join(LF) : before
  const count = text.split(oldS).length - 1
  if (count === 0) return { after: before, error: 'old_string não encontrado no arquivo: o Edit vai falhar.' }
  let out: string
  if (input.replace_all) out = text.split(oldS).join(newS)
  else if (count > 1) return { after: before, error: `old_string aparece ${count} vezes: sem replace_all o Edit vai falhar.` }
  else {
    const i = text.indexOf(oldS)
    out = text.slice(0, i) + newS + text.slice(i + oldS.length)
  }
  return { after: crlf ? out.split(LF).join(CRLF) : out }
}

/** Conteúdo previsto depois do Edit (sem o motivo de falha). */
export function applyEdit(before: string, input: Record<string, unknown>): string {
  return previewEdit(before, input).after
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
