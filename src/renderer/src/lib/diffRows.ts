import { diffLines, parsePatch } from 'diff'

// Linhas do visualizador de diff (unificado e lado a lado). Puro: testável sem DOM.

export type RowType = 'ctx' | 'add' | 'del' | 'gap'
export interface Row {
  type: RowType
  oldNo?: number
  newNo?: number
  text: string
}

export interface SplitRow {
  left?: Row
  right?: Row
  gap?: string
}

export const CONTEXT = 3

function splitLines(v: string): string[] {
  const lines = v.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function gapLabel(n: number): string {
  return `… ${n} ${n === 1 ? 'linha' : 'linhas'} sem alteração`
}

/** Limites da prévia (H05.4): acima disso o diff vira linear (correto, não mínimo) ou é cortado na tela. */
export const DIFF_LIMITS = { lines: 20_000, chars: 2 * 1024 * 1024, timeoutMs: 300, renderRows: 3_000, lineChars: 5_000 }

/** false = diff completo; 'timeout'/'size' = bloco do meio mostrado como remoção + adição; 'render' = linhas cortadas na tela. */
export type DiffPartial = false | 'timeout' | 'size' | 'render'

export interface DiffResult {
  rows: Row[]
  partial: DiffPartial
}

const NL = String.fromCharCode(10)
const joinLines = (lines: string[]): string => (lines.length ? lines.join(NL) + NL : '')

const cut = (line: string): string => (line.length > DIFF_LIMITS.lineChars ? `${line.slice(0, DIFF_LIMITS.lineChars)} … (linha cortada)` : line)

/**
 * Diff de texto que não congela a tela: corta prefixo/sufixo comuns em O(n), só chama o diff mínimo
 * dentro dos limites e com timeout; senão mostra o bloco do meio como remoção + adição.
 */
export function buildDiff(before: string, after: string): DiffResult {
  const a = splitLines(before)
  const b = splitLines(after)
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const midA = a.slice(pre, a.length - suf)
  const midB = b.slice(pre, b.length - suf)

  const rows: Row[] = []
  let o = 1
  let n = 1
  for (let i = 0; i < pre; i++) rows.push({ type: 'ctx', oldNo: o++, newNo: n++, text: cut(a[i]) })

  let partial: DiffPartial = false
  const size = midA.length + midB.length
  const chars = midA.reduce((s, l) => s + l.length, 0) + midB.reduce((s, l) => s + l.length, 0)
  const parts =
    size > DIFF_LIMITS.lines || chars > DIFF_LIMITS.chars
      ? undefined
      : diffLines(joinLines(midA), joinLines(midB), { timeout: DIFF_LIMITS.timeoutMs })
  if (parts) {
    for (const part of parts) {
      for (const line of splitLines(part.value)) {
        if (part.added) rows.push({ type: 'add', newNo: n++, text: cut(line) })
        else if (part.removed) rows.push({ type: 'del', oldNo: o++, text: cut(line) })
        else rows.push({ type: 'ctx', oldNo: o++, newNo: n++, text: cut(line) })
      }
    }
  } else {
    partial = size > DIFF_LIMITS.lines || chars > DIFF_LIMITS.chars ? 'size' : 'timeout'
    for (const line of midA) rows.push({ type: 'del', oldNo: o++, text: cut(line) })
    for (const line of midB) rows.push({ type: 'add', newNo: n++, text: cut(line) })
  }
  for (let i = a.length - suf; i < a.length; i++) rows.push({ type: 'ctx', oldNo: o++, newNo: n++, text: cut(a[i]) })

  let out = collapse(rows)
  if (out.length > DIFF_LIMITS.renderRows) {
    const hidden = out.length - DIFF_LIMITS.renderRows
    out = [...out.slice(0, DIFF_LIMITS.renderRows), { type: 'gap', text: `… ${hidden} linhas não exibidas na prévia` }]
    partial = partial || 'render'
  }
  return { rows: out, partial }
}

export function rowsFromTexts(before: string, after: string): Row[] {
  return buildDiff(before, after).rows
}

export function rowsFromPatch(patch: string): Row[] {
  const rows: Row[] = []
  const [p] = parsePatch(patch)
  if (!p) return rows
  p.hunks.forEach((h, hi) => {
    if (hi > 0 || h.oldStart > 1) rows.push({ type: 'gap', text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@` })
    let o = h.oldStart
    let n = h.newStart
    for (const line of h.lines) {
      const tag = line[0]
      const text = line.slice(1)
      if (tag === '+') rows.push({ type: 'add', newNo: n++, text })
      else if (tag === '-') rows.push({ type: 'del', oldNo: o++, text })
      else if (tag === ' ') rows.push({ type: 'ctx', oldNo: o++, newNo: n++, text })
    }
  })
  return rows
}

/** Recolhe trechos longos sem mudança, mantendo CONTEXT linhas em volta das alterações. */
export function collapse(rows: Row[]): Row[] {
  const keep = new Array<boolean>(rows.length).fill(false)
  rows.forEach((r, i) => {
    if (r.type === 'ctx') return
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true
  })
  if (!keep.some(Boolean)) return [{ type: 'gap', text: 'Sem diferenças' }]
  const out: Row[] = []
  let skipped = 0
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (skipped) out.push({ type: 'gap', text: gapLabel(skipped) })
      skipped = 0
      out.push(r)
    } else skipped++
  })
  if (skipped) out.push({ type: 'gap', text: gapLabel(skipped) })
  return out
}

export function toSplit(rows: Row[]): SplitRow[] {
  const out: SplitRow[] = []
  let dels: Row[] = []
  let adds: Row[] = []
  const flush = (): void => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) out.push({ left: dels[i], right: adds[i] })
    dels = []
    adds = []
  }
  for (const r of rows) {
    if (r.type === 'del') dels.push(r)
    else if (r.type === 'add') adds.push(r)
    else {
      flush()
      if (r.type === 'gap') out.push({ gap: r.text })
      else out.push({ left: r, right: r })
    }
  }
  flush()
  return out
}
