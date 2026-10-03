import type { Task } from '../../types/task'
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
  isTimeLog?: boolean
  parentId?: string | null
}

/** ブロックの縦位置（重なり計算と描画で同じ値を使う） */
export function blockGeometry(task: TimeBlockTask, dayKey: string | undefined, isLog: boolean): { top: number; height: number } {
  const seg = isLog && dayKey ? timeLogSegmentLayoutForDay(task as Task, dayKey) : null
  const top = seg?.top ?? timeToY(task.startTime)
  const height = seg?.height ?? Math.max(timeToY(task.endTime) - top, HOUR_HEIGHT / 4)
  return { top, height: Math.max(height, 18) }
}
