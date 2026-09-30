/**
 * 記録の分類の色。以前は「候補の並び順」で 6 色を回していたため、並べ替えると過去の記録の色が変わり、
 * 7 個目で 1 個目と同じ色になっていた。分類ごとに色キーを保存し、区別しやすい 10 色から選ぶ。
 */

export const CATEGORY_COLOR_KEYS = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'lime',
  'fuchsia',
  'slate',
] as const

export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number]

export interface CategoryAccent {
  /** タイムラインのブロック・選択中チップ */
  bg: string
  text: string
  border: string
  /** 小さい丸・棒グラフ */
  dot: string
}

// Tailwind はクラス名を静的に拾うので、組み立てずに全部書く
const ACCENTS: Record<CategoryColorKey, CategoryAccent> = {
  blue: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950', text: 'text-violet-800 dark:text-violet-200', border: 'border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  rose: { bg: 'bg-rose-50 dark:bg-rose-950', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-200 dark:border-rose-800', dot: 'bg-rose-500' },
  cyan: { bg: 'bg-cyan-50 dark:bg-cyan-950', text: 'text-cyan-800 dark:text-cyan-200', border: 'border-cyan-200 dark:border-cyan-800', dot: 'bg-cyan-500' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-800 dark:text-orange-200', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  lime: { bg: 'bg-lime-50 dark:bg-lime-950', text: 'text-lime-800 dark:text-lime-200', border: 'border-lime-200 dark:border-lime-800', dot: 'bg-lime-500' },
  fuchsia: { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950', text: 'text-fuchsia-800 dark:text-fuchsia-200', border: 'border-fuchsia-200 dark:border-fuchsia-800', dot: 'bg-fuchsia-500' },
  slate: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-200', border: 'border-slate-300 dark:border-slate-600', dot: 'bg-slate-500' },
}

/** 分類なしの記録（控えめな灰色） */
export const UNCATEGORIZED_ACCENT: CategoryAccent = {
  bg: 'bg-zinc-50 dark:bg-zinc-800',
  text: 'text-zinc-700 dark:text-zinc-300',
  border: 'border-zinc-200 border-dashed dark:border-zinc-600',
  dot: 'bg-zinc-300 dark:bg-zinc-600',
}

export function isCategoryColorKey(v: unknown): v is CategoryColorKey {
  return typeof v === 'string' && (CATEGORY_COLOR_KEYS as readonly string[]).includes(v)
}

/** 分類名から決まる色（保存色が無い古い分類・候補に無い分類用。並び順に依存しない） */
function hashedKey(name: string): CategoryColorKey {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return CATEGORY_COLOR_KEYS[h % CATEGORY_COLOR_KEYS.length]!
}

export function categoryColorKey(name: string, colors: Readonly<Record<string, string>>): CategoryColorKey {
  const saved = colors[name]
  return isCategoryColorKey(saved) ? saved : hashedKey(name)
}

export function categoryAccent(name: string | null | undefined, colors: Readonly<Record<string, string>>): CategoryAccent {
  if (!name) return UNCATEGORIZED_ACCENT
  return ACCENTS[categoryColorKey(name, colors)]
}

/** 新しい分類に付ける色: まだ使われていない色を先頭から。全部使っていれば名前から決める */
export function nextCategoryColor(name: string, colors: Readonly<Record<string, string>>, names: readonly string[]): CategoryColorKey {
  const used = new Set(names.map((n) => categoryColorKey(n, colors)))
  return CATEGORY_COLOR_KEYS.find((k) => !used.has(k)) ?? hashedKey(name)
}

/** 既存の候補に並び順で色を振る（色を保存していなかったデータの移行用） */
export function assignColorsInOrder(names: readonly string[]): Record<string, CategoryColorKey> {
  const out: Record<string, CategoryColorKey> = {}
  names.forEach((n, i) => {
    out[n] = CATEGORY_COLOR_KEYS[i % CATEGORY_COLOR_KEYS.length]!
  })
  return out
}
