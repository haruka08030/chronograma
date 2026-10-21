import { sameValue } from './sameValue'

/**
 * 利用者ごとに 1 行の設定（時間割・追加機能・よく入れる予定・授業と科目のつながり）と、行の中の小さなものの集まり
 * （習慣の日ごとの時間・To-Do の移した予定）を、中身ごとに三方向で合わせる部分。
 *
 * 1 つの値に、別々に足せる小さなもの（授業ごとの欠席・支払い・機能のオン・オフ …）がたくさん入っている。
 * 両方の端末で前回合わせた後に変えたとき、丸ごと新しいほうにすると片方で足したものが消える。
 * 前回合わせた版（`base`）と比べ、片方だけが変えたものはその側、両方が別の値に変えたものだけ `prefer` の側（新しいほう）にする。
 * `base` が無い（控えが無い）ときは両方にあるものを残す（片方で消したものはもう一方にあれば戻る）
 */
export type Side = 'l' | 'r'

/**
 * 1 つの値の三方向。無い（`undefined`）も 1 つの値（片方で消した）。両方が別の値に変えたら `prefer` の側にし、`onConflict` を呼ぶ
 */
export function merge3<T>(base: T | undefined, l: T | undefined, r: T | undefined, prefer: Side, onConflict?: () => void): T | undefined {
  if (sameValue(l, r)) return l
  if (sameValue(l, base)) return r
  if (sameValue(r, base)) return l
  onConflict?.()
  return prefer === 'l' ? l : r
}

/**
 * キーごとの三方向（`Record`）。キーの並びは `prefer` の側のあとにもう一方にしか無いもの。
 * `mergeValue` を渡すと、両方にあるキーの中身をさらに合わせる（欠席の日付の集合など。`baseKnown` は控えがあるか）
 */
export function merge3Record<T>(
  base: Readonly<Record<string, T>> | null,
  l: Readonly<Record<string, T>>,
  r: Readonly<Record<string, T>>,
  prefer: Side,
  onConflict?: () => void,
  mergeValue?: (b: T | undefined, l: T | undefined, r: T | undefined, baseKnown: boolean) => T | undefined,
): Record<string, T> {
  const [first, second] = prefer === 'l' ? [l, r] : [r, l]
  const out: Record<string, T> = {}
  for (const k of new Set([...Object.keys(first), ...Object.keys(second)])) {
    const has = (x: Readonly<Record<string, T>>) => Object.prototype.hasOwnProperty.call(x, k)
    const b = base && has(base) ? base[k] : undefined
    const lv = has(l) ? l[k] : undefined
    const rv = has(r) ? r[k] : undefined
    const v = mergeValue ? mergeValue(b, lv, rv, base !== null) : merge3(b, lv, rv, prefer, onConflict)
    if (v !== undefined) out[k] = v
  }
  return out
}

/**
 * 集合の三方向（文字列。同じかは `keyOf` で比べる）。どちらかにあるものは残し、前回の版にあってどちらかで外したものは外す。
 * 並びと書き方は `prefer` の側のあとに、もう一方にしか無いもの
 */
export function merge3Set(
  base: readonly string[] | null,
  l: readonly string[],
  r: readonly string[],
  prefer: Side,
  keyOf: (x: string) => string = (x) => x,
): string[] {
  const [first, second] = prefer === 'l' ? [l, r] : [r, l]
  const lk = new Set(l.map(keyOf))
  const rk = new Set(r.map(keyOf))
  const bk = base ? new Set(base.map(keyOf)) : null
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of [...first, ...second]) {
    const k = keyOf(x)
    if (seen.has(k)) continue
    seen.add(k)
    if (bk?.has(k) && (!lk.has(k) || !rk.has(k))) continue
    out.push(x)
  }
  return out
}

/**
 * id ごとの並びの三方向（支払い・よく入れる予定など）。同じ id の中身は `merge3`（片方で消し、もう一方で変えなかったものは消す）。
 * 並びは `prefer` の側のあとに、もう一方にしか無いもの
 */
export function merge3ById<T>(
  base: readonly T[] | null,
  l: readonly T[],
  r: readonly T[],
  idOf: (x: T) => string,
  prefer: Side,
  onConflict?: () => void,
): T[] {
  const byId = (xs: readonly T[]) => {
    const m = new Map<string, T>()
    for (const x of xs) if (!m.has(idOf(x))) m.set(idOf(x), x)
    return m
  }
  const bm = base ? byId(base) : null
  const lm = byId(l)
  const rm = byId(r)
  const [first, second] = prefer === 'l' ? [l, r] : [r, l]
  const out: T[] = []
  const seen = new Set<string>()
  for (const x of [...first, ...second]) {
    const id = idOf(x)
    if (seen.has(id)) continue
    seen.add(id)
    const v = merge3(bm?.get(id), lm.get(id), rm.get(id), prefer, onConflict)
    if (v !== undefined) out.push(v)
  }
  return out
}

/**
 * 両方の端末で前回合わせた後に変えたか（`settingSyncStep` が新しいほうに丸ごと任せる場面のうち、もとにした版が分かるもの）。
 * もとにした版が分からない（`syncedAt` が無い）ときは、前の版と同じく新しいほうに任せる
 */
export function bothChangedSince(local: { updatedAt: string | null; syncedAt?: string | null }, remote: { updatedAt: string }): boolean {
  return local.updatedAt !== null && local.syncedAt != null && local.updatedAt !== local.syncedAt && remote.updatedAt !== local.syncedAt
}

/**
 * 中身ごとに合わせた値の同期の手順。サーバーと同じ中身なら当てるだけ（版はサーバーの）、違えば当てて送る。
 * `conflicts` は両方が別の値に変えて新しいほうにした数（記録に送る、`noteMergeConflicts`）
 */
export function mergedSettingPlan<V>(
  merged: V,
  remote: { value: V; updatedAt: string },
  same: (a: V, b: V) => boolean,
  nowIso: string,
  conflicts: number,
): { apply: { value: V; updatedAt: string }; push?: { value: V; updatedAt: string; base: string }; conflicts: number } {
  if (same(merged, remote.value)) return { apply: { value: merged, updatedAt: remote.updatedAt }, conflicts }
  return { apply: { value: merged, updatedAt: nowIso }, push: { value: merged, updatedAt: nowIso, base: remote.updatedAt }, conflicts }
}
