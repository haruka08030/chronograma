import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { DueGroup } from '../../lib/dayPlan'
import { useDateFormat } from '../../hooks/useDateFormat'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { META_TONE_CLASS } from './plannerRowMeta'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { MoveHereButton } from './PlannerRowActions'

/** 今日の計画の候補（締切間近・その先・日付なし）。畳んだ 1 行で、開くと締切の日ごとのまとまり */
export function PlannerSuggestions({
  env,
  suggestions,
  candidateGroups,
  open,
  onToggle,
  hasMoreToShow,
  moreSentinelRef,
  groupId,
}: {
  env: PlannerRowEnv
  /** 締切間近（「すべて追加」の対象） */
  suggestions: Task[]
  candidateGroups: DueGroup[]
  open: boolean
  onToggle: () => void
  hasMoreToShow: boolean
  moreSentinelRef: RefObject<HTMLDivElement | null>
  /** まとまりの id（今日の計画の listbox が aria-owns で自分の中に入れる） */
  groupId: (group: DueGroup) => string
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const rescheduleTasks = useTaskStore((s) => s.rescheduleTasks)
  const { day, viewingToday } = env
  const { dateKey, tomorrowKey } = day
  /** 「すべて追加」（締切間近の候補）を、その最後の行があるまとまりの下に置く */
  const lastSuggestionId = suggestions.at(-1)?.id

  /** 候補のまとまりの見出し（締切の日）。今日・明日は締切の色で焦らせる */
  const dueGroupHeading = (group: DueGroup): { text: string; tone: string } => {
    if (group.kind === 'later') return { text: t('planner.dueLater'), tone: META_TONE_CLASS.muted }
    if (group.kind === 'none') return { text: t('planner.dueNone'), tone: META_TONE_CLASS.muted }
    if (group.dueDate === dateKey) return { text: t('planner.dueToday'), tone: META_TONE_CLASS.today }
    if (group.dueDate === tomorrowKey) return { text: t('planner.dueTomorrow'), tone: META_TONE_CLASS.tomorrow }
    return { text: t('planner.dueOn', { date: df.monthDayWeekday(group.dueDate) }), tone: META_TONE_CLASS.muted }
  }

  return (
    <div className="mt-6 px-3">
      <DisclosureButton open={open} onToggle={onToggle} className="w-full">
        <span className="flex-1">
          {suggestions.length > 0 ? t('planner.suggestionsHeading', { count: suggestions.length }) : t('planner.suggestionsHeadingPlain')}
        </span>
      </DisclosureButton>
      {open && (
        <>
          {candidateGroups.map((group, i) => {
            const heading = dueGroupHeading(group)
            return (
              <div key={group.kind === 'day' ? group.dueDate : group.kind}>
                <p className={`ml-11 text-xs ${i === 0 ? 'mt-2' : 'mt-4'} ${heading.tone}`}>{heading.text}</p>
                <ul id={groupId(group)} role="group" aria-label={heading.text}>
                  {group.tasks.map((task) => (
                    <PlannerTaskRow
                      key={task.id}
                      task={task}
                      env={env}
                      action={<MoveHereButton task={task} dateKey={dateKey} viewingToday={viewingToday} />}
                      dueMode={group.kind === 'later' ? 'date' : 'none'}
                    />
                  ))}
                </ul>
                {suggestions.length > 1 && group.tasks.some((x) => x.id === lastSuggestionId) && (
                  <button
                    type="button"
                    onClick={() =>
                      rescheduleTasks(
                        suggestions.map((x) => x.id),
                        dateKey,
                      )
                    }
                    className={`ml-11 mt-1 ${buttonClass({ variant: 'link', size: 'xs' })}`}
                  >
                    {t(viewingToday ? 'planner.addAllSuggestions' : 'planner.addAllSuggestionsThisDay', {
                      count: suggestions.length,
                    })}
                  </button>
                )}
              </div>
            )
          })}
          {hasMoreToShow && <div ref={moreSentinelRef} aria-hidden className="h-px" />}
        </>
      )}
    </div>
  )
}
