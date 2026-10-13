import { useTaskStore } from '../store/taskStore'

/** 次に開く週のふりかえりで見せる日（`openReviewDay`）。ふりかえりが開いたら `clearReviewDay` で消す */
let pendingDay: string | null = null

/** 統計を開き、週のふりかえりをその日（`yyyy-MM-dd`）を含む週にする（今日の計画の過ぎた日の 1 行から） */
export function openReviewDay(dateKey: string) {
  pendingDay = dateKey
  useTaskStore.getState().selectView('stats')
}

/** 週のふりかえりが最初に見せる日（無ければ null = 今週） */
export function peekReviewDay(): string | null {
  return pendingDay
}

export function clearReviewDay() {
  pendingDay = null
}
