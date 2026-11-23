import { realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** realpath que funciona para arquivos ainda inexistentes (resolve o ancestral existente mais próximo). */
export function resolveReal(p: string): string {
  const tail: string[] = []
  let cur = p
  for (let i = 0; i < 256; i++) {
    try {
      return join(realpathSync.native(cur), ...tail.reverse())
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return p
      tail.push(basename(cur))
      cur = parent
    }
  }
  return p
}
