import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { CalendarDoubleArrowIcon } from '../icons'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { MoveHereButton, SetTimeButton, TimerButton, TomorrowButton } from './PlannerRowActions'
import { PlannerAddInput } from './PlannerAddInput'
import { PlannerListStatus } from './PlannerListStatus'

/**
 * 今日の計画の To-Do: 期限切れ → やり残し → 今日やる（時間あり → 時間未定）→ 追加欄 → 一言。
 * どの行がどこに属すか見出しで分ける。期限切れは焦らせてよいので畳まない
 */
export function PlannerTodoSection({
  env,
  headingClass,
  overdue,
  leftOver,
  showLeftOver,
  onToggleLeftOver,
  open,
  timedOpen,
  untimedOpen,
  totalCount,
}: {
  env: PlannerRowEnv
  headingClass: string
  overdue: Task[]
  leftOver: Task[]
  showLeftOver: boolean
  onToggleLeftOver: () => void
  open: Task[]
  timedOpen: Task[]
  untimedOpen: Task[]
  totalCount: number
}) {
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const { day, viewingToday } = env
  const { dateKey, tomorrowKey } = day
  const moveHere = (task: Task) => <MoveHereButton task={task} dateKey={dateKey} viewingToday={viewingToday} />

  const moveAllLeftOver = () =>
    rescheduleTasks(
      leftOver.map((x) => x.id),
      dateKey,
      leftOver.length > 1 ? t('undo.tasksMovedToToday', { count: leftOver.length }) : undefined,
    )

  return (
    <>
      <h2 className={`${headingClass} px-6`}>{t('planner.todoHeading')}</h2>

      {/* 期限切れ → やり残し → 今日やる の順に、どの行がどこに属すか見出しで分ける。期限切れは焦らせてよいので畳まない */}
      {overdue.length > 0 && (
        <div className="mt-2 px-3">
          <p className={`px-3 py-1.5 text-sm ${DUE_TONE_CLASS.overdue}`}>{t('planner.overdueHeading', { count: overdue.length })}</p>
          <ul>
            {overdue.map((task) => (
              <PlannerTaskRow key={task.id} task={task} env={env} action={<TimerButton task={task} />} dueMode="all" hoverActions />
            ))}
          </ul>
        </div>
      )}

      {leftOver.length > 0 && (
        <div className={`${overdue.length > 0 ? 'mt-3' : 'mt-2'} px-3`}>
          {/* 見出しの右に「すべて今日へ」（» の二重矢印）、開くと行ごとに「今日やる」（→）。どちらも行のアイコンと同じ列 */}
          <div className="flex items-center gap-3 pr-3">
            <DisclosureButton tone="alert" open={showLeftOver} onToggle={onToggleLeftOver} className="flex-1">
              <span className="truncate">{t('planner.carryOverHeading', { count: leftOver.length })}</span>
            </DisclosureButton>
            {leftOver.length > 1 ? (
              // 一覧が組み変わる操作なので、印だけでなく文字でも何をするか出す
              <button
                type="button"
                onClick={moveAllLeftOver}
                className={buttonClass(
                  { variant: 'secondary', size: 'xs' },
                  'shrink-0 text-zinc-600 pointer-coarse:min-h-9 dark:text-zinc-300',
                )}
              >
                <CalendarDoubleArrowIcon className="h-3.5 w-3.5" />
                {t('planner.moveAllToToday')}
              </button>
            ) : (
              // 1 件なら行の「今日やる」と同じ。開いたら行の方だけにする
              !showLeftOver && moveHere(leftOver[0]!)
            )}
          </div>
          {showLeftOver && (
            <ul>
              {leftOver.map((task) => (
                <PlannerTaskRow key={task.id} task={task} env={env} action={moveHere(task)} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="px-3">
        {/* 上に期限切れ・やり残しがあるときだけ、ここからが今日やる行だと見出しで示す */}
        {(overdue.length > 0 || leftOver.length > 0) && open.length > 0 && (
          <p className="mt-3 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300">
            {viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
          </p>
        )}
        <ul>
          {timedOpen.map((task) => (
            <PlannerTaskRow
              key={task.id}
              task={task}
              env={env}
              action={
                <>
                  <TomorrowButton task={task} tomorrowKey={tomorrowKey} />
                  <TimerButton task={task} />
                </>
              }
              dueMode="urgent"
              hoverActions
            />
          ))}
        </ul>
        {/* 時間ありは時刻順に上、時間未定はその下に分ける（タイムラインに置くと上へ移る） */}
        {timedOpen.length > 0 && untimedOpen.length > 0 && (
          <p className="ml-11 mt-3 text-xs text-zinc-400 dark:text-zinc-500">{t('planner.untimedHeading')}</p>
        )}
        <ul>
          {untimedOpen.map((task) => (
            <PlannerTaskRow
              key={task.id}
              task={task}
              env={env}
              action={
                <>
                  <SetTimeButton task={task} dateKey={dateKey} />
                  <TomorrowButton task={task} tomorrowKey={tomorrowKey} />
                  <TimerButton task={task} />
                </>
              }
              dueMode="urgent"
              hoverActions
            />
          ))}
        </ul>
      </div>

      <PlannerAddInput dateKey={dateKey} />

      <PlannerListStatus totalCount={totalCount} openCount={open.length} overdueCount={overdue.length} />
    </>
  )
}
