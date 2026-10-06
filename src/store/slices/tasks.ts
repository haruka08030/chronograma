/** タスクの追加・完了・編集・一括操作・ゴミ箱・アーカイブ */
import { isEventTask, type Task } from '../../types/task'
import { INBOX_ID } from '../storeConstants'
import { applyTaskPatch, expandDescendantIds, makeTask, orderForNewSiblingAtFront, patchChangesTask } from '../taskHelpers'
import { toggleTaskCompletion } from '../taskRecurrence'
import { toggleChecklistTree } from '../../lib/listTree'
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

/**
 * 完了の切り替え。チェックリストは親子をまとめて（`toggleChecklistTree`）、
 * それ以外は繰り返しの次回を作る／片付ける（`taskRecurrence.ts`）。予定は完了にしない（null）
 */
function toggleByListKind(s: Pick<TaskState, 'tasks' | 'lists'>, id: string, now: string): Task[] | null {
  const task = s.tasks.find((t) => t.id === id)
  if (!task || isEventTask(task)) return null
  const listId = task.listId
  const kind = s.lists.find((l) => l.id === listId)?.kind
  return kind === 'checklist' ? toggleChecklistTree(s.tasks, id, now) : toggleTaskCompletion(s.tasks, id, now)
}

/** 直近の削除から、もう削除でなくなった（戻した・完全に消した）タスクを外す。空になった回は捨てる */
function withoutIds(batches: TaskState['recentDeletes'], ids: Set<string>): TaskState['recentDeletes'] {
  return batches.map((b) => ({ ...b, ids: b.ids.filter((id) => !ids.has(id)) })).filter((b) => b.ids.length > 0)
}

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
      const task = makeTask({ title, listId: targetList, sectionId: pid === null ? (sectionResolved ?? undefined) : undefined }, ord)
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
          return t.sectionId === afterTask.sectionId
        })
        .sort((a, b) => a.order - b.order)
      const afterIndex = siblings.findIndex((t) => t.id === afterTaskId)
      if (afterIndex < 0) return undefined
      const nextSibling = siblings[afterIndex + 1]
      const order = nextSibling ? (afterTask.order + nextSibling.order) / 2 : afterTask.order + 1
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
      // 予定には完了が無い（ショートカット・まとめて完了などから来ても何もしない）
      if (!task || isEventTask(task)) return
      // 完了は行が一覧から消えるので、何を完了したかと「元に戻す」を出す（スマホには ⌘Z が無い）
      pushUndo(task.completed ? undefined : { key: 'undo.taskCompleted', params: { title: task.title } })
      set((s) => {
        const tasks = toggleByListKind(s, id, new Date().toISOString())
        return tasks ? { tasks } : s
      })
    },
    updateTask: (id, patch, label) => {
      const task = get().tasks.find((t) => t.id === id)
      // 同じ値を選び直しただけなら何もしない（取り消しの履歴・トースト・同期の書き込みを積まない）
      if (task && !patchChangesTask(task, patch)) return
      // 作った直後の空の行に名前を付けるだけなら、作成と同じ 1 手にまとめる
      // メモ・場所を打っている間は 1 回分にまとめる
      const keys = Object.keys(patch)
      const typingKey = keys.length === 1 && (keys[0] === 'description' || keys[0] === 'location') ? `${id}:${keys[0]}` : undefined
      if (!isUnnamedJustCreated(id)) pushUndo(label, typingKey)
      return set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? applyTaskPatch(t, patch) : t)),
      }))
    },
    rescheduleTasks: (all, dateKey, label) => {
      const patch = { scheduledDate: dateKey, startTime: null, endTime: null }
      const ids = all.filter((id) => {
        const task = get().tasks.find((t) => t.id === id)
        return task ? patchChangesTask(task, patch) : false
      })
      if (ids.length === 0) return
      pushUndo(label)
      const selected = new Set(ids)
      set((s) => ({
        tasks: s.tasks.map((t) => (selected.has(t.id) ? applyTaskPatch(t, patch) : t)),
      }))
    },
    completeTasks: (ids) => {
      const s0 = get()
      const targets = ids.filter((id) => s0.tasks.some((t) => t.id === id && !t.completed && !isEventTask(t)))
      if (targets.length === 0) return
      const first = s0.tasks.find((t) => t.id === targets[0])
      pushUndo(
        targets.length > 1
          ? { key: 'undo.tasksCompleted', params: { count: targets.length } }
          : { key: 'undo.taskCompleted', params: { title: first?.title ?? '' } },
      )
      const nowIso = new Date().toISOString()
      set((s) => ({
        // 親と子を一緒に選んだチェックリストは、親で子も済みになる。済みになったものは切り替え直さない
        tasks: targets.reduce(
          (tasks, id) => (tasks.find((t) => t.id === id)?.completed ? tasks : (toggleByListKind({ ...s, tasks }, id, nowIso) ?? tasks)),
          s.tasks,
        ),
      }))
    },
    bulkUpdateTasks: (ids, patch, label) => {
      if (ids.length === 0) return
      pushUndo(label)
      set((s) => {
        const selected = new Set(ids)
        const listTargets = patch.listId !== undefined ? expandDescendantIds(selected, s.tasks) : null
        return {
          tasks: s.tasks.map((t) => {
            const listHit = listTargets?.has(t.id)
            const prioHit = patch.priority !== undefined && selected.has(t.id)
            const dueHit = (patch.dueDate !== undefined || patch.dueTime !== undefined) && selected.has(t.id)
            const secHit = patch.sectionId !== undefined && selected.has(t.id)
            const colorHit = patch.color !== undefined && selected.has(t.id)
            if (!listHit && !prioHit && !dueHit && !secHit && !colorHit) return t
            const piece: Partial<Pick<Task, 'listId' | 'priority' | 'dueDate' | 'dueTime' | 'sectionId' | 'color'>> = {}
            if (listHit && patch.listId !== undefined) piece.listId = patch.listId
            if (prioHit) piece.priority = patch.priority
            if (dueHit && patch.dueDate !== undefined) piece.dueDate = patch.dueDate
            if (dueHit && patch.dueTime !== undefined) piece.dueTime = patch.dueTime
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
        tasks: s.tasks.map((t) => (del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)),
        recentDeletes: [...s.recentDeletes, { ids: toSoftDelete.map((t) => t.id), at: deletedAt }],
      }))
    },
    uncheckTasks: (ids) => {
      if (ids.length === 0) return
      pushUndo()
      const set_ = new Set(ids)
      const now = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) => (set_.has(t.id) && t.completed ? { ...t, completed: false, completedAt: null, updatedAt: now } : t)),
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
              // 「中国語」の下の「HSK 合格」だけを予定にしたら、未分類では 1 件のタスクとして出す
              return {
                ...t,
                listId: INBOX_ID,
                sectionId: null,
                parentId: null,
                order: maxOrder + 1,
                scheduledDate: dateKey,
                updatedAt: now,
              }
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
        tasks: s.tasks.map((t) => (del.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)),
        recentDeletes: [...s.recentDeletes, { ids: toSoftDelete.map((t) => t.id), at: deletedAt }],
      }))
    },
    restoreDeletedTask: (id) => {
      const s0 = get()
      const ids = expandDescendantIds([id], s0.tasks)
      if (![...ids].some((tid) => s0.tasks.find((t) => t.id === tid)?.deletedAt)) return
      pushUndo()
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) => (ids.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t)),
        recentDeletes: withoutIds(s.recentDeletes, ids),
      }))
    },
    permanentlyDeleteTask: (id) => {
      const s0 = get()
      const del = expandDescendantIds([id], s0.tasks)
      if (![...del].some((tid) => s0.tasks.some((t) => t.id === tid))) return
      pushUndo()
      set((s) => ({
        tasks: s.tasks.filter((t) => !del.has(t.id)),
        recentDeletes: withoutIds(s.recentDeletes, del),
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
        recentDeletes: [],
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
      pushUndo({ key: 'undo.tasksArchived', params: { count: toArchive.length } })
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) =>
          target.has(t.id) && !t.archivedAt && !t.deletedAt ? { ...t, archivedAt: nowIso, updatedAt: nowIso } : t,
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
        tasks: s.tasks.map((t) => (ids.has(t.id) && t.archivedAt ? { ...t, archivedAt: null, updatedAt: nowIso } : t)),
      }))
    },
    undoDelete: () =>
      set((s) => {
        const last = s.recentDeletes.at(-1)
        if (!last) return s
        const restoreIds = new Set(last.ids)
        const nowIso = new Date().toISOString()
        return {
          tasks: s.tasks.map((t) => (restoreIds.has(t.id) && t.deletedAt ? { ...t, deletedAt: null, updatedAt: nowIso } : t)),
          recentDeletes: s.recentDeletes.slice(0, -1),
        }
      }),
    clearDeletedTasks: () => set({ recentDeletes: [] }),
  }
}
