/** Unified shape for matching (Google / 自分で配置したタスク / 習慣スロット) */
export type PlannedSource = 'google' | 'scheduled-task' | 'habit'

export interface PlannedItem {
  id: string
  summary: string
  startTime: string
  endTime: string
  source: PlannedSource
}
