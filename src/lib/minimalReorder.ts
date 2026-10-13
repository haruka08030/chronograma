/**
 * 並べ替えたあとの順番の値。今の値（並べ替えた後の並びの順）のうち、増え続けている最も長い並びはそのまま残し、
 * ほかの行だけに前後の残した行の間の値を付ける。1 件動かせば変わるのは 1 行（順番の列は小数を持てる）。
 *
 *   minimalReorder([0, 1, 5, 2, 3]) // → [0, 1, 1.5, 2, 3]（5 を 1 と 2 の間へ動かした）
 */
export function minimalReorder(current: readonly number[]): number[] {
  const n = current.length
  if (n === 0) return []
  // 増え続ける最も長い並び（値が同じものは増えていない扱い）
  const tails: number[] = []
  const prev = new Array<number>(n).fill(-1)
  for (let i = 0; i < n; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (current[tails[mid]!]! < current[i]!) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]!
    tails[lo] = i
  }
  const keep = new Set<number>()
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) keep.add(i)

  const out = [...current]
  let i = 0
  while (i < n) {
    if (keep.has(i)) {
      i++
      continue
    }
    // 残さない行の塊 [i, j) を、前後の残した値の間に等間隔で入れる
    let j = i
    while (j < n && !keep.has(j)) j++
    const lowVal = i > 0 ? out[i - 1]! : null
    const highVal = j < n ? out[j]! : null
    const count = j - i
    for (let k = 0; k < count; k++) {
      if (lowVal === null && highVal === null) out[i + k] = k
      else if (lowVal === null) out[i + k] = highVal! - (count - k)
      else if (highVal === null) out[i + k] = lowVal + (k + 1)
      else out[i + k] = lowVal + ((highVal - lowVal) * (k + 1)) / (count + 1)
    }
    i = j
  }
  return out
}
