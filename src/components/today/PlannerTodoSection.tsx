import { useId, useState, type HTMLAttributes, type Ref } from 'react'
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
import { focusQuickAdd } from '../../lib/quickAddFocus'

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
  listboxProps,
  ownedGroupIds,
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
  /** 行を包む listbox（`useTaskListSelection`）。↑↓ の枠を aria-activedescendant で伝える */
  listboxProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> }
  /** 追加欄より下にある候補の行のまとまり（aria-owns でこの listbox に入れる） */
  ownedGroupIds: string[]
}) {
  const ids = useId()
  const { t } = useTranslation()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const dataOwner = useTaskStore((s) => s.dataOwner)
  const { user, loading: authLoading } = useAuth()
  const [draft, setDraft] = useState('')
  const { day, viewingToday } = env
  const { dateKey, tomorrowKey } = day
  // はじめの案内を出している間は、書き方の例は案内の方に出す（追加欄と 2 回出さない）
  // ログイン中で、この端末でこの人としての初めての同期がまだ終わっていない間は出さない（アカウントのデータが届く前に一瞬出ていた）。
  // 終わると持ち主（dataOwner）がこの人になる。アカウントにデータがあれば、その同期で案内は終わる
  const awaitingFirstSync = authLoading || (user !== null && dataOwner !== user.id)
  const showOnboarding = viewingToday && !onboardingDone && !awaitingFirstSync
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
          <ul role="group" aria-label={viewingToday ? t('planner.doToday') : t('planner.doThisDay')}>
            {timedOpen.map((task) => (
              <PlannerTaskRow
                key={task.id}
                task={task}
                env={env}
                action={
                  <>
                    <TomorrowButton task={task} tomorrowKey={tomorrowKey} viewingToday={viewingToday} />
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
            <p aria-hidden className="ml-11 mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              {t('planner.untimedHeading')}
            </p>
          )}
          <ul role="group" aria-label={t('planner.untimedHeading')}>
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
        </div>
      </div>

      <PlannerAddInput
        dateKey={dateKey}
        draft={draft}
        onDraftChange={setDraft}
        showExample={!showOnboarding && totalCount === 0 && overdue.length === 0 && leftOver.length === 0}
      />

      <PlannerListStatus totalCount={totalCount} openCount={open.length} overdueCount={overdue.length} />

      {/* はじめて使う人だけ: 今日を見ているとき、追加欄の下に 3 ステップ */}
      {showOnboarding && (
        <PlannerOnboarding
          onUseExample={(text) => {
            setDraft(text)
            focusQuickAdd()
          }}
        />
      )}
    </>
  )
}
