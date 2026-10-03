import type { ReactNode, MouseEvent } from 'react'
import { SortableSubtaskItem } from '../SortableSubtaskItem'
import { TaskItem, type TaskItemSelection } from '../TaskItem'
import type { Task } from '../../types/task'

export function DnDSubtreeRows({
  parentId,
  depth,
  incompleteSubtasks,
  makeRowClick,
  makeSelection,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestWithDrag,
  nestPreviewParentId,
}: {
  parentId: string
  depth: number
  incompleteSubtasks: (id: string) => Task[]
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestWithDrag: string
  nestPreviewParentId: string | null
}): ReactNode[] {
  return incompleteSubtasks(parentId).flatMap((st): ReactNode[] => [
    <div key={st.id} className={`${subtaskNestWithDrag}${depth > 0 ? ' ml-2' : ''}`}>
      <SortableSubtaskItem
        task={st}
        onRowClick={makeRowClick(st.id)}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
        showNestGuide={st.id === nestPreviewParentId}
      />
    </div>,
    ...DnDSubtreeRows({
      parentId: st.id,
      depth: depth + 1,
      incompleteSubtasks,
      makeRowClick,
      makeSelection,
      onEnterCreateSibling,
      pendingAutoEditTaskId,
      subtaskNestWithDrag,
      nestPreviewParentId,
    }),
  ])
}

export function StaticSubtreeRows({
  parentId,
  depth,
  incompleteSubtasks,
  makeRowClick,
  makeSelection,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestNoDrag,
}: {
  parentId: string
  depth: number
  incompleteSubtasks: (id: string) => Task[]
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestNoDrag: string
}): ReactNode[] {
  return incompleteSubtasks(parentId).map((st): ReactNode => (
    <div key={st.id} className={`${subtaskNestNoDrag}${depth > 0 ? ' ml-1.5' : ''}`}>
      <TaskItem
        task={st}
        isSubtask
        onRowClick={makeRowClick(st.id)}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
      />
      {StaticSubtreeRows({
        parentId: st.id,
        depth: depth + 1,
        incompleteSubtasks,
        makeRowClick,
        makeSelection,
        onEnterCreateSibling,
        pendingAutoEditTaskId,
        subtaskNestNoDrag,
      })}
    </div>
  ))
}

export function CompletedSubtreeRows({
  parentId,
  depth,
  childrenByParent,
  makeRowClick,
  makeSelection,
  onEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestNoDrag,
}: {
  parentId: string
  depth: number
  childrenByParent: Map<string, Task[]>
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  onEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestNoDrag: string
}): ReactNode[] {
  return (childrenByParent.get(parentId) ?? []).map((st): ReactNode => (
    <div key={st.id} className={`${subtaskNestNoDrag}${depth > 0 ? ' ml-1.5' : ''}`}>
      <TaskItem
        task={st}
        isSubtask
        onRowClick={makeRowClick(st.id)}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={makeSelection(st.id)}
        autoEdit={pendingAutoEditTaskId === st.id}
      />
      {CompletedSubtreeRows({
        parentId: st.id,
        depth: depth + 1,
        childrenByParent,
        makeRowClick,
        makeSelection,
        onEnterCreateSibling,
        pendingAutoEditTaskId,
        subtaskNestNoDrag,
      })}
    </div>
  ))
}
