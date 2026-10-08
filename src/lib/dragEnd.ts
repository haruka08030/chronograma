import type { DragEndEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_PREFIX, type TaskRootDragData } from '../components/SortableTaskItem'
import { MOBILE_DROP_PREFIX } from '../components/DndTaskDragShell'
import { LABEL_DROP_PREFIX, LIST_PREFIX } from './listDnD'
import { labelDroppedTasks, moveDroppedTasks } from './navDrop'
import { TIMER_DROP_ID, startTimerForTask } from './timerDrop'
import { unplannedListIds } from './listKind'
import { buildReorderedActiveRootIdsForGroup, getOrderedActiveRootTasksForDnD, parseSectionDropId } from './mainListTasks'
import { DRAGSEC_PREFIX, DROPSEC_PREFIX, parseSectionReorderId } from './sectionReorderDnD'
import { SUBTASK_PREFIX, parseSubtaskDragId } from './subtaskDnD'
import { sortKeyOf, sortModeOf } from './todoSurfaceView'
import { canNestUnder } from './taskDepth'
import { todoFilterFor } from './taskFilter'
import { isIndentIntent, isOutdentIntent } from './taskDragIntent'

/**
 * 画面全体の DndContext でドラッグを離したときの動き（タイマーへ・インデント・セクション/サブタスク/タスク/リストの並べ替え・
 * リストやラベルへの移動）。ドラッグ中の表示の後片付けは呼ぶ側（`useAppDnd`）
 */
