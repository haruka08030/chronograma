export type Priority = 'none' | 'low' | 'medium' | 'high'

export interface Recurrence {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
}

export interface Task {
  id: string
  title: string
  description: string
  completed: boolean
  /** 完了した瞬間の ISO 時刻。未完了は null。`updatedAt`（最終更新）とは別。レガシーで completed のみの行は null のことがある */
  completedAt: string | null
  createdAt: string
  updatedAt: string
  order: number
  listId: string
  /** リスト内セクション。null はセクションなし */
  sectionId: string | null
  parentId: string | null
  dueDate: string | null
  /** 終了日（`null` は `dueDate` と同日）。タイムログの複数日・睡眠の翌日など */
  endDate?: string | null
  startTime: string | null
  endTime: string | null
  /** 場所（自由入力）。Google カレンダー風に Google Map へ飛べる。`null`/空は未設定 */
  location?: string | null
  priority: Priority
  tags: string[]
  recurrence: Recurrence | null
  isTimeLog?: boolean
}
