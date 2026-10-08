import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { CandidateGroup } from './usePlannerSuggestions'
import { usePlannerCandidateFilter } from './PlannerCandidateFilter'
import { hasCandidateFilter } from '../../lib/plannerCandidates'
import { useDateFormat } from '../../hooks/useDateFormat'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { META_TONE_CLASS } from './plannerRowMeta'
import { PlannerTaskRow, type PlannerRowEnv } from './PlannerTaskRow'
import { MoveHereButton } from './PlannerRowActions'

/**
 * 今日の計画の候補（締切間近・その先・日付なし）。畳んだ 1 行で、開くと締切の日ごとのまとまり。
 * 開いているときは見出しの右に並び順・絞り込みのボタン（締切順以外は見出しで分けず、行に締切を出す）
 */
export function PlannerSuggestions({
  env,
  suggestions,
  addAllTargets,
  pool,
  candidateGroups,
  open,
  onToggle,
  hasMoreToShow,
  moreSentinelRef,
  groupId,
}: {
  env: PlannerRowEnv
  /** 締切間近（見出しの件数） */
  suggestions: Task[]
  /** 「すべて追加」の対象（締切間近のうち絞り込みに合うもの。締切順以外では空） */
  addAllTargets: Task[]
  /** 絞り込む前の候補すべて（メニューに出すリスト・ラベル・タグ） */
  pool: Task[]
  candidateGroups: CandidateGroup[]
  open: boolean
  onToggle: () => void
  hasMoreToShow: boolean
  moreSentinelRef: RefObject<HTMLDivElement | null>
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
  const filtered = hasCandidateFilter(filter.view)

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
      <div className="flex items-center gap-1">
        <DisclosureButton open={open} onToggle={onToggle} className="min-w-0 flex-1">
          <span className="flex-1">
            {suggestions.length > 0 ? t('planner.suggestionsHeading', { count: suggestions.length }) : t('planner.suggestionsHeadingPlain')}
          </span>
        </DisclosureButton>
        {open && filter.button}
      </div>
      {open && (
        <>
          {filter.chipRow}
          {filtered && candidateGroups.length === 0 && (
            <p className="ml-11 mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              {t('planner.candidates.noMatch')}{' '}
              <button type="button" onClick={filter.clearFilters} className={buttonClass({ variant: 'link', size: 'xs' })}>
                {t('planner.candidates.clearFilters')}
              </button>
            </p>
          )}
          {candidateGroups.map((group, i) => {
            const heading = dueGroupHeading(group)
            return (
              <div key={group.kind === 'day' ? group.dueDate : group.kind} className={heading ? '' : 'mt-2'}>
                {heading && <p className={`ml-11 text-xs ${i === 0 ? 'mt-2' : 'mt-4'} ${heading.tone}`}>{heading.text}</p>}
                <ul id={groupId(group)} role="group" aria-label={heading?.text ?? t('planner.suggestionsHeadingPlain')}>
                  {group.tasks.map((task) => (
                    <PlannerTaskRow
                      key={task.id}
                      task={task}
                      env={env}
                      action={<MoveHereButton task={task} dateKey={dateKey} viewingToday={viewingToday} />}
                      dueMode={group.kind === 'sorted' ? 'all' : group.kind === 'later' ? 'date' : 'none'}
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
          {hasMoreToShow && <div ref={moreSentinelRef} aria-hidden className="h-px" />}
        </>
      )}
    </div>
  )
}
