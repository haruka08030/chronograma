import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { displayListName } from '../lib/displayListName'
import { isLogTask, type Priority, type Task } from '../types/task'
import { toastTitle } from '../lib/undoWindow'
import { UNSCHEDULE_PATCH } from '../lib/calendarItemDrag'
import { colorLabelText } from '../lib/todoColorLabels'

/**
 * タスクをまとめて操作する（右クリックメニュー・キー操作・選択中の操作で共通）。
 * 何件に何をしたかを「元に戻す」トーストで知らせる。1 件の期限・優先度は行の表示が変わるだけで分かるので出さない。
 * 移動は行が一覧から消えるので 1 件でも出す。削除の件数は `UndoToast` が出す。
 * 今と同じ値を選び直したタスクは対象から外す（何も変わらないのにトーストや取り消しの履歴を積まない）
 */
export function useBulkTaskActions() {
  const { t } = useTranslation()
  const bulkUpdateTasks = useTaskStore((s) => s.bulkUpdateTasks)
  const completeTasks = useTaskStore((s) => s.completeTasks)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const archiveTasks = useTaskStore((s) => s.archiveTasks)

  return useMemo(() => {
    const many = (ids: string[], label: string) => (ids.length > 1 ? label : undefined)
    /** 値が変わるタスクだけ */
    const changing = (ids: string[], differs: (task: Task) => boolean) => {
      const { tasks } = useTaskStore.getState()
      return ids.filter((id) => {
        const task = tasks.find((x) => x.id === id)
        return task ? differs(task) : false
      })
    }
    const uncomplete = (ids: string[]) => {
      const targets = changing(ids, (x) => x.completed)
      if (targets.length === 0) return
      useTaskStore.getState().asOneUndo(() => targets.forEach((id) => toggleTask(id)))
    }
    return {
      complete: (ids: string[]) => completeTasks(ids),
      /** 完了済みのものを未完了に戻す（繰り返しの次回は `toggleTask` が片付ける） */
      uncomplete,
      /** ⌘↵: 全部済みなら未完了に戻し、そうでなければ完了にする */
      toggleComplete: (ids: string[]) => (changing(ids, (x) => !x.completed).length === 0 ? uncomplete(ids) : completeTasks(ids)),
      remove: (ids: string[]) => deleteTasks(ids),
      archive: (ids: string[]) => archiveTasks(ids),
      setDue: (all: string[], dateKey: string | null, dateLabel: string) => {
        const ids = changing(all, (x) => x.dueDate !== dateKey)
        bulkUpdateTasks(
          ids,
          { dueDate: dateKey },
          many(ids, dateKey ? t('undo.dueSet', { count: ids.length, label: dateLabel }) : t('undo.dueCleared', { count: ids.length })),
        )
      },
      /** 締切の日付と時刻をまとめて（「日時を指定…」）。時刻が空なら時刻なしの締切 */
      setDueAt: (all: string[], dateKey: string, time: string | null, label: string) => {
        const ids = changing(all, (x) => x.dueDate !== dateKey || (x.dueTime ?? null) !== time)
        bulkUpdateTasks(ids, { dueDate: dateKey, dueTime: time }, many(ids, t('undo.dueSet', { count: ids.length, label })))
      },
      setPriority: (all: string[], priority: Priority) => {
        const ids = changing(all, (x) => x.priority !== priority)
        bulkUpdateTasks(ids, { priority }, many(ids, t('undo.prioritySet', { count: ids.length, label: t(`common.${priority}`) })))
      },
      /**
       * 色ラベルを付け替える（ナビの色ラベルに落としたときと同じく色だけ。null はラベルを外す）。記録は対象外。
       * ラベルで絞った一覧では行が消えるので 1 件でも出す
       */
      setLabel: (all: string[], hex: string | null) => {
        const h = hex?.toUpperCase() ?? null
        const ids = changing(all, (x) => !isLogTask(x) && (x.color?.toUpperCase() ?? null) !== h)
        if (ids.length === 0) return
        const { tasks, timeLogTagPresets, logCategoryColors } = useTaskStore.getState()
        const title = toastTitle(tasks.find((x) => x.id === ids[0])?.title ?? '')
        const name = h ? colorLabelText(h, timeLogTagPresets, logCategoryColors, t) : ''
        const label = h
          ? ids.length === 1
            ? t('undo.labelSetOne', { title, name })
            : t('undo.labelSet', { count: ids.length, name })
          : ids.length === 1
            ? t('undo.labelClearedOne', { title })
            : t('undo.labelCleared', { count: ids.length })
        bulkUpdateTasks(ids, { color: h }, label)
      },
      moveToSection: (all: string[], sectionId: string | null, name: string) => {
        const ids = changing(all, (x) => (x.sectionId ?? null) !== sectionId)
        bulkUpdateTasks(ids, { sectionId }, many(ids, t('undo.tasksMovedToSection', { count: ids.length, name })))
      },
      moveToList: (all: string[], listId: string) => {
        const ids = changing(all, (x) => x.listId !== listId)
        if (ids.length === 0) return
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
      /**
       * 予定日（いつやるか）を付け替える。時刻はそのまま（15:00 の予定は明日の 15:00 に）。締切（dueDate）は変えない。
       * null は予定を外す（時刻も外して To-Do に戻す）。行・ブロックが別の日へ動いて見えなくなるので 1 件でも出す
       */
      setScheduled: (all: string[], dateKey: string | null, dateLabel: string) => {
        const ids = changing(all, (x) => (dateKey ? x.scheduledDate !== dateKey : x.scheduledDate !== null || x.startTime !== null))
        if (ids.length === 0) return
        const { tasks, updateTask, asOneUndo } = useTaskStore.getState()
        const title = toastTitle(tasks.find((x) => x.id === ids[0])?.title ?? '')
        const label = dateKey
          ? ids.length === 1
            ? t('undo.scheduleSetOne', { title, label: dateLabel })
            : t('undo.scheduleSet', { count: ids.length, label: dateLabel })
          : ids.length === 1
            ? t('undo.blockUnscheduled', { title })
            : t('undo.scheduleCleared', { count: ids.length })
        asOneUndo(() => {
          for (const id of ids) updateTask(id, dateKey ? { scheduledDate: dateKey } : UNSCHEDULE_PATCH, label)
        })
      },
    }
  }, [t, bulkUpdateTasks, completeTasks, toggleTask, deleteTasks, archiveTasks])
}
