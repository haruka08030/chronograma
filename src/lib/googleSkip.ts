import { courseKey } from './courseLinks'

/**
 * Google カレンダーに送らない予定の名前（#461）。移動・面接対策のような自分の段取りのための予定は、
 * アプリの中だけに置き、Google には送らない。名前は全角半角・大文字小文字・空白の違いだけ同じに数える
 * （授業と科目のつながりと同じ `courseKey`。部分一致はしない）。
 * 追加機能の設定（`user_addons.addons.googleSkip`）に持ち、端末間で同期する
 */

/** 持てる数・名前の長さ（`user_addons` の大きさの上限に十分収まる） */
export const GOOGLE_SKIP_MAX = 200
export const GOOGLE_SKIP_TEXT_MAX = 100

export const googleSkipKey = courseKey

/** 保存・同期から読んだ値をそろえる。空・同じ名前（先のもの）は外し、数は上限まで */
export function normalizeGoogleSkip(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const title = item.trim().slice(0, GOOGLE_SKIP_TEXT_MAX)
    const key = googleSkipKey(title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(title)
    if (out.length >= GOOGLE_SKIP_MAX) break
  }
  return out
}

/** 比べるための形の集まり */
export function googleSkipKeys(names: readonly string[]): Set<string> {
  return new Set(names.map(googleSkipKey))
}

export function isGoogleSkipped(names: readonly string[], title: string): boolean {
  const key = googleSkipKey(title)
  return !!key && names.some((n) => googleSkipKey(n) === key)
}

/** 送らない・送るを切り替えた並び（送らないにした名前は先頭に。上限を超えたら古いものから落とす） */
export function withGoogleSkip(names: readonly string[], title: string, skip: boolean): string[] {
  const key = googleSkipKey(title)
  if (!key) return [...names]
  const rest = names.filter((n) => googleSkipKey(n) !== key)
  return normalizeGoogleSkip(skip ? [title, ...rest] : rest)
}
