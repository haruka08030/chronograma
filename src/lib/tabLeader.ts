/**
 * 開いているタブのうち 1 つだけを「代表」にする（Canvas・Notion の取り込みを 1 つのタブだけで走らせる）。
 * タブの数だけ同じ取り込みと書き換えが走ると、同期の行き違いが増える。
 * 代表のタブを閉じると、待っていた次のタブが代表になる。ロックが使えないブラウザでは全部のタブが代表
 */
let leader = typeof navigator === 'undefined' || !navigator.locks
let requested = false

export function isLeaderTab(): boolean {
  if (!requested && !leader) {
    requested = true
    void navigator.locks.request('chronograma-leader', () => {
      leader = true
      // 閉じるまで持ち続ける
      return new Promise<void>(() => {})
    })
  }
  return leader
}
