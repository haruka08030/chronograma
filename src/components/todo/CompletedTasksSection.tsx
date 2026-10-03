import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { ListKind } from '../../types/list'
import type { Task } from '../../types/task'
import { TaskItem, type TaskItemSelection } from '../TaskItem'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { CompletedSubtreeRows } from './subtaskRows'

/** 一覧の下の「完了」（いつかは「かなえた」、チェックリストは「チェック済み」）。開くと完了したタスクとそのサブを出す */
export function CompletedTasksSection({
  completedTodos,
  flatCompletedTodoIds,
  listKind,
  showCompleted,
  onToggleCompleted,
  childrenByParent,
  makeRowClick,
  makeSelection,
  openCompleteWithLog,
  handleEnterCreateSibling,
  pendingAutoEditTaskId,
  subtaskNestNoDrag,
}: {
  completedTodos: Task[]
  flatCompletedTodoIds: string[]
  listKind: ListKind
  showCompleted: boolean
  onToggleCompleted: () => void
  childrenByParent: Map<string, Task[]>
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  openCompleteWithLog: (task: Task) => void
  handleEnterCreateSibling: (task: Task) => void
  pendingAutoEditTaskId: string | null
  subtaskNestNoDrag: string
}) {
  const { t } = useTranslation()
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const uncheckTasks = useTaskStore((s) => s.uncheckTasks)
  return (
    <div className="pt-4">
      <div className="flex items-center justify-between gap-2">
        <DisclosureButton tone="muted" open={showCompleted} onToggle={onToggleCompleted} className="ml-1">
          {listKind === 'someday'
            ? t('someday.fulfilledHeading', { count: completedTodos.length })
            : listKind === 'checklist'
            ? t('checklist.checkedHeading', { count: completedTodos.length })
            : t('taskList.completedHeader', { count: completedTodos.length })}
        </DisclosureButton>
        {listKind === 'checklist' && (
          // 持ち物リストの使い回し（全部戻す）と、買い終わった分の片付け
          <div className="mr-2 flex gap-1">
            <button
              type="button"
              onClick={() => uncheckTasks(flatCompletedTodoIds)}
              className={buttonClass({ variant: 'ghost', size: 'xs' })}
            >
              {t('checklist.uncheckAll')}
            </button>
            <button
              type="button"
              onClick={() => deleteTasks(completedTodos.map((x) => x.id))}
              className={buttonClass({ variant: 'link', size: 'xs' })}
            >
              {t('checklist.clearChecked')}
            </button>
          </div>
        )}
      </div>
      {showCompleted && (
      <div className="space-y-0.5 mt-1">
        {completedTodos.map((t) => (
          <div key={t.id}>
            <TaskItem
              task={t}
              onRowClick={makeRowClick(t.id)}
              onCompleteRequest={openCompleteWithLog}
              onEnterCreateSibling={handleEnterCreateSibling}
              selection={makeSelection(t.id)}
              autoEdit={pendingAutoEditTaskId === t.id}
            />
            {CompletedSubtreeRows({
              parentId: t.id,
              depth: 0,
              childrenByParent,
              makeRowClick,
              makeSelection,
              openCompleteWithLog,
              onEnterCreateSibling: handleEnterCreateSibling,
              pendingAutoEditTaskId,
              subtaskNestNoDrag,
            })}
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
