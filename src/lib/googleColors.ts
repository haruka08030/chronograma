/**
 * Google カレンダーの予定の色（11 色）。リスト・習慣・記録の分類はすべてこのパレットから選ぶ。
 * 以前の HSL で作った 6 種のパレットは彩度が高く「パキパキ」していたので、落ち着いたこの 1 種に統一した。
 */

export const GOOGLE_COLORS = [
  { key: 'tomato', hex: '#D50000' },
  { key: 'flamingo', hex: '#E67C73' },
  { key: 'tangerine', hex: '#F4511E' },
  { key: 'banana', hex: '#F6BF26' },
  { key: 'sage', hex: '#33B679' },
  { key: 'basil', hex: '#0B8043' },
  { key: 'peacock', hex: '#039BE5' },
  { key: 'blueberry', hex: '#3F51B5' },
  { key: 'lavender', hex: '#7986CB' },
  { key: 'grape', hex: '#8E24AA' },
  { key: 'graphite', hex: '#616161' },
] as const

export type GoogleColorKey = (typeof GOOGLE_COLORS)[number]['key']

export const GOOGLE_COLOR_HEXES: readonly string[] = GOOGLE_COLORS.map((c) => c.hex)

/** Google Calendar API の予定の colorId（1〜11）→ 画面に出る色 */
const EVENT_COLOR_BY_ID: Record<string, string> = {
  '1': '#7986CB', // Lavender
  '2': '#33B679', // Sage
  '3': '#8E24AA', // Grape
  '4': '#E67C73', // Flamingo
  '5': '#F6BF26', // Banana
  '6': '#F4511E', // Tangerine
  '7': '#039BE5', // Peacock
  '8': '#616161', // Graphite
  '9': '#3F51B5', // Blueberry
  '10': '#0B8043', // Basil
  '11': '#D50000', // Tomato
}

export const DEFAULT_GOOGLE_EVENT_HEX = '#039BE5'

/**
 * Google の予定の色。個別に色を付けた予定はその色、無ければカレンダーの色
 * （API は旧パレットの値を返すので最も近い 11 色へ）、それも無ければピーコック。
 */
export function googleEventHex(colorId: string | undefined, calendarColor: string | null | undefined): string {
  if (colorId && EVENT_COLOR_BY_ID[colorId]) return EVENT_COLOR_BY_ID[colorId]!
  if (calendarColor) return nearestGoogleHex(calendarColor)
  return DEFAULT_GOOGLE_EVENT_HEX
}

/** 分類なし・未設定 */
export const NEUTRAL_HEX = '#9E9E9E'

export function hexForGoogleKey(key: string): string | null {
  return GOOGLE_COLORS.find((c) => c.key === key)?.hex ?? null
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 塗りつぶしの上の文字色（バナナのような明るい色の上だけ濃い文字） */
export function textOnHex(hex: string): string {
  const c = rgb(hex)
  if (!c) return '#ffffff'
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#3c4043' : '#ffffff'
}

function hueSatLight(hex: string): [number, number, number] | null {
  const c = rgb(hex)
  if (!c) return null
  const [r, g, b] = c.map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

/** 以前の色（パステルなど）を色味の最も近い Google の色へ（移行用）。彩度の低い色はグラファイト */
export function nearestGoogleHex(hex: string): string {
  if (GOOGLE_COLOR_HEXES.includes(hex.toUpperCase())) return hex.toUpperCase()
  const hsl = hueSatLight(hex)
  if (!hsl) return NEUTRAL_HEX
  const [h, s] = hsl
  if (s < 0.15) return '#616161'
  let best = GOOGLE_COLORS[0].hex as string
  let bestD = Infinity
  for (const c of GOOGLE_COLORS) {
    if (c.key === 'graphite') continue
    const ch = hueSatLight(c.hex)!
    const d = Math.min(Math.abs(ch[0] - h), 360 - Math.abs(ch[0] - h))
    if (d < bestD) {
      bestD = d
      best = c.hex
    }
  }
  return best
}
