// Datas no fuso local. Sem dependências de Electron/fs: testável isoladamente.

/** 'YYYY-MM-DD' no fuso local. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Meia-noite local de `daysAgo` dias antes de `now`. */
export function startOfDayAgo(now: Date, daysAgo: number): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}
