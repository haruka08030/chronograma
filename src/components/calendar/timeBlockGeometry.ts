import type { Task, TaskKind } from '../../types/task'
import { HOUR_HEIGHT, timeToY } from '../../lib/timeGrid'
import { timeLogSegmentLayoutForDay } from '../../lib/taskTimeRange'

/** 週タイムラインのブロック用（列上では開始・終了時刻が必須。Google 等の外部ブロックは最小形） */
export type TimeBlockTask = {
  id: string
  title: string
  startTime: string
  endTime: string
  completed: boolean
  dueDate?: string | null
  endDate?: string | null
  kind?: TaskKind
  parentId?: string | null
}

/** ごく短いブロックが見えなくならないための下限（px）。それ以上は実際の分数どおり */
export const MIN_BLOCK_PX = 4

/**
 * ブロックの縦位置（重なり計算と描画で同じ値を使う）。
 * `height` は描画用（実際の分数どおり、下限 `MIN_BLOCK_PX`）、`span` は実際の時間の長さ（重なり判定用）
 */
export function blockGeometry(
  task: TimeBlockTask,
  dayKey: string | undefined,
  isLog: boolean,
): { top: number; height: number; span: number } {
  const seg = isLog && dayKey ? timeLogSegmentLayoutForDay(task as Task, dayKey) : null
  const top = seg?.top ?? timeToY(task.startTime)
  // 0:00 に終わる予定（23:00–0:00 など）はその日の終わりまで
  const endY = task.endTime === '00:00' ? 24 * HOUR_HEIGHT : timeToY(task.endTime)
  const span = seg?.span ?? Math.max(endY - top, 0)
  return { top, height: Math.max(span, MIN_BLOCK_PX), span }
}
