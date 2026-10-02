/** `HH:MM` の時刻文字列の計算（TimeInput と各画面で共有） */

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** `HH:MM` に分を足した `HH:MM`（24h で折り返し）。不正なら空文字。 */
export function addClockMinutes(hhmm: string, deltaMinutes: number): string {
  const base = toMinutes(hhmm)
  if (base === null) return ''
  const total = ((base + deltaMinutes) % 1440 + 1440) % 1440
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}
