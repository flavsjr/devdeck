import { useMemo, useState } from 'react'
import { diffLines, parsePatch } from 'diff'

type RowType = 'ctx' | 'add' | 'del' | 'gap'
interface Row {
  type: RowType
  oldNo?: number
  newNo?: number
  text: string
}

const CONTEXT = 3

function splitLines(v: string): string[] {
  const lines = v.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function rowsFromTexts(before: string, after: string): Row[] {
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

function rowsFromPatch(patch: string): Row[] {
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
function collapse(rows: Row[]): Row[] {
  const keep = new Array(rows.length).fill(false)
  rows.forEach((r, i) => {
    if (r.type === 'ctx') return
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true
  })
  if (!keep.some(Boolean)) return rows.length ? [{ type: 'gap', text: 'Sem diferenças' }] : []
  const out: Row[] = []
  let skipped = 0
  rows.forEach((r, i) => {
    if (keep[i]) {
      if (skipped) out.push({ type: 'gap', text: `… ${skipped} linhas sem alteração` })
      skipped = 0
      out.push(r)
    } else skipped++
  })
  if (skipped) out.push({ type: 'gap', text: `… ${skipped} linhas sem alteração` })
  return out
}

interface SplitRow {
  left?: Row
  right?: Row
  gap?: string
}

function toSplit(rows: Row[]): SplitRow[] {
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

function DiffStats({ rows }: { rows: Row[] }) {
  const add = rows.filter((r) => r.type === 'add').length
  const del = rows.filter((r) => r.type === 'del').length
  return (
    <span className="diff-stats">
      <span className="plus">+{add}</span> <span className="minus">−{del}</span>
    </span>
  )
}

export function DiffView(props: { before?: string; after?: string; patch?: string; compact?: boolean }) {
  const [mode, setMode] = useState<'unified' | 'split'>('unified')
  const rows = useMemo(
    () => (props.patch !== undefined ? rowsFromPatch(props.patch) : rowsFromTexts(props.before ?? '', props.after ?? '')),
    [props.before, props.after, props.patch]
  )

  return (
    <div className={`diff ${props.compact ? 'compact' : ''}`}>
      {!props.compact && (
        <div className="diff-toolbar">
          <DiffStats rows={rows} />
          <div className="seg">
            <button className={mode === 'unified' ? 'on' : ''} onClick={() => setMode('unified')}>
              Unificado
            </button>
            <button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>
              Lado a lado
            </button>
          </div>
        </div>
      )}
      <div className="diff-body">
        {mode === 'unified' || props.compact ? (
          <table className="diff-table">
            <tbody>
              {rows.map((r, i) =>
                r.type === 'gap' ? (
                  <tr key={i} className="gap">
                    <td colSpan={3}>{r.text}</td>
                  </tr>
                ) : (
                  <tr key={i} className={r.type}>
                    <td className="ln">{r.oldNo ?? ''}</td>
                    <td className="ln">{r.newNo ?? ''}</td>
                    <td className="code">
                      <span className="sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
                      {r.text}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <table className="diff-table split">
            <tbody>
              {toSplit(rows).map((r, i) =>
                r.gap !== undefined ? (
                  <tr key={i} className="gap">
                    <td colSpan={4}>{r.gap}</td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="ln">{r.left?.oldNo ?? ''}</td>
                    <td className={`code ${r.left?.type === 'del' ? 'del' : r.left ? '' : 'empty'}`}>{r.left?.text ?? ''}</td>
                    <td className="ln">{r.right?.newNo ?? ''}</td>
                    <td className={`code ${r.right?.type === 'add' ? 'add' : r.right ? '' : 'empty'}`}>{r.right?.text ?? ''}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
