import type { Priority } from '../types/task'

/**
 * 優先度の丸の色（To‑Do・カレンダーの右パネル・今日の計画で共通）。なし は色を付けない。
 * 高は赤にしない（赤は締切切れの色。赤い丸が「遅れている」と読まれ、2 型色覚では締切の色とも見分けられない）
 */
export const PRIORITY_RING_CLASS: Record<string, string> = {
  high: 'text-violet-500',
  medium: 'text-amber-500',
  low: 'text-blue-500',
}

/** 優先度を選ぶ場所（詳細・右クリックメニュー）の文字・アイコンの色。なし はグレー */
export const PRIORITY_TEXT_CLASS: Record<Priority, string> = {
  high: PRIORITY_RING_CLASS.high!,
  medium: PRIORITY_RING_CLASS.medium!,
  low: PRIORITY_RING_CLASS.low!,
  none: 'text-zinc-400',
}
