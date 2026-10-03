/** タスクの追加・完了・編集・一括操作・ゴミ箱・アーカイブ */
import type { Task } from '../../types/task'
import i18n from '../../i18n/config'
import { INBOX_ID } from '../storeConstants'
import { applyTaskPatch, expandDescendantIds, makeTask, orderForNewSiblingAtFront } from '../taskHelpers'
import { toggleTaskCompletion } from '../taskRecurrence'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type TasksActions = Pick<
  TaskState,
  | 'addTask'
  | 'addTaskAfter'
  | 'addTaskWithDate'
  | 'addTaskWithTime'
  | 'toggleTask'
  | 'updateTask'
  | 'rescheduleTasks'
  | 'bulkUpdateTasks'
  | 'completeTasks'
  | 'deleteTask'
  | 'uncheckTasks'
  | 'promoteToPlanned'
  | 'deleteTasks'
  | 'restoreDeletedTask'
  | 'permanentlyDeleteTask'
  | 'discardBlankTask'
  | 'emptyDeleted'
  | 'archiveTask'
  | 'archiveTasks'
  | 'unarchiveTask'
  | 'undoDelete'
  | 'clearDeletedTasks'
>

export function createTasksSlice({ set, get, undo }: SliceContext): TasksActions {
  const { pushUndo, isUnnamedJustCreated } = undo
  return {
    addTask: (title, listId, parentId) => {
      const s = get()
      const pid = parentId ?? null
      const parent = pid ? s.tasks.find((t) => t.id === pid) : null
      const targetList = parent?.listId ?? listId ?? s.selectedListId ?? INBOX_ID
      const q = s.quickAddSectionId
      const sectionResolved =
        pid === null &&
        targetList === s.selectedListId &&
        q !== null &&
        (q === '' || s.sections.some((sec) => sec.id === q && sec.listId === targetList))
          ? q === ''
            ? null
            : q
          : null
      const ord = orderForNewSiblingAtFront(s.tasks, targetList, pid, pid === null ? sectionResolved : null)
      const task = makeTask(
        { title, listId: targetList, sectionId: pid === null ? sectionResolved ?? undefined : undefined },
        ord,
      )
      if (parentId) task.parentId = parentId
      pushUndo()
      set((st) => ({ tasks: [...st.tasks, task] }))
      return task.id
    },
    addTaskAfter: (afterTaskId, title) => {
      const s = get()
      const afterTask = s.tasks.find((t) => t.id === afterTaskId)
      if (!afterTask) return undefined
      const siblings = s.tasks
        .filter((t) => {
          if (t.listId !== afterTask.listId || t.parentId !== afterTask.parentId) return false
          if (afterTask.parentId !== null) return true
          return (t.sectionId ?? null) === (afterTask.sectionId ?? null)
        })
        .sort((a, b) => a.order - b.order)
      const afterIndex = siblings.findIndex((t) => t.id === afterTaskId)
      if (afterIndex < 0) return undefined
      const nextSibling = siblings[afterIndex + 1]
      const order = nextSibling
        ? (afterTask.order + nextSibling.order) / 2
        : afterTask.order + 1
      const task = makeTask(
        {
          title,
          listId: afterTask.listId,
          sectionId: afterTask.parentId === null ? afterTask.sectionId : undefined,
        },
        order,
      )
      if (afterTask.parentId) task.parentId = afterTask.parentId
      pushUndo()
      set((st) => ({ tasks: [...st.tasks, task] }))
      return task.id
    },
    addTaskWithDate: (title, dueDate, listId) => {
      pushUndo()
      const targetList = listId ?? get().selectedListId ?? INBOX_ID
      const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
      // カレンダーの日付セルからの追加は「予定日」として扱う
      set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, scheduledDate: dueDate }, ord)] }))
    },
    addTaskWithTime: (title, dueDate, startTime, endTime, listId) => {
      pushUndo()
      const targetList = listId ?? get().selectedListId ?? INBOX_ID
      const ord = orderForNewSiblingAtFront(get().tasks, targetList, null)
      // タイムライン上での作成は「予定日＋時間幅」
      set((s) => ({ tasks: [...s.tasks, makeTask({ title, listId: targetList, scheduledDate: dueDate, startTime, endTime }, ord)] }))
    },

    toggleTask: (id) => {
      const s0 = get()
      const task = s0.tasks.find((t) => t.id === id)
      if (!task) return
      pushUndo()
      set((s) => {
        // 繰り返しは完了で次回を作り、取り消しでまだ手を付けていない次回を片付ける（`taskRecurrence.ts`）
        const tasks = toggleTaskCompletion(s.tasks, id, new Date().toISOString())
        return tasks ? { tasks } : s
      })
    },
    updateTask: (id, patch) => {
      // 作った直後の空の行に名前を付けるだけなら、作成と同じ 1 手にまとめる
      if (!isUnnamedJustCreated(id)) pushUndo()
      return set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t)),
      }))
    },
    rescheduleTasks: (ids, dateKey, label) => {
      if (ids.length === 0) return
      pushUndo(label)
      const selected = new Set(ids)
      set((s) => ({
        tasks: s.tasks.map((t) =>
          selected.has(t.id)
            ? applyTaskPatch(t, { scheduledDate: dateKey, startTime: null, endTime: null })
            : t,
        ),
      }))
    },
    completeTasks: (ids) => {
      const s0 = get()
      const targets = ids.filter((id) => s0.tasks.some((t) => t.id === id && !t.completed))
      if (targets.length === 0) return
      pushUndo(targets.length > 1 ? i18n.t('undo.tasksCompleted', { count: targets.length }) : undefined)
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: targets.reduce((tasks, id) => toggleTaskCompletion(tasks, id, nowIso) ?? tasks, s.tasks),
      }))
    },
    bulkUpdateTasks: (ids, patch, label) => {
      if (ids.length === 0) return
      pushUndo(label)
      set((s) => {
        const selected = new Set(ids)
        const listTargets =
          patch.listId !== undefined ? expandDescendantIds(selected, s.tasks) : null
        return {
          tasks: s.tasks.map((t) => {
            const listHit = listTargets?.has(t.id)
            const prioHit = patch.priority !== undefined && selected.has(t.id)
            const dueHit = patch.dueDate !== undefined && selected.has(t.id)
            const secHit = patch.sectionId !== undefined && selected.has(t.id)
            const colorHit = patch.color !== undefined && selected.has(t.id)
            if (!listHit && !prioHit && !dueHit && !secHit && !colorHit) return t
            const piece: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'sectionId' | 'color'>> = {}
            if (listHit && patch.listId !== undefined) piece.listId = patch.listId
            if (prioHit) piece.priority = patch.priority
            if (dueHit) piece.dueDate = patch.dueDate
            if (secHit) piece.sectionId = patch.sectionId
            if (colorHit) piece.color = patch.color
            return applyTaskPatch(t, piece)
          }),
        }
      })
    },
    deleteTask: (id) => {
      const s0 = get()
      const del = expandDescendantIds([id], s0.tasks)
      const toSoftDelete = s0.tasks.filter((t) => del.has(t.id) && !t.deletedAt)
      if (toSoftDelete.length === 0) return
      pushUndo()
      const nowIso = new Date().toISOString()
      const deletedAt = Date.now()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t,
        ),
        deletedTasks: [
          ...s.deletedTasks,
          ...toSoftDelete.map((t) => ({ task: t, deletedAt })),
        ],
      }))
    },
    uncheckTasks: (ids) => {
      if (ids.length === 0) return
      pushUndo()
      const set_ = new Set(ids)
      const now = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          set_.has(t.id) && t.completed ? { ...t, completed: false, completedAt: null, updatedAt: now } : t,
        ),
      }))
    },
    promoteToPlanned: (id, dateKey) => {
      const s0 = get()
      if (!s0.tasks.some((t) => t.id === id)) return
      const family = expandDescendantIds([id], s0.tasks)
      pushUndo()
      const now = new Date().toISOString()
      set((s) => {
        const maxOrder = Math.max(0, ...s.tasks.filter((t) => t.listId === INBOX_ID && t.parentId === null).map((t) => t.order))
        return {
          tasks: s.tasks.map((t) => {
            if (!family.has(t.id)) return t
            if (t.id === id) {
              return { ...t, listId: INBOX_ID, sectionId: null, order: maxOrder + 1, scheduledDate: dateKey, updatedAt: now }
            }
            return { ...t, listId: INBOX_ID, sectionId: null, updatedAt: now }
          }),
        }
      })
    },
    deleteTasks: (ids) => {
      if (ids.length === 0) return
      const s0 = get()
      const del = expandDescendantIds(ids, s0.tasks)
      const toSoftDelete = s0.tasks.filter((t) => del.has(t.id) && !t.deletedAt)
      if (toSoftDelete.length === 0) return
      pushUndo()
      const nowIso = new Date().toISOString()
      const deletedAt = Date.now()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t,
        ),
        deletedTasks: [
          ...s.deletedTasks,
          ...toSoftDelete.map((t) => ({ task: t, deletedAt })),
        ],
      }))
    },
    restoreDeletedTask: (id) => {
      const s0 = get()
      const ids = expandDescendantIds([id], s0.tasks)
      if (![...ids].some((tid) => s0.tasks.find((t) => t.id === tid)?.deletedAt)) return
      pushUndo()
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          ids.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t,
        ),
        deletedTasks: s.deletedTasks.filter((d) => !ids.has(d.task.id)),
      }))
    },
    permanentlyDeleteTask: (id) => {
      const s0 = get()
      const del = expandDescendantIds([id], s0.tasks)
      if (![...del].some((tid) => s0.tasks.some((t) => t.id === tid))) return
      pushUndo()
      set((s) => ({
        tasks: s.tasks.filter((t) => !del.has(t.id)),
        deletedTasks: s.deletedTasks.filter((d) => !del.has(d.task.id)),
      }))
    },
    discardBlankTask: (id) => {
      const s0 = get()
      const task = s0.tasks.find((t) => t.id === id)
      if (!task || task.title.trim() || task.description.trim()) return
      if (s0.tasks.some((t) => t.parentId === id)) return
      // 作った直後の控えも捨てる。残すと「取り消し」が何も起きない一手になる
      if (isUnnamedJustCreated(id)) undo.dropLastUndo()
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    },
    emptyDeleted: () => {
      const s0 = get()
      if (!s0.tasks.some((t) => t.deletedAt)) return
      pushUndo()
      set((s) => ({
        tasks: s.tasks.filter((t) => !t.deletedAt),
        deletedTasks: [],
      }))
    },
    archiveTask: (id) => {
      get().archiveTasks([id])
    },
    archiveTasks: (ids) => {
      if (ids.length === 0) return
      const s0 = get()
      const target = expandDescendantIds(ids, s0.tasks)
      const toArchive = s0.tasks.filter((t) => target.has(t.id) && !t.archivedAt && !t.deletedAt)
      if (toArchive.length === 0) return
      pushUndo(i18n.t('undo.tasksArchived', { count: toArchive.length }))
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          target.has(t.id) && !t.archivedAt && !t.deletedAt
            ? { ...t, archivedAt: nowIso, updatedAt: nowIso }
            : t,
        ),
      }))
    },
    unarchiveTask: (id) => {
      const s0 = get()
      const ids = expandDescendantIds([id], s0.tasks)
      if (![...ids].some((tid) => s0.tasks.find((t) => t.id === tid)?.archivedAt)) return
      pushUndo()
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          ids.has(t.id) && t.archivedAt ? { ...t, archivedAt: null, updatedAt: nowIso } : t,
        ),
      }))
    },
    undoDelete: () =>
      set((s) => {
        if (s.deletedTasks.length === 0) return s
        const lastDeletedAt = Math.max(...s.deletedTasks.map((d) => d.deletedAt))
        const restoreIds = new Set(
          s.deletedTasks.filter((d) => d.deletedAt === lastDeletedAt).map((d) => d.task.id),
        )
        const nowIso = new Date().toISOString()
        return {
          tasks: s.tasks.map((t) =>
            restoreIds.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t,
          ),
          deletedTasks: s.deletedTasks.filter((d) => d.deletedAt !== lastDeletedAt),
        }
      }),
    clearDeletedTasks: () => set({ deletedTasks: [] }),
  }
}
