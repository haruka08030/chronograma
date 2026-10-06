import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useLiftGroupCount } from '../hooks/useTouchLift'
import { TaskItem } from './TaskItem'
import { LIFT_CARD_CLASS, LIFT_SCALE_CLASS } from './ui/rowStateClass'

const CARD = `rounded-xl bg-white dark:bg-zinc-900 ${LIFT_CARD_CLASS}`

/**
 * つかんでいる行。そのタスクだけを購読する（App 全体を tasks の変化で描き直さない）。
 * `lift`（タッチの長押しで浮かせた）ときは、押さえている間に別の指で足した分も件数に入れる（`useLiftGroupCount`）
 */
export function DragOverlayTaskRow({
  taskId,
  isSubtask,
  count,
  lift = false,
}: {
  taskId: string
  isSubtask: boolean
  count: number
  lift?: boolean
}) {
  const { t } = useTranslation()
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId))
  const liftCount = useLiftGroupCount()
  if (!task) return null
  const shown = lift && liftCount !== null ? liftCount : count
  const isMulti = shown > 1
  return (
    // 少しだけ大きくして、持ち上げている感じを出す
    <div className={`relative w-[min(640px,calc(100vw-2rem))] ${lift ? LIFT_SCALE_CLASS : 'scale-[1.02]'}`}>
      {isMulti && (
        <>
          <div className={`absolute inset-x-2 -bottom-2 h-full ${CARD}`} />
          <div className={`absolute inset-x-1 -bottom-1 h-full ${CARD}`} />
        </>
      )}
      <div className={`relative ${CARD}`}>
        <TaskItem task={task} isSubtask={isSubtask} />
        {isMulti && (
          <span className="absolute -right-2 -top-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900">
            {t('taskList.dragCount', { count: shown })}
          </span>
        )}
      </div>
    </div>
  )
}
