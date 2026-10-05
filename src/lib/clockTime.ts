/** `HH:MM` の時刻文字列の計算（TimeInput と各画面で共有） */

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `HH:MM` → 0 時からの分（欠けた分は 0）。保存済みの時刻用。入力欄の検証は `toMinutes` */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 分 → `HH:MM`。折り返さないので終わりの 24:00 も書ける（折り返すのは `addClockMinutes`） */
export function minutesToTime(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
}

/** Date の壁時計の `HH:MM` */
export function clockOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 入力された `HH:MM` → 分。形が違えば null */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** `HH:MM` に分を足した `HH:MM`（24h で折り返し）。不正なら空文字。 */
export function addClockMinutes(hhmm: string, deltaMinutes: number): string {
  const base = toMinutes(hhmm)
  if (base === null) return ''
  const total = (((base + deltaMinutes) % 1440) + 1440) % 1440
  return minutesToTime(total)
}
