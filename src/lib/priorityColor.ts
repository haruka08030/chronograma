import type { Priority } from '../types/task'

/**
 * 優先度の丸の色（To‑Do・カレンダーの右パネル・今日の計画で共通）。高＝赤・中＝黄・低＝青。なし は色を付けない。
 * 締切切れの赤とは「◯日遅れ」の文字で分ける（色だけに頼らない）
 */
export const PRIORITY_RING_CLASS: Record<string, string> = {
  high: 'text-red-500',
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
