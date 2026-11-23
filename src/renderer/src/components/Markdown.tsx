import type { ReactNode } from 'react'

// Renderizador mínimo: blocos de código, títulos, listas, `inline`, **negrito**.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    out.push(tok.startsWith('`') ? <code key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</code> : <strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function textBlock(src: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const lines = src.split('\n')
  let list: string[] = []
  let para: string[] = []
  const flushList = (): void => {
    if (!list.length) return
    nodes.push(
      <ul key={`${key}-ul-${nodes.length}`}>
        {list.map((l, i) => (
          <li key={i}>{inline(l, `${key}-li-${i}`)}</li>
        ))}
      </ul>
    )
    list = []
  }
  const flushPara = (): void => {
    if (!para.length) return
    nodes.push(<p key={`${key}-p-${nodes.length}`}>{inline(para.join('\n'), `${key}-p${nodes.length}`)}</p>)
    para = []
  }
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line)
    if (h) {
      flushList()
      flushPara()
      nodes.push(<h4 key={`${key}-h-${nodes.length}`}>{inline(h[2], `${key}-h${nodes.length}`)}</h4>)
    } else if (li) {
      flushPara()
      list.push(li[1])
    } else if (!line.trim()) {
      flushList()
      flushPara()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushList()
  flushPara()
  return nodes
}

export function Markdown({ text }: { text: string }) {
  const parts = text.split(/```/)
  return (
    <div className="md">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf('\n')
          const lang = nl > 0 ? part.slice(0, nl).trim() : ''
          const code = nl > 0 ? part.slice(nl + 1) : part
          return (
            <pre key={i} data-lang={lang || undefined}>
              <code>{code.replace(/\n$/, '')}</code>
            </pre>
          )
        }
        return textBlock(part, `b${i}`)
      })}
    </div>
  )
}
