import type { AgentEvent } from '@shared/types'

// Canal único main → renderer (IPC 'agent:event').

type Emit = (e: AgentEvent) => void
let sink: Emit = () => undefined

export function setEmitter(fn: Emit): void {
  sink = fn
}

export function emit(e: AgentEvent): void {
  sink(e)
}
