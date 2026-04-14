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
  createdAt: string
  updatedAt: string
  order: number
  listId: string
  parentId: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  priority: Priority
  tags: string[]
  recurrence: Recurrence | null
  isTimeLog: boolean
}
