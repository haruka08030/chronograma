import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { openTaskMenu } from '../../lib/overlays'
import { startTimerForTask } from '../../lib/timerDrop'
import { ArrowRightIcon, CalendarArrowIcon, ClockIcon, PlayIcon } from '../icons'
import { RowActionButton } from '../ui/RowActionButton'

/** 時間未定の行の「時間を決める」（空き時間の候補を出す。マウスで乗せたときだけ。スマホは押したときのシートから） */
export function SetTimeButton({ task, dateKey }: { task: Task; dateKey: string }) {
  const { t } = useTranslation()
  return (
    <RowActionButton
      label={t('timeSlot.title')}
      onClick={() => {
        const r = document.querySelector(`[data-task-row="${CSS.escape(task.id)}"]`)?.getBoundingClientRect()
        openTaskMenu({ kind: 'timeSlot', x: r ? r.right - 288 : 0, y: r ? r.bottom + 4 : 0, taskId: task.id, dateKey })
      }}
      collapse
      mouseOnly
    >
      <ClockIcon className="h-3.5 w-3.5" />
    </RowActionButton>
  )
}

/** 今日やる行の「明日へ回す」（マウスで乗せたときだけ。スマホは行のスワイプで） */
export function TomorrowButton({ task, tomorrowKey }: { task: Task; tomorrowKey: string }) {
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  return (
    <RowActionButton label={t('taskMenu.toTomorrow')} onClick={() => rescheduleTasks([task.id], tomorrowKey)} collapse mouseOnly>
      <ArrowRightIcon className="h-3.5 w-3.5" />
    </RowActionButton>
  )
}

/**
 * 記録中でも押せる（前の記録を保存して切り替える）。いま計っているタスクには出さない。
 * スマホの行にはボタンを並べない（押すと出るシート・払う操作で同じことができる）
 */
export function TimerButton({ task }: { task: Task }) {
  const { t } = useTranslation()
  const timing = useTaskStore((s) => s.activeTimer?.taskId === task.id)
  if (timing) return null
  return (
    <RowActionButton label={t('planner.startTimer')} onClick={() => startTimerForTask(task.id)} collapse mouseOnly>
      <PlayIcon className="h-3 w-3" />
    </RowActionButton>
  )
}

/** 候補・やり残しの行の「今日やる」（ほかの日を見ているときは「この日にやる」）。カレンダーに矢印＝その日へ移す */
export function MoveHereButton({ task, dateKey, viewingToday }: { task: Task; dateKey: string; viewingToday: boolean }) {
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  return (
    <RowActionButton
      label={viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
      onClick={() => rescheduleTasks([task.id], dateKey)}
      mouseOnly
    >
      <CalendarArrowIcon className="h-4 w-4" />
    </RowActionButton>
  )
}
