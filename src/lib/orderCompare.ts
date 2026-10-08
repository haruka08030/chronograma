/**
 * order（並び順）で並べる比べ方。order が同じ行は id で決める（#357）。
 * order が同じになるのは、別々の端末で同じ所へ足したとき・古い版が送ったときなど。
 * id は文字コード順で比べる（localeCompare は言語設定で変わるので使わない）ので、どの端末でも同じ並びになる。
 */
export function compareByOrder(a: { order: number; id: string }, b: { order: number; id: string }): number {
  if (a.order !== b.order) return a.order - b.order
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
