import { closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core'
import { TASK_PREFIX } from '../components/SortableTaskItem'
import { LABEL_DROP_PREFIX, LIST_PREFIX } from './listDnD'
import { SECTION_DROP_PREFIX } from './mainListTasks'
import { DRAGSEC_PREFIX, DROPSEC_PREFIX } from './sectionReorderDnD'
import { SUBTASK_PREFIX } from './subtaskDnD'

/** セクション見出し行の dropsec が広いとタスクの pointerWithin で先に拾われ、並べ替え・リスト移動が壊れる */
export const taskListCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const fromPointer = pointerWithin(args)

  if (activeId.startsWith(TASK_PREFIX) || activeId.startsWith(SUBTASK_PREFIX)) {
    if (fromPointer.length > 0) {
      const rank = activeId.startsWith(SUBTASK_PREFIX) ? rankForSubtaskDrag : rankForTaskDrag
      return [...fromPointer].sort((a, b) => rank(String(a.id)) - rank(String(b.id)))
    }
  }

  const base = fromPointer.length > 0 ? fromPointer : closestCenter(args)

  if (activeId.startsWith(TASK_PREFIX)) {
    return [...base].sort((a, b) => rankForTaskDrag(String(a.id)) - rankForTaskDrag(String(b.id)))
  }
  if (activeId.startsWith(SUBTASK_PREFIX)) {
    return [...base].sort((a, b) => rankForSubtaskDrag(String(a.id)) - rankForSubtaskDrag(String(b.id)))
  }
  if (activeId.startsWith(DRAGSEC_PREFIX)) {
    return [...base].sort((a, b) => rankForSectionReorderDrag(String(a.id)) - rankForSectionReorderDrag(String(b.id)))
  }
  if (activeId.startsWith(LIST_PREFIX)) {
    return [...base].sort((a, b) => rankForListReorderDrag(String(a.id)) - rankForListReorderDrag(String(b.id)))
  }
  return base
}

function rankForTaskDrag(id: string): number {
  if (id.startsWith(TASK_PREFIX)) return 1
  if (id.startsWith(SECTION_DROP_PREFIX)) return 2
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::') || id.startsWith(LABEL_DROP_PREFIX)) return 3
  if (id.startsWith(DROPSEC_PREFIX)) return 20
  return 10
}

/** サブタスクDnD: 兄弟行をルート行より優先 */
function rankForSubtaskDrag(id: string): number {
  if (id.startsWith(SUBTASK_PREFIX)) return 1
  if (id.startsWith(TASK_PREFIX)) return 2
  if (id.startsWith(SECTION_DROP_PREFIX)) return 3
  if (id.startsWith('drop::') || id.startsWith(LIST_PREFIX) || id.startsWith('mobile-drop::')) return 4
  if (id.startsWith(DROPSEC_PREFIX)) return 20
  return 10
}

function rankForSectionReorderDrag(id: string): number {
  if (id.startsWith(DROPSEC_PREFIX)) return 0
  return 10
}

function rankForListReorderDrag(id: string): number {
  if (id.startsWith(LIST_PREFIX)) return 0
  if (id.startsWith('drop::')) return 1
  return 10
}
