import { useEffect, useMemo, useState } from 'react'
import { buildDiff, rowsFromPatch, toSplit, type DiffPartial, type Row } from '../lib/diffRows'

function DiffStats({ rows }: { rows: Row[] }) {
  const add = rows.filter((r) => r.type === 'add').length
  const del = rows.filter((r) => r.type === 'del').length
  return (
    <span className="diff-stats">
      <span className="plus">+{add}</span> <span className="minus">−{del}</span>
    </span>
  )
}

const PARTIAL_TEXT: Record<Exclude<DiffPartial, false>, string> = {
  size: 'Prévia parcial: arquivo grande demais para o diff linha a linha. O trecho alterado aparece como remoção + adição.',
  timeout: 'Prévia parcial: o diff passou do tempo limite. O trecho alterado aparece como remoção + adição.',
  render: 'Prévia parcial: só as primeiras linhas do diff aparecem aqui.'
}

export function DiffView(props: { before?: string; after?: string; patch?: string; compact?: boolean; truncated?: boolean; onPartial?: (partial: boolean) => void }) {
  const [mode, setMode] = useState<'unified' | 'split'>('unified')
  const { rows, partial } = useMemo(
    () => (props.patch !== undefined ? { rows: rowsFromPatch(props.patch), partial: false as const } : buildDiff(props.before ?? '', props.after ?? '')),
    [props.before, props.after, props.patch]
  )
  const shownPartial: DiffPartial = props.truncated ? 'size' : partial
  const { onPartial } = props
  useEffect(() => onPartial?.(Boolean(shownPartial)), [shownPartial, onPartial])

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
      {shownPartial && (
        <p className="diff-partial" role="note">
          {PARTIAL_TEXT[shownPartial]}
        </p>
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
