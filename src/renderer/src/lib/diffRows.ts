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

export function rowsFromTexts(before: string, after: string): Row[] {
  const rows: Row[] = []
  let o = 1
  let n = 1
  for (const part of diffLines(before, after)) {
    for (const line of splitLines(part.value)) {
      if (part.added) rows.push({ type: 'add', newNo: n++, text: line })
      else if (part.removed) rows.push({ type: 'del', oldNo: o++, text: line })
      else rows.push({ type: 'ctx', oldNo: o++, newNo: n++, text: line })
    }
  }
  return collapse(rows)
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
