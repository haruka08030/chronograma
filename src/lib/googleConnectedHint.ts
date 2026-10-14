/**
 * この端末で前に Google カレンダーにつながっていた人（の ID）。起動時にこれが今の人なら、つながっているかを聞かずに
 * いきなり予定を取りに行く（つながっていなければ予定の取得が断り、そこで連携を外してこれも消す）。
 * 無い・別の人なら、今までどおり 1 回だけ聞く（ほかの端末でつないだかもしれない）
 */
const KEY = 'chronograma.googleConnected'

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

/** つながっていない・外した・ログアウトした */
export function forgetGoogleConnected(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 消せなくても、次の予定の取得が断れば消える */
  }
}
