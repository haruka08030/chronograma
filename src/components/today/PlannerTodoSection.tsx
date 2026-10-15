import { useId, type HTMLAttributes, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { useAuth } from '../../contexts/AuthContext'
import type { Task } from '../../types/task'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { CalendarDoubleArrowIcon } from '../icons'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { MoveHereButton, SetTimeButton, TimerButton, TomorrowButton } from './PlannerRowActions'
import { PlannerAddInput } from './PlannerAddInput'
import { PlannerListStatus } from './PlannerListStatus'
import { PlannerOnboarding } from './PlannerOnboarding'
import { OnboardingNudges } from './OnboardingNudges'
import type { NowNextPlan } from '../../lib/dayPlan'
import { planHex } from '../../lib/planVisual'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { PlannerPlanRow } from './PlannerPlanRow'

/**
 * 今日の計画の To-Do: 期限切れ → やり残し → 今日やる（時間未定 → 時間を決めた）→ 追加欄 → 一言。
 * どの行がどこに属すか見出しで分ける。期限切れは焦らせてよいので畳まない
 */
export function PlannerTodoSection({
  env,
  headingClass,
  overdue,
  overdueShown,
  onShowAllOverdue,
  leftOver,
  showLeftOver,
  onToggleLeftOver,
  open,
  timedOpen,
  untimedOpen,
  totalCount,
  listboxProps,
  ownedGroupIds,
  nowNext,
  onOpenPlanCard,
}: {
  env: PlannerRowEnv
  headingClass: string
  overdue: Task[]
  /** 出している締切切れの行（スマホ幅は先頭の 2 行。残りは「他 N 件」で開く） */
  overdueShown: Task[]
  onShowAllOverdue: () => void
  leftOver: Task[]
  showLeftOver: boolean
  onToggleLeftOver: () => void
  open: Task[]
  /** 時間を決めた行（一番上の「今」「次」に出している To-Do は除いたもの） */
  timedOpen: Task[]
  untimedOpen: Task[]
  totalCount: number
  /** 行を包む listbox（`useTaskListSelection`）。↑↓ の枠を aria-activedescendant で伝える */
  listboxProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> }
  /** 追加欄より下にある候補・完了の行のまとまり（aria-owns でこの listbox に入れる） */
  ownedGroupIds: string[]
  /** スマホの今日やる行の一番上の 1 件（PC・今日以外は null） */
  nowNext: NowNextPlan | null
  /** 予定（授業・バイト・Google の予定）の行を押したときのカード */
  onOpenPlanCard: (plan: Exclude<NowNextPlan, { source: 'task' }>, el: HTMLElement) => void
}) {
  const ids = useId()
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const dataOwner = useTaskStore((s) => s.dataOwner)
  const { user, loading: authLoading } = useAuth()
  const { day, viewingToday } = env
  const { dateKey, tomorrowKey } = day
  // はじめの案内を出していてまだ何も無い間は、追加欄が入口（例が入れ替わり、下に例のボタン）
  // ログイン中で、この端末でこの人としての初めての同期がまだ終わっていない間は出さない（アカウントのデータが届く前に一瞬出ていた）。
  // 終わると持ち主（dataOwner）がこの人になる。アカウントにデータがあれば、その同期で案内は終わる
  const awaitingFirstSync = authLoading || (user !== null && dataOwner !== user.id)
  const showOnboarding = viewingToday && !onboardingDone && !awaitingFirstSync
  const emptyDay = totalCount === 0 && overdue.length === 0 && leftOver.length === 0
  const timedAction = (task: Task) => (
    <>
      <TomorrowButton task={task} tomorrowKey={tomorrowKey} viewingToday={viewingToday} />
      <TimerButton task={task} />
    </>
  )
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

      {/* 読み上げ: 期限切れ・やり残し・今日やるの行は 1 つの listbox（まとまりは group）。候補の行は aria-owns で入れる。
          やり残しの見出しのボタンだけは listbox の中に残る（行の並びの途中にあるため） */}
      <div
        {...listboxProps}
        aria-label={t('planner.todoHeading')}
        aria-owns={ownedGroupIds.join(' ') || undefined}
        className="outline-none"
      >
        {/* 期限切れ → やり残し → 今日やる の順に、どの行がどこに属すか見出しで分ける。期限切れは焦らせてよいので畳まない */}
        {overdue.length > 0 && (
          <div className="mt-2 px-3">
            <p id={`${ids}overdue`} aria-hidden className={`px-3 py-1.5 text-sm ${DUE_TONE_CLASS.overdue}`}>
              {t('planner.overdueHeading', { count: overdue.length })}
            </p>
            <ul role="group" aria-labelledby={`${ids}overdue`}>
              {overdueShown.map((task) => (
                <PlannerTaskRow
                  key={task.id}
                  task={task}
                  env={env}
                  action={
                    <>
                      <MoveHereButton task={task} dateKey={dateKey} viewingToday={viewingToday} collapse />
                      <TimerButton task={task} />
                    </>
                  }
                  dueMode="all"
                  hoverActions
                />
              ))}
            </ul>
            {overdueShown.length < overdue.length && (
              <button
                type="button"
                onClick={onShowAllOverdue}
                className={`ml-11 ${buttonClass({ variant: 'link', size: 'xs' }, 'pointer-coarse:min-h-9')}`}
              >
                {t('planner.moreOverdue', { count: overdue.length - overdueShown.length })}
              </button>
            )}
          </div>
        )}

        {leftOver.length > 0 && (
          <div className={`${overdue.length > 0 ? 'mt-3' : 'mt-2'} px-3`}>
            {/* 見出しの右に「すべて今日へ」（» の二重矢印）、開くと行ごとに「今日やる」（→）。どちらも行のアイコンと同じ列 */}
            <div className="flex items-center gap-3 pr-3">
              <DisclosureButton open={showLeftOver} onToggle={onToggleLeftOver} className="flex-1">
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
              <ul role="group" aria-label={t('planner.carryOverHeading', { count: leftOver.length })}>
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
            <p aria-hidden className="mt-3 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              {viewingToday ? t('planner.doToday') : t('planner.doThisDay')}
            </p>
          )}
          {nowNext && (
            // スマホだけ（横にタイムラインが無い）。To-Do ならキー操作の並びでもここが先頭（下の時間を決めた行からは外してある）
            <ul data-now-next={nowNext.kind} role="group" aria-label={t('planner.nowNextAria')}>
              {nowNext.source === 'task' ? (
                <PlannerTaskRow
                  task={nowNext.task}
                  env={env}
                  lead={t(nowNext.kind === 'now' ? 'planner.nowRow' : 'planner.nextRow')}
                  action={timedAction(nowNext.task)}
                  dueMode="urgent"
                  hoverActions
                />
              ) : (
                <PlannerPlanRow
                  title={nowNext.source === 'google' ? nowNext.event.summary : nowNext.task.title}
                  time={
                    nowNext.source === 'google'
                      ? `${nowNext.event.startTime}–${nowNext.event.endTime}`
                      : `${nowNext.task.startTime}–${nowNext.task.endTime}`
                  }
                  colorHex={nowNext.source === 'google' ? (nowNext.event.color ?? DEFAULT_GOOGLE_EVENT_HEX) : planHex(nowNext.task)}
                  lead={t(nowNext.kind === 'now' ? 'planner.nowRow' : 'planner.nextRow')}
                  onOpen={(el) => onOpenPlanCard(nowNext, el)}
                />
              )}
            </ul>
          )}
          <ul role="group" aria-label={viewingToday ? t('planner.doToday') : t('planner.doThisDay')}>
            {untimedOpen.map((task) => (
              <PlannerTaskRow
                key={task.id}
                task={task}
                env={env}
                action={
                  <>
                    <SetTimeButton task={task} dateKey={dateKey} />
                    <TomorrowButton task={task} tomorrowKey={tomorrowKey} viewingToday={viewingToday} />
                    <TimerButton task={task} />
                  </>
                }
                dueMode="urgent"
                hoverActions
              />
            ))}
          </ul>
          {/* 時間未定（まだいつやるか決める行）を上、時間を決めた行はその下に時刻順（横のタイムラインにも出ている） */}
          {timedOpen.length > 0 && untimedOpen.length > 0 && (
            <p aria-hidden className="ml-11 mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              {t('planner.timedHeading')}
            </p>
          )}
          <ul role="group" aria-label={t('planner.timedHeading')}>
            {timedOpen.map((task) => (
              <PlannerTaskRow key={task.id} task={task} env={env} action={timedAction(task)} dueMode="urgent" hoverActions />
            ))}
          </ul>
        </div>
      </div>

      <PlannerAddInput dateKey={dateKey} showExample={emptyDay} guide={showOnboarding && emptyDay} />

      <PlannerListStatus totalCount={totalCount} openCount={open.length} overdueCount={overdue.length} />

      {/* はじめて使う人だけ: 今日を見ているとき、追加欄の下に進み具合の 1 行 */}
      {showOnboarding && <PlannerOnboarding />}
      {/* 案内を終えた直後の 1 回だけの誘い（iPhone の Safari ならホーム画面への追加） */}
      {viewingToday && <OnboardingNudges />}
    </>
  )
}
