import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { NEUTRAL_HEX } from './googleColors'
import { zonedNow } from './timeZone'

/**
 * カレンダー上の予定の見せ方。このアプリは「記録と可視化」が主役なので、色で目立つのは記録（実績）だけ。
 * 予定は薄く（`.gc-plan`）、時間が過ぎたら完了・未完了とも灰色（`.gc-missed`、完了は ✓ 付き）。
 * - done: 完了した予定 / missed: 終わったのに未完了 / upcoming: これから
 */
export type PlanVisualState = 'done' | 'missed' | 'upcoming'

export function planVisualState(
  task: Pick<Task, 'completed' | 'endTime' | 'startTime'>,
  dateKey: string,
  now = zonedNow(),
): PlanVisualState {
  if (task.completed) return 'done'
  const [y, m, d] = dateKey.split('-').map(Number)
  // 時刻つきは終了時刻、時刻なし（終日）と 0:00 終わり（23:00–0:00 など）はその日の終わりを過ぎたら「終わった」
  const end =
    task.endTime && task.endTime !== '00:00'
      ? new Date(y!, m! - 1, d!, ...(task.endTime.split(':').map(Number) as [number, number]))
      : new Date(y!, m! - 1, d! + 1)
  return end.getTime() < now.getTime() ? 'missed' : 'upcoming'
}

/** Google の予定も、タスクと同じく終わったら灰色にする（完了は無い） */
export function googleEventVisualState(
  e: Pick<CalendarEvent, 'startTime' | 'endTime'>,
  dateKey: string,
  now = zonedNow(),
): PlanVisualState {
  return planVisualState({ completed: false, startTime: e.startTime, endTime: e.endTime }, dateKey, now)
}

/** カレンダーでの予定の色: タスク自身の色（＝ラベル）。リストの色は使わない（色なしは「ラベルなし」の灰色） */
export function planHex(task: Pick<Task, 'color'>): string {
  return task.color || NEUTRAL_HEX
}

/** 時間が過ぎた予定の小さな色の丸・✓ の色（月のマスの「● 15:00 題名」、日パネルの行の丸） */
export const PASSED_HEX = '#BDBDBD'

/** 時間が過ぎた予定の文字（月のマス・日パネル・スケジュールの行の題名） */
export const PASSED_TEXT_CLASS = 'text-zinc-400 dark:text-zinc-500'

/** ラベルの無い色（灰色）か。時間が過ぎた灰色と見分けるため、塗らずに縁だけで見せる */
export function isUnlabeledHex(hex: string | null | undefined): boolean {
  return !hex || hex.toUpperCase() === NEUTRAL_HEX
}

/**
 * 予定の枠・帯の class（タイムラインの枠・終日の行・月のマスの終日の帯・スケジュールのカード）。
 * これから＝`gc-plan`（ラベルなしは塗らずに灰の縁だけの `gc-plan-none`）、時間が過ぎた（完了・未完了とも）＝`gc-missed`
 */
export function planTileClass(state: PlanVisualState, hex: string): string {
  if (state !== 'upcoming') return 'gc-missed'
  return isUnlabeledHex(hex) ? 'gc-plan-none' : 'gc-plan'
}

/**
 * 小さな色の丸の class（月のマスの ●、日パネル・スケジュールの行の丸）。これから＝その色の `gc-dot`（ラベルなしは縁だけの `gc-dot-none`）、
 * 時間が過ぎた＝灰色の丸（`PASSED_HEX` の `gc-dot`）。色は `planDotHex` を `colorVars` で渡す
 */
export function planDotClass(state: PlanVisualState, hex: string): string {
  return state === 'upcoming' && isUnlabeledHex(hex) ? 'gc-dot-none' : 'gc-dot'
}

export function planDotHex(state: PlanVisualState, hex: string): string {
  return state === 'upcoming' ? hex : PASSED_HEX
}
