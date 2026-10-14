import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { CandidateGroup } from './usePlannerSuggestions'
import type { DueGroup } from '../../lib/dayPlan'
import { usePlannerCandidateFilter } from './PlannerCandidateFilter'
import { hasTaskFilter } from '../../lib/taskFilter'
import { FilterNoMatch } from '../ui/FilterChips'
import { useDateFormat } from '../../hooks/useDateFormat'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { META_TONE_CLASS } from './plannerRowMeta'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { MoveHereButton } from './PlannerRowActions'
import { daysBeforeDue, dueFits } from '../../lib/dayLoad'
import { useDayLoads } from '../../hooks/useDayLoads'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { formatDuration } from '../../lib/timeGrid'
import { tip } from '../../lib/tooltip'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { ShowMoreButton } from '../ui/ShowMoreButton'
import { shortDate } from '../../lib/moveToast'

/**
 * 今日の計画の候補（締切間近・その先・日付なし）。畳んだ 1 行で、開くと締切の日ごとのまとまり。
 * 開いているときは見出しの右に並び順・絞り込みのボタン（締切順以外は見出しで分けず、行に締切を出す）
 */
export function PlannerSuggestions({
  env,
  addAllTargets,
  pool,
  candidateGroups,
  dueGroups,
  open,
  onToggle,
  remaining,
  onShowMore,
  groupId,
}: {
  env: PlannerRowEnv
  /**
   * 「すべて追加」の対象で、見出しの「締切が近い n 件」（締切間近のうち絞り込みに合うもの）。
   * 締切順以外は中身が締切の近いものだけではないので空（見出しは「To-Do から追加」）
   */
  addAllTargets: Task[]
  /** 絞り込む前の候補すべて（メニューに出すリスト・ラベル・タグ） */
  pool: Task[]
  candidateGroups: CandidateGroup[]
  /** 締切順で分けたまとまり（並び順に関係なく「入りきらない」を数える） */
  dueGroups: DueGroup[]
  open: boolean
  onToggle: () => void
  /** まだ出していない候補の数（「さらに表示（残り N 件）」） */
  remaining: number
  onShowMore: () => void
  /** まとまりの id（今日の計画の listbox が aria-owns で自分の中に入れる） */
  groupId: (group: CandidateGroup) => string
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const { day, viewingToday } = env
  const { dateKey, tomorrowKey } = day
  /** 「すべて追加」（締切間近の候補）を、その最後の行があるまとまりの下に置く */
  const lastSuggestionId = addAllTargets.at(-1)?.id
  const filter = usePlannerCandidateFilter(pool)
  const filtered = hasTaskFilter(filter.view)

  // 締切の日ごとに、見積もりが締切までの空きに入りきるか（今日から先の日を見ているときだけ。#332）。
  // 締切順は見出しに「入りきらない」、ほかの並び順は見出しが無いので、その締切の行の締切の文字を締切の赤にする
  const todayKey = useAppTodayKey()
  const dayGroups = useMemo(
    () =>
      dateKey >= todayKey
        ? dueGroups.flatMap((g) => (g.kind === 'day' && g.dueDate >= dateKey ? [{ dueDate: g.dueDate, tasks: g.tasks }] : []))
        : [],
    [dueGroups, dateKey, todayKey],
  )
  const lastDue = dayGroups.at(-1)?.dueDate
  const loads = useDayLoads(lastDue ? daysBeforeDue(dateKey, lastDue) : [])
  const fits = useMemo(() => dueFits(dayGroups, dateKey, (k) => loads.get(k)?.freeMinutes ?? 0), [dayGroups, dateKey, loads])
  /** 入りきらない締切の数字（ツールチップ・読み上げ） */
  const fitHintOf = (dueDate: string | null) => {
    const fit = dueDate ? fits.get(dueDate) : undefined
    return fit?.over
      ? t('planner.dueFitHint', { estimate: formatDuration(fit.estimateMinutes), free: formatDuration(fit.freeMinutes) })
      : undefined
  }

  /** 候補のまとまりの見出し（締切の日）。今日・明日は締切の色で焦らせる */
  const dueGroupHeading = (group: CandidateGroup): { text: string; tone: string } | null => {
    if (group.kind === 'sorted') return null
    if (group.kind === 'later') return { text: t('planner.dueLater'), tone: META_TONE_CLASS.muted }
    if (group.kind === 'none') return { text: t('planner.dueNone'), tone: META_TONE_CLASS.muted }
    if (group.dueDate === dateKey) return { text: t('planner.dueToday'), tone: META_TONE_CLASS.today }
    if (group.dueDate === tomorrowKey) return { text: t('planner.dueTomorrow'), tone: META_TONE_CLASS.tomorrow }
    return { text: t('planner.dueOn', { date: df.monthDayWeekday(group.dueDate) }), tone: META_TONE_CLASS.muted }
  }

  return (
    <div className="mt-6 px-3">
      {/* 見出しは折り返さない。並び順・絞り込みのボタンが入りきらないとき（スマホで長い並び順の名前）は次の行の右に回す */}
      <div className="flex flex-wrap items-center justify-end gap-1">
        <DisclosureButton open={open} onToggle={onToggle} className="flex-1 whitespace-nowrap">
          <span className="flex-1">
            {addAllTargets.length > 0
              ? t('planner.suggestionsHeading', { count: addAllTargets.length })
              : t('planner.suggestionsHeadingPlain')}
          </span>
        </DisclosureButton>
        {open && filter.button}
      </div>
      {open && (
        <>
          {filter.chipRow}
          {filtered && candidateGroups.length === 0 && (
            <FilterNoMatch text={t('planner.candidates.noMatch')} onClear={filter.clearFilters} className="ml-11 mt-2" />
          )}
          {candidateGroups.map((group, i) => {
            const heading = dueGroupHeading(group)
            const fitHint = group.kind === 'day' ? fitHintOf(group.dueDate) : undefined
            return (
              <div key={group.kind === 'day' ? group.dueDate : group.kind} className={heading ? '' : 'mt-2'}>
                {heading && (
                  <p className={`ml-11 flex items-baseline justify-between gap-2 text-xs ${i === 0 ? 'mt-2' : 'mt-4'} ${heading.tone}`}>
                    <span>{heading.text}</span>
                    {fitHint && (
                      // 入りきらないときだけ 1 語（数字は押したとき・ホバーで）。入りきるときは何も足さない
                      <span data-due-fit="over" {...tip(fitHint)} className={`mr-3 shrink-0 ${DUE_TONE_CLASS.overdue}`}>
                        {t('planner.dueFitOver')}
                        <span className="sr-only"> {fitHint}</span>
                      </span>
                    )}
                  </p>
                )}
                <ul id={groupId(group)} role="group" aria-label={heading?.text ?? t('planner.suggestionsHeadingPlain')}>
                  {group.tasks.map((task) => (
                    <PlannerTaskRow
                      key={task.id}
                      task={task}
                      env={env}
                      action={<MoveHereButton task={task} dateKey={dateKey} viewingToday={viewingToday} />}
                      dueMode={group.kind === 'sorted' ? 'all' : group.kind === 'later' ? 'date' : 'none'}
                      dueOverHint={group.kind === 'sorted' ? fitHintOf(task.dueDate) : undefined}
                    />
                  ))}
                </ul>
                {addAllTargets.length > 1 && group.tasks.some((x) => x.id === lastSuggestionId) && (
                  <button
                    type="button"
                    onClick={() =>
                      rescheduleTasks(
                        addAllTargets.map((x) => x.id),
                        dateKey,
                        // やり残しの「すべて今日へ」と同じく件数と「元に戻す」
                        viewingToday
                          ? t('undo.tasksMovedToToday', { count: addAllTargets.length })
                          : { key: 'undo.tasksMovedToDate', params: { count: addAllTargets.length, date: shortDate(dateKey) } },
                      )
                    }
                    className={`ml-11 mt-1 ${buttonClass({ variant: 'link', size: 'xs' })}`}
                  >
                    {t(viewingToday ? 'planner.addAllSuggestions' : 'planner.addAllSuggestionsThisDay', {
                      count: addAllTargets.length,
                    })}
                  </button>
                )}
              </div>
            )
          })}
          {remaining > 0 && <ShowMoreButton onClick={onShowMore} remaining={remaining} />}
        </>
      )}
    </div>
  )
}
