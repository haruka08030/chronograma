/** 日付ラベルの緊急度。締切は焦らせてよい: 期限切れ > 今日 > 明日 > それ以外の順に強くする */
export type DateTone = 'overdue' | 'today' | 'tomorrow' | 'future' | 'past'

/** 締切の文字色。To-Do の行と今日の計画で同じ段階を使う */
export const DUE_TONE_CLASS: Record<DateTone, string> = {
  overdue: 'text-red-500 dark:text-red-400 font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  tomorrow: 'text-amber-500/90 dark:text-amber-300/80',
  future: 'text-zinc-500 dark:text-zinc-400',
  past: 'text-zinc-400 dark:text-zinc-500',
}

/**
 * 締切でない「近い・尽きた」の文字（期限の日・欠席の残り）。赤・オレンジは締切だけなので色は付けず、
 * 濃さと太さで段階を見せる（尽きた・今日 > 明日 > それ以外 > 過ぎた）
 */
export const NOTICE_TONE_CLASS: Record<DateTone, string> = {
  overdue: 'text-zinc-800 dark:text-zinc-100 font-semibold',
  today: 'text-zinc-800 dark:text-zinc-100 font-medium',
  tomorrow: 'text-zinc-600 dark:text-zinc-300 font-medium',
  future: 'text-zinc-500 dark:text-zinc-400',
  past: 'text-zinc-400 dark:text-zinc-500',
}

/**
 * 実行日（やる日）の文字色。過ぎたまま残っていても責める色にはしない（責める色は締切だけ。
 * 今日の計画でも同じものは灰色の「やり残し」に入る）
 */
export const SCHEDULED_TONE_CLASS: Record<DateTone, string> = {
  overdue: 'text-zinc-500 dark:text-zinc-400',
  today: 'text-date-600 dark:text-date-400 font-medium',
  tomorrow: 'text-date-500/90 dark:text-date-300/80',
  future: 'text-zinc-500 dark:text-zinc-400',
  past: 'text-zinc-400 dark:text-zinc-500',
}
