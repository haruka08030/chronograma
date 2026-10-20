import { nextDueDate, type DueItem } from '../../supabase/functions/daily-reminders/dues.ts'

/**
 * 引き落とし・期限の日（#454、追加機能の 1 つ）。家賃・サブスクの引き落とし、無料体験の終わり、パスポートの期限など。
 * To-Do には混ぜない（やることではなく「その日に起きること」）。カレンダーには祝日と同じ所に小さな印、
 * 今日の計画には当日と、知らせ始める日（何日前）から当日までだけ出す。統計・やり残しには数えない。
 * 追加機能の設定（`user_addons.addons.dues`）に持ち、端末間で同期する。
 * 日付の決め方と知らせる日は通知（Edge Function）と同じものを使う（`supabase/functions/daily-reminders/dues.ts`）
 */
export {
  DUE_MAX,
  DUE_TITLE_MAX,
  daysBetween,
  duesSoon,
  nextDueDate,
  normalizeDues,
  type DueItem,
  type DueRepeat,
  type DueSoon,
} from '../../supabase/functions/daily-reminders/dues.ts'

/** 「何日前から知らせるか」の選択肢 */
export const DUE_NOTIFY_OPTIONS = [0, 1, 3, 7, 30] as const

/** その日が期限の日か */
export const isDueOn = (item: Pick<DueItem, 'date' | 'repeat'>, dateKey: string) => nextDueDate(item, dateKey) === dateKey

/** その日の期限（カレンダーの印）。名前順 */
export function duesOn(items: readonly DueItem[], dateKey: string): DueItem[] {
  return items.filter((d) => isDueOn(d, dateKey)).sort((a, b) => a.title.localeCompare(b.title))
}

/** 残りの日数の色の段階（締切と同じ: 当日はオレンジ、明日は薄いオレンジ、それより先は灰色） */
export function dueSoonTone(daysLeft: number): 'today' | 'tomorrow' | 'future' {
  if (daysLeft <= 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return 'future'
}
