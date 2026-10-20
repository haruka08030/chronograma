/**
 * この端末で前に Google カレンダーにつながっていた人（の ID）。起動時にこれが今の人なら、つながっているかを聞かずに
 * いきなり予定を取りに行く（つながっていなければ予定の取得が断り、そこで連携を外してこれも消す）。
 * 無い・別の人なら、今までどおり 1 回だけ聞く（ほかの端末でつないだかもしれない）
 */
const KEY = 'chronograma.googleConnected'
/** つながっていたのに切れた（Google が断った）。つなぎ直すまで「もう一度つなぐ」を出し続ける */
const LOST = ':lost'

export function wasGoogleConnected(userId: string): boolean {
  try {
    return localStorage.getItem(KEY) === userId
  } catch {
    return false
  }
}

/** つながっていると分かった */
export function rememberGoogleConnected(userId: string): void {
  try {
    localStorage.setItem(KEY, userId)
  } catch {
    /* 覚えられなければ次も聞くだけ */
  }
}

/** つながっていたのに切れた。次に開いたときも、確かめてつながらなければ「もう一度つなぐ」を出す */
export function markGoogleConnectionLost(userId: string): void {
  try {
    localStorage.setItem(KEY, userId + LOST)
  } catch {
    /* 覚えられなければ、次に開いたときは確かめるだけ */
  }
}

export function wasGoogleConnectionLost(userId: string): boolean {
  try {
    return localStorage.getItem(KEY) === userId + LOST
  } catch {
    return false
  }
}

/**
 * 予定を書き換える許可があるか（`<ID>:1` / `<ID>:0`）。カレンダーの画面を開く前から、アプリの予定を Google に送れるようにする。
 * 分からなければ null
 */
const WRITE_KEY = 'chronograma.googleCanWrite'

export function rememberGoogleCanWrite(userId: string, canWrite: boolean): void {
  try {
    localStorage.setItem(WRITE_KEY, `${userId}:${canWrite ? 1 : 0}`)
  } catch {
    /* 覚えられなければ、次も確かめるだけ */
  }
}

export function googleCanWriteHint(userId: string): boolean | null {
  try {
    const v = localStorage.getItem(WRITE_KEY)
    if (v === `${userId}:1`) return true
    if (v === `${userId}:0`) return false
    return null
  } catch {
    return null
  }
}

/** つながっていない・自分で外した・ログアウトした */
export function forgetGoogleConnected(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(WRITE_KEY)
  } catch {
    /* 消せなくても、次の予定の取得が断れば消える */
  }
}
