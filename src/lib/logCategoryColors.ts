/**
 * 記録の分類（ラベル）の色。分類ごとに Google カレンダーの色キー（24 色）か、自由に選んだ色の `#RRGGBB` を保存する
 * （並べ替えても色が変わらないように）。Google のラベルと同じく、ラベルは色に付けた名前として扱う。
 * 表示は CSS 変数 `--c` に色を渡し、`gc-solid`（記録の塗りつぶし）/ `gc-plan`（薄い予定）/ `gc-dot` で描く（index.css）。
 */
import type { CSSProperties } from 'react'
import { CALENDAR_COLORS, NEUTRAL_HEX, hexForGoogleKey, textOnHex, type CalendarColorKey } from './googleColors'

export const CATEGORY_COLOR_KEYS: readonly CalendarColorKey[] = CALENDAR_COLORS.map((c) => c.key)
export type CategoryColorKey = CalendarColorKey

const HEX_RE = /^#[0-9a-f]{6}$/i

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

/** 以前（Tailwind の 10 色）に保存したキーの読み替え */
const LEGACY_KEYS: Record<string, CategoryColorKey> = {
  blue: 'blueberry',
  emerald: 'sage',
  violet: 'lavender',
  amber: 'banana',
  rose: 'flamingo',
  cyan: 'peacock',
  orange: 'tangerine',
  lime: 'basil',
  fuchsia: 'grape',
  slate: 'graphite',
}

// 分類に割り当てる順番（隣り合う分類が似た色にならないよう、色相を飛ばして並べる）
const ASSIGN_ORDER: readonly CategoryColorKey[] = [
  'peacock', 'sage', 'tangerine', 'lavender', 'banana', 'flamingo', 'grape', 'basil', 'blueberry', 'tomato', 'graphite',
  'cobalt', 'mango', 'eucalyptus', 'cherryBlossom', 'pistachio', 'amethyst', 'citron', 'radicchio', 'wisteria', 'pumpkin',
  'avocado', 'cocoa', 'birch',
]
/** 名前から色を決めるときは以前の 11 色の範囲で（色を保存していない古い分類の色を変えないため） */
const HASH_ORDER = ASSIGN_ORDER.slice(0, 11)

export function isCategoryColorKey(v: unknown): v is CategoryColorKey {
  return typeof v === 'string' && (CATEGORY_COLOR_KEYS as readonly string[]).includes(v)
}

/** 分類名から決まる色（保存色が無い分類・候補に無い分類用。並び順に依存しない） */
function hashedKey(name: string): CategoryColorKey {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return HASH_ORDER[h % (HASH_ORDER.length - 1)]!
}

/** 分類の色キー。自由に選んだ色（24 色に無い）は null */
export function categoryColorKey(name: string, colors: Readonly<Record<string, string>>): CategoryColorKey | null {
  const saved = colors[name]
  if (isCategoryColorKey(saved)) return saved
  if (saved && LEGACY_KEYS[saved]) return LEGACY_KEYS[saved]!
  if (isHexColor(saved)) return colorKeyForHex(saved)
  return hashedKey(name)
}

/** 分類の色（分類なしは灰色） */
export function categoryHex(name: string | null | undefined, colors: Readonly<Record<string, string>>): string {
  if (!name) return NEUTRAL_HEX
  const saved = colors[name]
  if (isHexColor(saved)) return saved.toUpperCase()
  return hexForGoogleKey(categoryColorKey(name, colors) ?? '') ?? NEUTRAL_HEX
}

/** 色 → その色のラベル（分類）。Google と同じく、ラベルは色に付けた名前 */
export function labelForHex(
  hex: string | null | undefined,
  presets: readonly string[],
  colors: Readonly<Record<string, string>>,
): string | null {
  if (!hex) return null
  const h = hex.toUpperCase()
  return presets.find((n) => categoryHex(n, colors) === h) ?? null
}

/** `gc-solid` / `gc-plan` / `gc-dot` に渡すスタイル */
export function colorVars(hex: string): CSSProperties {
  return { '--c': hex, '--on-c': textOnHex(hex) } as CSSProperties
}

/** 新しい分類に付ける色: まだ使われていない色を割り当て順に。全部使っていれば名前から決める */
export function nextCategoryColor(name: string, colors: Readonly<Record<string, string>>, names: readonly string[]): CategoryColorKey {
  const used = new Set(names.map((n) => categoryColorKey(n, colors)))
  return ASSIGN_ORDER.find((k) => !used.has(k)) ?? hashedKey(name)
}

/** 既存の候補に割り当て順で色を振る（色を保存していなかったデータの移行・初期値用） */
export function assignColorsInOrder(names: readonly string[]): Record<string, CategoryColorKey> {
  const out: Record<string, CategoryColorKey> = {}
  names.forEach((n, i) => {
    out[n] = ASSIGN_ORDER[i % ASSIGN_ORDER.length]!
  })
  return out
}

/** 記録（ログ）の色: 記録自体の色（Google の予定から写した色など）があればそれ、無ければ分類の色 */
export function recordHex(task: { color?: string | null; tags: string[] }, colors: Readonly<Record<string, string>>): string {
  return task.color || categoryHex(task.tags[0], colors)
}

/** まだどの分類にも使われていない色（Google の並び順） */
export function unnamedColorKeys(presets: readonly string[], colors: Readonly<Record<string, string>>): CategoryColorKey[] {
  const used = new Set(presets.map((n) => categoryColorKey(n, colors)))
  return CATEGORY_COLOR_KEYS.filter((k) => !used.has(k))
}

/** `#RRGGBB` → Google の色キー（24 色に無い色は null） */
export function colorKeyForHex(hex: string | null | undefined): CategoryColorKey | null {
  if (!hex) return null
  const h = hex.toLowerCase()
  return CATEGORY_COLOR_KEYS.find((k) => hexForGoogleKey(k)?.toLowerCase() === h) ?? null
}
