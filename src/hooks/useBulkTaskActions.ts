import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { displayListName } from '../lib/displayListName'
import type { Priority } from '../types/task'
import { toastTitle } from '../lib/undoWindow'

/**
 * タスクをまとめて操作する（右クリックメニュー・キー操作・選択中の操作で共通）。
 * 何件に何をしたかを「元に戻す」トーストで知らせる。1 件の期限・優先度は行の表示が変わるだけで分かるので出さない。
 * 移動は行が一覧から消えるので 1 件でも出す。削除の件数は `UndoToast` が出す
 */
export function useBulkTaskActions() {
  const { t } = useTranslation()
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const completeTasks = useTaskStore((s) => s.completeTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const archiveTasks = useTaskStore((s) => s.archiveTasks)

  return useMemo(() => {
    const many = (ids: string[], label: string) => (ids.length > 1 ? label : undefined)
    return {
      complete: (ids: string[]) => completeTasks(ids),
      remove: (ids: string[]) => deleteTasks(ids),
      archive: (ids: string[]) => archiveTasks(ids),
      setDue: (ids: string[], dateKey: string | null, dateLabel: string) =>
        bulkUpdateTasks(
          ids,
          { dueDate: dateKey },
          many(ids, dateKey ? t('undo.dueSet', { count: ids.length, label: dateLabel }) : t('undo.dueCleared', { count: ids.length })),
        ),
      setPriority: (ids: string[], priority: Priority) =>
        bulkUpdateTasks(ids, { priority }, many(ids, t('undo.prioritySet', { count: ids.length, label: t(`common.${priority}`) }))),
      moveToSection: (ids: string[], sectionId: string | null, name: string) =>
        bulkUpdateTasks(ids, { sectionId }, many(ids, t('undo.tasksMovedToSection', { count: ids.length, name }))),
      moveToList: (ids: string[], listId: string) => {
        const { lists, tasks } = useTaskStore.getState()
        const list = lists.find((l) => l.id === listId)
        if (!list) return
        const name = displayListName(list.id, list.name)
        const label =
          ids.length === 1
            ? t('undo.taskMoved', { title: toastTitle(tasks.find((x) => x.id === ids[0])?.title ?? ''), name })
            : t('undo.tasksMoved', { count: ids.length, name })
        bulkUpdateTasks(ids, { listId }, label)
      },
    }
  }, [t, bulkUpdateTasks, completeTasks, deleteTasks, archiveTasks])
}
