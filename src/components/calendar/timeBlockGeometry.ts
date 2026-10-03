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

/**
 * ブロックの縦位置（重なり計算と描画で同じ値を使う）。
 * `height` は短いものを最小高さまで引き伸ばした描画用、`span` は実際の時間の長さ（重なり判定用）
 */
export function blockGeometry(
  task: TimeBlockTask,
  dayKey: string | undefined,
  isLog: boolean,
): { top: number; height: number; span: number } {
  const seg = isLog && dayKey ? timeLogSegmentLayoutForDay(task as Task, dayKey) : null
  const top = seg?.top ?? timeToY(task.startTime)
  const span = seg?.span ?? Math.max(timeToY(task.endTime) - top, 0)
  const height = seg?.height ?? Math.max(span, HOUR_HEIGHT / 4)
  return { top, height: Math.max(height, 18), span }
}
