/** タスクの並べ替え・入れ子（ドラッグ）・リスト間の移動 */
import { isLogTask, type Task } from '../../types/task'
import i18n from '../../i18n/config'
import { isActiveTask } from '../../lib/taskLifecycle'
import { canNestUnder, getIndentTargetId } from '../../lib/taskDepth'
import { expandDescendantIds, isAncestorInChain, siblingIdsOrdered } from '../taskHelpers'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type TaskTreeActions = Pick<
  TaskState,
  | 'reorderManualRootTasks'
  | 'moveSubtaskInList'
  | 'nestRootUnderParent'
  | 'promoteSubtaskToRoot'
  | 'indentTaskUnderPrevSibling'
  | 'reorderTask'
  | 'reorderTasks'
  | 'moveTaskToList'
  | 'moveTasksToList'
>

export function createTaskTreeSlice({ set, get, undo }: SliceContext): TaskTreeActions {
  const { pushUndo } = undo
  return {
    reorderManualRootTasks: (orderedTaskIds, sectionUpdate) => {
      const now = new Date().toISOString()
      const sectionSet =
        sectionUpdate && sectionUpdate.taskIds.length > 0
          ? new Set(sectionUpdate.taskIds)
          : null
      const targetListId = sectionUpdate?.listId
      const descendantsForListMove =
        targetListId && sectionSet
          ? expandDescendantIds(sectionUpdate!.taskIds, get().tasks)
          : null
      pushUndo()
      set((s) => ({
        tasks: s.tasks.map((t) => {
          const idx = orderedTaskIds.indexOf(t.id)
          const inSectionPatch = Boolean(sectionSet?.has(t.id))
          const inDescendantListMove = Boolean(
            descendantsForListMove?.has(t.id) && targetListId && t.listId !== targetListId,
          )
          if (idx < 0 && !inDescendantListMove) return t

          let next: Task = idx >= 0 ? { ...t, order: idx, updatedAt: now } : { ...t, updatedAt: now }
          if (inSectionPatch && sectionUpdate) {
            next = { ...next, sectionId: sectionUpdate.sectionId }
            if (targetListId) next = { ...next, listId: targetListId }
          } else if (inDescendantListMove && targetListId) {
            // ルートのリスト移動に子を追随（セクションはクリア）
            next = { ...next, listId: targetListId, sectionId: null }
          }
          return next
        }),
      }))
    },

    moveSubtaskInList: (taskId, newParentId, insertBeforeChildId) => {
      const s0 = get()
      const moved = s0.tasks.find((t) => t.id === taskId)
      const parent = s0.tasks.find((t) => t.id === newParentId)
      if (!moved || moved.parentId == null) return
      if (!parent) return
      if (taskId === newParentId) return
      if (isLogTask(moved) || isLogTask(parent)) return
      if (isAncestorInChain(s0.tasks, taskId, newParentId)) return
      if (moved.parentId !== newParentId && !canNestUnder(s0.tasks, taskId, newParentId)) return

      pushUndo()
      set((s) => {
        const now = new Date().toISOString()
        const oldParentId = moved.parentId

        let newChildOrder = siblingIdsOrdered(s.tasks, newParentId, taskId)
        if (insertBeforeChildId && newChildOrder.includes(insertBeforeChildId)) {
          newChildOrder.splice(newChildOrder.indexOf(insertBeforeChildId), 0, taskId)
        } else {
          newChildOrder = [...newChildOrder, taskId]
        }

        const orderAtNewParent = new Map<string, number>()
        newChildOrder.forEach((id, i) => orderAtNewParent.set(id, i))

        const orderAtOldParent = new Map<string, number>()
        if (oldParentId !== newParentId) {
          const oldSiblings = siblingIdsOrdered(s.tasks, oldParentId, taskId)
          oldSiblings.forEach((id, i) => orderAtOldParent.set(id, i))
        }

        const subtree = expandDescendantIds([taskId], s.tasks)
        const listIdChanged = parent.listId !== moved.listId

        return {
          tasks: s.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                parentId: newParentId,
                listId: parent.listId,
                sectionId: null,
                order: orderAtNewParent.get(taskId) ?? 0,
                updatedAt: now,
              }
            }
            if (listIdChanged && subtree.has(t.id) && t.id !== taskId) {
              return { ...t, listId: parent.listId, sectionId: null, updatedAt: now }
            }
            if (orderAtNewParent.has(t.id) && t.parentId === newParentId) {
              const o = orderAtNewParent.get(t.id)
              if (o === undefined || o === t.order) return t
              return { ...t, order: o, updatedAt: now }
            }
            if (oldParentId !== newParentId && orderAtOldParent.has(t.id) && t.parentId === oldParentId) {
              const o = orderAtOldParent.get(t.id)
              if (o === undefined || o === t.order) return t
              return { ...t, order: o, updatedAt: now }
            }
            return t
          }),
        }
      })
    },

    nestRootUnderParent: (taskId, parentId, insertBeforeChildId) => {
      const s0 = get()
      const moved = s0.tasks.find((t) => t.id === taskId)
      const parent = s0.tasks.find((t) => t.id === parentId)
      if (!moved || moved.parentId !== null) return
      if (!parent) return
      if (taskId === parentId) return
      if (isLogTask(moved) || isLogTask(parent)) return
      if (isAncestorInChain(s0.tasks, taskId, parentId)) return
      if (!canNestUnder(s0.tasks, taskId, parentId)) return

      pushUndo()
      set((s) => {
        const now = new Date().toISOString()
        const subtree = expandDescendantIds([taskId], s.tasks)
        const listIdChanged = parent.listId !== moved.listId

        let newChildOrder = siblingIdsOrdered(s.tasks, parentId)
        if (insertBeforeChildId && newChildOrder.includes(insertBeforeChildId)) {
          newChildOrder.splice(newChildOrder.indexOf(insertBeforeChildId), 0, taskId)
        } else {
          newChildOrder = [...newChildOrder, taskId]
        }

        const orderAtNewParent = new Map<string, number>()
        newChildOrder.forEach((id, i) => orderAtNewParent.set(id, i))

        return {
          tasks: s.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                parentId,
                listId: parent.listId,
                sectionId: null,
                order: orderAtNewParent.get(taskId) ?? 0,
                updatedAt: now,
              }
            }
            if (listIdChanged && subtree.has(t.id) && t.id !== taskId) {
              return { ...t, listId: parent.listId, sectionId: null, updatedAt: now }
            }
            if (orderAtNewParent.has(t.id) && t.parentId === parentId && t.id !== taskId) {
              const o = orderAtNewParent.get(t.id)
              if (o === undefined || o === t.order) return t
              return { ...t, order: o, updatedAt: now }
            }
            return t
          }),
        }
      })
    },

    promoteSubtaskToRoot: (taskId) => {
      const s0 = get()
      const moved = s0.tasks.find((t) => t.id === taskId)
      if (!moved || moved.parentId == null) return
      const parent = s0.tasks.find((t) => t.id === moved.parentId)
      if (!parent) return
      // 親自身がサブタスクの場合は moveSubtaskInList で祖父母へ動かす。ここはルート直下のみ。
      if (parent.parentId != null) return
      if (isLogTask(moved)) return

      pushUndo()
      set((s) => {
        const now = new Date().toISOString()
        const targetSectionId = parent.sectionId

        const rootOrder = s.tasks
          .filter(
            (t) =>
              t.parentId === null &&
              t.id !== taskId &&
              t.listId === parent.listId &&
              t.sectionId === targetSectionId,
          )
          .sort((a, b) => a.order - b.order)
          .map((t) => t.id)
        const parentIdx = rootOrder.indexOf(parent.id)
        if (parentIdx >= 0) rootOrder.splice(parentIdx + 1, 0, taskId)
        else rootOrder.push(taskId)

        const orderAtRoot = new Map<string, number>()
        rootOrder.forEach((id, i) => orderAtRoot.set(id, i))

        const oldSiblings = siblingIdsOrdered(s.tasks, parent.id, taskId)
        const orderAtOldParent = new Map<string, number>()
        oldSiblings.forEach((id, i) => orderAtOldParent.set(id, i))

        return {
          tasks: s.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                parentId: null,
                listId: parent.listId,
                sectionId: targetSectionId,
                order: orderAtRoot.get(taskId) ?? 0,
                updatedAt: now,
              }
            }
            if (orderAtRoot.has(t.id) && t.parentId === null) {
              const o = orderAtRoot.get(t.id)
              if (o === undefined || o === t.order) return t
              return { ...t, order: o, updatedAt: now }
            }
            if (orderAtOldParent.has(t.id) && t.parentId === parent.id) {
              const o = orderAtOldParent.get(t.id)
              if (o === undefined || o === t.order) return t
              return { ...t, order: o, updatedAt: now }
            }
            return t
          }),
        }
      })
    },

    indentTaskUnderPrevSibling: (taskId) => {
      const s = get()
      const task = s.tasks.find((t) => t.id === taskId)
      const prevId = getIndentTargetId(s.tasks, taskId)
      if (!task || !prevId) return false

      if (task.parentId == null) get().nestRootUnderParent(taskId, prevId, null)
      else get().moveSubtaskInList(taskId, prevId, null)
      return true
    },

    reorderTask: (id, newOrder) => {
      pushUndo()
      return set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, order: newOrder, updatedAt: new Date().toISOString() } : t,
        ),
      }))
    },
    reorderTasks: (orderedIds) => {
      pushUndo()
      const now = new Date().toISOString()
      return set((s) => ({
        tasks: s.tasks.map((t) => {
          const idx = orderedIds.indexOf(t.id)
          return idx >= 0 && t.order !== idx ? { ...t, order: idx, updatedAt: now } : t
        }),
      }))
    },

    moveTaskToList: (taskId, listId) => {
      const s = get()
      const task = s.tasks.find((t) => t.id === taskId)
      if (!task || task.listId === listId) return { moved: false }
      const listName = s.lists.find((l) => l.id === listId)?.name ?? i18n.t('lists.unnamedList')
      const descendants = expandDescendantIds([taskId], s.tasks)
      pushUndo()
      set((state) => {
        const maxOrder = Math.max(
          0,
          ...state.tasks
            .filter(
              (t) =>
                t.listId === listId &&
                t.parentId === null &&
                !t.completed &&
                isActiveTask(t) &&
                !descendants.has(t.id),
            )
            .map((t) => t.order),
        )
        const rootNewOrder = maxOrder + 1
        const now = new Date().toISOString()
        return {
          tasks: state.tasks.map((t) => {
            if (!descendants.has(t.id)) return t
            if (t.id === taskId)
              return { ...t, listId, order: rootNewOrder, sectionId: null, updatedAt: now }
            return { ...t, listId, sectionId: null, updatedAt: now }
          }),
        }
      })
      return { moved: true, listName, listId }
    },

    moveTasksToList: (rootTaskIds, listId) => {
      const s = get()
      const uniqueRoots = [...new Set(rootTaskIds)]
      const rootsToMove = uniqueRoots.filter((id) => {
        const t = s.tasks.find((x) => x.id === id)
        return Boolean(t && t.parentId == null && t.listId !== listId)
      })
      if (rootsToMove.length === 0) return { moved: false }
      const listName = s.lists.find((l) => l.id === listId)?.name ?? i18n.t('lists.unnamedList')
      const descendantsUnion = new Set<string>()
      const taskToRoot = new Map<string, string>()
      for (const rid of rootsToMove) {
        for (const tid of expandDescendantIds([rid], s.tasks)) {
          descendantsUnion.add(tid)
          taskToRoot.set(tid, rid)
        }
      }
      pushUndo()
      set((state) => {
        const maxOrder = Math.max(
          0,
          ...state.tasks
            .filter(
              (t) =>
                t.listId === listId &&
                t.parentId === null &&
                !t.completed &&
                isActiveTask(t) &&
                !descendantsUnion.has(t.id),
            )
            .map((t) => t.order),
        )
        const rootOrder = new Map<string, number>()
        rootsToMove.forEach((rid, i) => {
          rootOrder.set(rid, maxOrder + 1 + i)
        })
        const now = new Date().toISOString()
        return {
          tasks: state.tasks.map((t) => {
            if (!descendantsUnion.has(t.id)) return t
            const rootId = taskToRoot.get(t.id)
            if (!rootId) return t
            const ord = rootOrder.get(rootId)
            if (t.id === rootId && ord !== undefined)
              return { ...t, listId, order: ord, sectionId: null, updatedAt: now }
            return { ...t, listId, sectionId: null, updatedAt: now }
          }),
        }
      })
      return { moved: true, listName, listId, count: rootsToMove.length }
    },
  }
}
