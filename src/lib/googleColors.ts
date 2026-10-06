/**
 * Google カレンダーの予定の色（11 色。API の colorId 1〜11）。リストの初期色・以前の色の読み替えに使う。
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

export const GOOGLE_COLOR_HEXES: readonly string[] = GOOGLE_COLORS.map((c) => c.hex)

/**
 * Google カレンダーの色選択（24 色、画面の並び順）。予定の 11 色はこの一部。
 * リスト・習慣・タスク・ラベル・予定の色はこの 24 色から選ぶ（`ui/ColorSwatches`）。ラベルは自由な色も選べる。
 */
export const CALENDAR_COLORS = [
  { key: 'radicchio', hex: '#AD1457' },
  { key: 'cherryBlossom', hex: '#D81B60' },
  { key: 'flamingo', hex: '#E67C73' },
  { key: 'tomato', hex: '#D50000' },
  { key: 'tangerine', hex: '#F4511E' },
  { key: 'pumpkin', hex: '#EF6C00' },
  { key: 'mango', hex: '#F09300' },
  { key: 'banana', hex: '#F6BF26' },
  { key: 'citron', hex: '#E4C441' },
  { key: 'avocado', hex: '#C0CA33' },
  { key: 'pistachio', hex: '#7CB342' },
  { key: 'basil', hex: '#0B8043' },
  { key: 'sage', hex: '#33B679' },
  { key: 'eucalyptus', hex: '#009688' },
  { key: 'peacock', hex: '#039BE5' },
  { key: 'cobalt', hex: '#4285F4' },
  { key: 'lavender', hex: '#7986CB' },
  { key: 'blueberry', hex: '#3F51B5' },
  { key: 'wisteria', hex: '#B39DDB' },
  { key: 'amethyst', hex: '#9E69AF' },
  { key: 'grape', hex: '#8E24AA' },
  { key: 'cocoa', hex: '#795548' },
  { key: 'graphite', hex: '#616161' },
  { key: 'birch', hex: '#A79B8E' },
] as const

export type CalendarColorKey = (typeof CALENDAR_COLORS)[number]['key']

/**
 * calendarList の色は旧パレット（colorId 1〜24 と、その旧い backgroundColor）で返るので、今の 24 色へ読み替える。
 * 並びは Calendar API の colors.calendar（colorId 順）。
 */
const LEGACY_CALENDAR: ReadonlyArray<readonly [hex: string, key: CalendarColorKey]> = [
  ['#ac725e', 'cocoa'],
  ['#d06b64', 'flamingo'],
  ['#f83a22', 'tomato'],
  ['#fa573c', 'tangerine'],
  ['#ff7537', 'pumpkin'],
  ['#ffad46', 'mango'],
  ['#42d692', 'eucalyptus'],
  ['#16a765', 'basil'],
  ['#7bd148', 'pistachio'],
  ['#b3dc6c', 'avocado'],
  ['#fbe983', 'citron'],
  ['#fad165', 'banana'],
  ['#92e1c0', 'sage'],
  ['#9fe1e7', 'peacock'],
  ['#9fc6e7', 'cobalt'],
  ['#4986e7', 'blueberry'],
  ['#9a9cff', 'lavender'],
  ['#b99aff', 'wisteria'],
  ['#c2c2c2', 'graphite'],
  ['#cabdbf', 'birch'],
  ['#cca6ac', 'radicchio'],
  ['#f691b2', 'cherryBlossom'],
  ['#cd74e6', 'grape'],
  ['#a47ae2', 'amethyst'],
]

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

/** 予定に自分の色（colorId 1〜11）が付いているか */
export function hasOwnEventColor(colorId: string | undefined): boolean {
  return !!colorId && !!EVENT_COLOR_BY_ID[colorId]
}

/**
 * Google の予定の色。個別に色を付けた予定はその色、無ければカレンダーの色（`calendarHex`、解決済み）、
 * それも無ければピーコック。
 * 注意: API の colorId は昔からの 11 色（1〜11）だけ。Google の画面で増えた色（アボカドなど）を付けた予定は
 * colorId が返らず、カレンダーの色と区別できない。
 */
export function googleEventHex(colorId: string | undefined, calendarHex: string | null | undefined): string {
  if (colorId && EVENT_COLOR_BY_ID[colorId]) return EVENT_COLOR_BY_ID[colorId]!
  return calendarHex || DEFAULT_GOOGLE_EVENT_HEX
}

/** 分類なし・未設定 */
export const NEUTRAL_HEX = '#9E9E9E'

/** 11 色・24 色どちらのキーでも */
export function hexForGoogleKey(key: string): string | null {
  return CALENDAR_COLORS.find((c) => c.key === key)?.hex ?? null
}

/**
 * カレンダーの色 → 表示する hex。colorId（1〜24）があればそれで、無ければ旧パレットの値・今の 24 色の値で引く。
 * どれでもない値（自分で作った色）は近い色に寄せず、そのまま使う（Google の画面もその色で出す）。
 */
export function calendarColorHex(hex: string | null | undefined, colorId?: string | null): string | null {
  const byId = colorId ? LEGACY_CALENDAR[Number(colorId) - 1] : undefined
  if (byId) return hexForGoogleKey(byId[1])
  if (!hex) return null
  const h = hex.trim().toLowerCase()
  const legacy = LEGACY_CALENDAR.find(([lh]) => lh === h)
  if (legacy) return hexForGoogleKey(legacy[1])
  const exact = CALENDAR_COLORS.find((c) => c.hex.toLowerCase() === h)
  if (exact) return exact.hex
  return /^#[0-9a-f]{6}$/.test(h) ? h.toUpperCase() : null
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
