import { useState } from 'react'

/** 中身（行の参照と並び）が同じなら同じ配列か */
export function sameRows<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * 中身（行の参照と並び）が前と同じなら、前の配列を返す。
 * `tasks.filter(...)` は毎回新しい配列なので、そこから作る索引や `memo` の部品が関係の無い変更でも作り直されるのを防ぐ
 */
export function useStableRows<T>(rows: T[]): T[] {
  const [prev, setPrev] = useState(rows)
  if (prev === rows || sameRows(prev, rows)) return prev
  // 描く途中で覚え直す（React はこの部品だけすぐ描き直す）
  setPrev(rows)
  return rows
}
