import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { nextChildDue } from '../lib/childDue'
import type { DateTone } from '../components/ui/dueTone'
import { dueDateLabel } from '../components/ui/dueDateLabel'

/** 親の行に出す子の締切（子と、締切の言葉・色） */
export type ChildDue = { child: Task; text: string; tone: DateTone }

/**
 * 親の行に出す、まだ終わっていない子のいちばん近い締切（企業の下の ES 締切など）。
 * 親の締切のほうが先か同じなら出さない
 */
export function useChildDue(task: Task, enabled: boolean): ChildDue | null {
  const { t, i18n } = useTranslation()
  const child = useTaskStore((s) => (enabled && !task.completed ? nextChildDue(s.tasks, task.id) : undefined))
  if (!child?.dueDate || (task.dueDate && task.dueDate <= child.dueDate)) return null
  return { child, ...dueDateLabel(child.dueDate, child.dueTime, t, i18n.resolvedLanguage) }
}