export function applyDragEnd(event: DragEndEvent) {
  const { active, over } = event
  const activeId = String(active.id)

  // 上の「ここに落として計測開始」。横に動いてもインデント扱いにしないよう先に見る
  if (over?.id === TIMER_DROP_ID) {
    const taskId = activeId.startsWith(SUBTASK_PREFIX)
      ? parseSubtaskDragId(activeId)
      : activeId.startsWith(TASK_PREFIX)
        ? activeId.slice(TASK_PREFIX.length)
        : null
    if (taskId) startTimerForTask(taskId)
    return
  }

  // 水平方向のドラッグでインデント/アウトデント（アウトライナー風）。
  // over が自分自身でも成立させたいので、通常の over 判定より前に処理する。
  if (activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX)) {
    const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    const isMultiGroup = !!group && group.length > 1
    const movedId = activeId.startsWith(SUBTASK_PREFIX) ? parseSubtaskDragId(activeId) : activeId.slice(TASK_PREFIX.length)
    if (movedId && !isMultiGroup) {
      const state = useTaskStore.getState()

      // 右ドラッグ = 1 段下げる（直前の兄弟の子に）
      if (isIndentIntent(event.delta)) {
        if (state.indentTaskUnderPrevSibling(movedId)) return
      }

      // 左ドラッグ = 1 段上げる（サブタスクのみ）
      if (isOutdentIntent(event.delta) && activeId.startsWith(SUBTASK_PREFIX)) {
        const moved = state.tasks.find((t) => t.id === movedId)
        const parent = moved?.parentId ? state.tasks.find((t) => t.id === moved.parentId) : null
        if (moved?.parentId && parent) {
          if (parent.parentId != null) {
            // 親もサブタスク → 祖父母の直下（旧親の直後）へ
            const gpChildren = state.tasks
              .filter((t) => t.parentId === parent.parentId && t.id !== movedId)
              .sort((a, b) => a.order - b.order)
              .map((t) => t.id)
            const parentIdx = gpChildren.indexOf(parent.id)
            const insertBefore = parentIdx >= 0 ? (gpChildren[parentIdx + 1] ?? null) : null
            state.moveSubtaskInList(movedId, parent.parentId, insertBefore)
          } else {
            // 親がルート → ルートへ昇格
            state.promoteSubtaskToRoot(movedId)
          }
          return
        }
      }
    }
  }

  if (!over || active.id === over.id) {
    return
  }
  const overId = over.id as string

  if (activeId.startsWith(DRAGSEC_PREFIX) && overId.startsWith(DROPSEC_PREFIX)) {
    const a = parseSectionReorderId(activeId, DRAGSEC_PREFIX)
    const b = parseSectionReorderId(overId, DROPSEC_PREFIX)
    if (!a || !b || a.listId !== b.listId) return
    if (a.sectionId === b.sectionId) return
    const state = useTaskStore.getState()
    const sorted = state.sections
      .filter((s) => s.listId === a.listId)
      .sort((x, y) => x.order - y.order)
      .map((s) => s.id)
    const from = sorted.indexOf(a.sectionId)
    const to = sorted.indexOf(b.sectionId)
    if (from < 0 || to < 0) return
    const next = [...sorted]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    state.reorderSections(a.listId, next)
  } else if (activeId.startsWith(SUBTASK_PREFIX)) {
    const movedTaskId = parseSubtaskDragId(activeId)
    if (!movedTaskId) return
    const state = useTaskStore.getState()
    const moved = state.tasks.find((t) => t.id === movedTaskId)
    if (!moved?.parentId) return

    if (overId.startsWith(SUBTASK_PREFIX)) {
      const overTaskId = parseSubtaskDragId(overId)
      if (!overTaskId) return
      const overTask = state.tasks.find((t) => t.id === overTaskId)
      if (!overTask?.parentId) return
      // 縦の並べ替え: ドロップ先サブタスクと同じ親・同じ位置に差し込む
      state.moveSubtaskInList(movedTaskId, overTask.parentId, overTaskId)
    } else if (overId.startsWith(TASK_PREFIX)) {
      const rootId = overId.slice(TASK_PREFIX.length)
      const root = state.tasks.find((t) => t.id === rootId)
      if (!root) return
      state.moveSubtaskInList(movedTaskId, rootId, null)
    }
  } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(SUBTASK_PREFIX)) {
    const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    if (group && group.length > 1) return
    const taskId = activeId.slice(TASK_PREFIX.length)
    const overTaskId = parseSubtaskDragId(overId)
    if (!overTaskId) return
    const state = useTaskStore.getState()
    const moved = state.tasks.find((t) => t.id === taskId)
    const overTask = state.tasks.find((t) => t.id === overTaskId)
    if (!moved || moved.parentId != null || !overTask) return
    // 縦の並べ替え: ルートをドロップ先サブタスクと同じ親・同じ位置の兄弟にする
    const fallbackParentId = overTask.parentId
    if (!fallbackParentId || !canNestUnder(state.tasks, taskId, fallbackParentId)) {
      return
    }
    state.nestRootUnderParent(taskId, fallbackParentId, overTaskId)
  } else if (
    activeId.startsWith(TASK_PREFIX) &&
    (overId.startsWith(TASK_PREFIX) || parseSectionDropId(overId) || parseSectionReorderId(overId, DROPSEC_PREFIX))
  ) {
    const state = useTaskStore.getState()
    const taskId = activeId.slice(TASK_PREFIX.length)
    const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]

    const currentOrdered = getOrderedActiveRootTasksForDnD({
      tasks: state.tasks,
      selectedView: state.selectedView,
      selectedListId: state.selectedListId,
      sortMode: sortModeOf(state.sortByKey, sortKeyOf(state.selectedListId, state.selectedView, state.filterColor)),
      filterTag: state.filterTag,
      filterColor: state.filterColor,
      sections: state.sections,
      listOrderById: new Map(state.lists.map((l) => [l.id, l.order])),
      excludedListIds: unplannedListIds(state.lists),
      // 一覧と同じ行で並べ直す（じょうごの絞り込みは To-Do のリスト・ビューだけ）
      taskFilter: todoFilterFor(state.lists, state.selectedListId, state.todoFilter),
    })
    const built = buildReorderedActiveRootIdsForGroup(currentOrdered, taskId, overId, group, state.sections, state.selectedListId)
    if (built) {
      state.reorderManualRootTasks(built.orderedIds, built.sectionUpdate)
    }
  } else if (activeId.startsWith(TASK_PREFIX) && overId.startsWith(LABEL_DROP_PREFIX)) {
    const taskId = activeId.slice(TASK_PREFIX.length)
    const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]
    labelDroppedTasks(group, overId.slice(LABEL_DROP_PREFIX.length))
  } else if (activeId.startsWith(TASK_PREFIX)) {
    // サイドバー行は useSortable が list:: を、別途 useDroppable が drop:: を同じノードに登録する。
    // 衝突判定では list:: が選ばれることが多いので両方扱う。
    let listId: string | null = null
    if (overId.startsWith('drop::')) listId = overId.slice('drop::'.length)
    else if (overId.startsWith(MOBILE_DROP_PREFIX)) listId = overId.slice(MOBILE_DROP_PREFIX.length)
    else if (overId.startsWith(LIST_PREFIX)) listId = overId.slice(LIST_PREFIX.length)
    if (listId) {
      const taskId = activeId.slice(TASK_PREFIX.length)
      const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds ?? [taskId]
      moveDroppedTasks(group, listId)
    }
  } else if (activeId.startsWith(LIST_PREFIX) && overId.startsWith(LIST_PREFIX)) {
    const state = useTaskStore.getState()
    const sorted = [...state.lists].sort((a, b) => a.order - b.order)
    const ids = sorted.map((l) => `${LIST_PREFIX}${l.id}`)
    const oldIndex = ids.indexOf(activeId)
    const newIndex = ids.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = [...ids]
    reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, activeId)
    state.reorderLists(reordered.map((id) => id.slice(LIST_PREFIX.length)))
  }
}
