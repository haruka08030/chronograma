import { requestAction } from './pendingAction'

/** 今日の計画の「後から記録」を開く頼み（`RecordPanel` が受け取る） */
export const OPEN_LOG_LATER_ACTION = 'open-log-later'

/** 次に「後から記録」を開くときの時刻（1 日の締めの「ほかを記録」で、記録の無い時間をそのまま入れる） */
let pendingLaterSpan: { start: string; end: string } | null = null

/** 「後から記録」を、始まりと終わりを入れて開く（画面の上の記録のパネルまでスクロールする） */
export function requestLogLaterAt(start: string, end: string) {
  pendingLaterSpan = { start, end }
  requestAction(OPEN_LOG_LATER_ACTION)
}

/** 頼まれた時刻を受け取る（1 回きり） */
export function takePendingLaterSpan(): { start: string; end: string } | null {
  const span = pendingLaterSpan
  pendingLaterSpan = null
  return span
}
