/** 値として同じか（配列・オブジェクトは中身で比べる） */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** `patch` を当てると `row` の値が変わるか。同じ値を選び直しただけなら false */
export function patchChanges<T extends object>(row: T, patch: Partial<T>): boolean {
  return Object.entries(patch).some(([k, v]) => v !== undefined && !sameValue((row as Record<string, unknown>)[k], v))
}
