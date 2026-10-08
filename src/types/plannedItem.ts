/** Unified shape for matching (Google / 自分で配置したタスク / 予定（授業・バイト） / 習慣スロット) */
export type PlannedSource = 'google' | 'scheduled-task' | 'scheduled-event' | 'habit'

export interface PlannedItem {
  id: string
  summary: string
  startTime: string
  endTime: string
  source: PlannedSource
  /** Google の予定の色（解決済み）。記録にするときもこの色を写す */
  color?: string
  /** 自分で置いた To-Do・予定の id。▶ で始めた記録（`sourceTaskId`）と題名に関係なく組にする */
  taskId?: string
  /** ✓ で完了にした To-Do（記録が無くても予定どおりにやったものとして数える） */
  completed?: boolean
}
