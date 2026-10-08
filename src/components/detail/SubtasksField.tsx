import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { addTaskFromQuickText } from '../../lib/quickAddTask'
import { TaskItem } from '../TaskItem'
import { InlineAddInput } from '../ui/InlineAddInput'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { compareByOrder } from '../../lib/orderCompare'

/** タスク詳細のサブタスク（一覧と同じ行）と追加欄。確定せずに外を押しても足す */
export function SubtasksField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const [subInput, setSubInput] = useState('')
  // 子だけを購読する（ほかのタスクの変化で詳細を描き直さない）
  const subtasks = useTaskStore(useShallow((s) => s.tasks.filter((t) => t.parentId === task.id).sort(compareByOrder)))

  const addSubtask = () => {
    const trimmed = subInput.trim()
    if (!trimmed) return
    // 「明日」「15時」「金曜まで」はクイック追加と同じに読む。リストは親と同じ（`@…` は題名に残す）
    addTaskFromQuickText(trimmed, { parentId: task.id })
    setSubInput('')
  }

  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.subtasks', { count: subtasks.length })}</label>
      <div className="space-y-1">
        {subtasks.map((st) => (
          <TaskItem key={st.id} task={st} />
        ))}
      </div>
      <InlineAddInput
        className="mt-2"
        value={subInput}
        onValueChange={setSubInput}
        onSubmit={addSubtask}
        onCancel={() => setSubInput('')}
        // 確定せずに閉じても書いた分を捨てない（リスト・セクションの名前と同じ）
        onBlurSubmit={addSubtask}
        placeholder={t('taskDetail.subtaskPlaceholder')}
      />
    </div>
  )
}
