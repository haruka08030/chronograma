/**
 * 開いているタブのうち 1 つだけを「代表」にする（Canvas・Notion の取り込みを 1 つのタブだけで走らせる）。
 * タブの数だけ同じ取り込みと書き換えが走ると、同期の行き違いが増える。
 * 代表のタブを閉じると、待っていた次のタブが代表になる。ロックが使えないブラウザでは全部のタブが代表
 */
const LOCK = 'chronograma-leader'

let leader = typeof navigator === 'undefined' || !navigator.locks
/** 最初に頼んだロックが取れたか（分かるまでの間も、同じ答えを待つ） */
let firstAnswer: Promise<boolean> | null = null

/** 閉じるまでロックを持ち続ける */
const holdForever = () => {
  leader = true
  return new Promise<void>(() => {})
}

/**
 * このタブが代表か。最初の 1 回はロックが取れるか（空いていればすぐ取れる）が分かるまで待つ
 * （前は最初に聞くと必ず「代表でない」と返り、開いた直後の取り込みが 5 分後まで飛ばされていた、#451）。
 * 取れなければ、代表のタブが閉じたら代われるよう並んでおく
 */
export function isLeaderTab(): Promise<boolean> {
  if (leader) return Promise.resolve(true)
  firstAnswer ??= new Promise<boolean>((resolve) => {
    void navigator.locks.request(LOCK, { ifAvailable: true }, (lock) => {
      if (lock) {
        resolve(true)
        return holdForever()
      }
      resolve(false)
      void navigator.locks.request(LOCK, holdForever)
      return undefined
    })
  })
  return firstAnswer.then((first) => first || leader)
}
