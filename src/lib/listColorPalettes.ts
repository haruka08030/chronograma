import { GOOGLE_COLOR_HEXES } from './googleColors'

/** 旧: リスト／習慣の色パレット（設定での切り替えは廃止。ID はバックアップ互換のためだけに残す） */

export type ListColorPaletteId =
  | 'pastel-rainbow'
  | 'tint-rainbow'
  | 'candy-soft'
  | 'neon-mute'
  | 'cool-pastel'
  | 'mono-hue'

interface ListColorPalette {
  id: ListColorPaletteId
  colors: readonly string[]
}

const HUES_10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324] as const

function hslToHex(h: number, s: number, l: number): string {
  const L = l / 100
  const a = (s / 100) * Math.min(L, 1 - L)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = L - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function spectrumPastel(s: number, l: number): readonly string[] {
  return HUES_10.map((h) => hslToHex(h, s, l))
}

const COOL_HUES = [188, 198, 208, 218, 228, 238, 248, 258, 268, 278] as const

const MONO_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => hslToHex(226, 12 + i * 1.8, 84 - i * 4.2))

export const LIST_COLOR_PALETTES: readonly ListColorPalette[] = [
  { id: 'pastel-rainbow', colors: spectrumPastel(42, 81) },
  { id: 'tint-rainbow', colors: spectrumPastel(32, 90) },
  { id: 'candy-soft', colors: spectrumPastel(52, 74) },
  { id: 'neon-mute', colors: spectrumPastel(48, 66) },
  { id: 'cool-pastel', colors: COOL_HUES.map((h) => hslToHex(h, 36, 83)) },
  { id: 'mono-hue', colors: MONO_STEPS },
] as const

export const DEFAULT_LIST_COLOR_PALETTE_ID: ListColorPaletteId = 'pastel-rainbow'

/**
 * 新しいリストに順に振る初期色（Google カレンダーの予定の 11 色）。選べる色は `ui/ColorSwatches` の 24 色
 * （引数は旧 API 互換のため残しているが使わない）。
 */
export function paletteColors(_paletteId?: string): readonly string[] {
  void _paletteId
  return GOOGLE_COLOR_HEXES
}

export function isValidListColorPaletteId(id: string): id is ListColorPaletteId {
  return LIST_COLOR_PALETTES.some((p) => p.id === id)
}

/** 以前のパレット ID からの移行用 */
const LEGACY_LIST_COLOR_PALETTE_IDS: Record<string, ListColorPaletteId> = {
  'dusty-rainbow': 'pastel-rainbow',
  'cool-mist': 'cool-pastel',
  'warm-clay': 'candy-soft',
  'forest-floor': 'tint-rainbow',
  'soft-ink': 'mono-hue',
}

export function normalizeListColorPaletteId(id: unknown): ListColorPaletteId {
  if (typeof id !== 'string') return DEFAULT_LIST_COLOR_PALETTE_ID
  if (isValidListColorPaletteId(id)) return id
  return LEGACY_LIST_COLOR_PALETTE_IDS[id] ?? DEFAULT_LIST_COLOR_PALETTE_ID
}
