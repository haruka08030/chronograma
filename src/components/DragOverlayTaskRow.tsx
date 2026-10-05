import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { TaskItem } from './TaskItem'

/** つかんでいる行。そのタスクだけを購読する（App 全体を tasks の変化で描き直さない） */
export function DragOverlayTaskRow({ taskId, isSubtask, count }: { taskId: string; isSubtask: boolean; count: number }) {
  const { t } = useTranslation()
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId))
  if (!task) return null
  const isMulti = count > 1
  return (
    // 少しだけ大きくして、持ち上げている感じを出す
    <div className="relative w-[min(640px,calc(100vw-2rem))] scale-[1.02]">
      {isMulti && (
        <>
          <div className="absolute inset-x-2 -bottom-2 h-full rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70" />
          <div className="absolute inset-x-1 -bottom-1 h-full rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70" />
        </>
      )}
      <div className="relative rounded-xl bg-white dark:bg-zinc-900 shadow-lg ring-1 ring-zinc-200/70 dark:ring-zinc-700/70">
        <TaskItem task={task} isSubtask={isSubtask} />
        {isMulti && (
          <span className="absolute -right-2 -top-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900">
            {t('taskList.dragCount', { count })}
          </span>
        )}
      </div>
    </div>
  )
}
