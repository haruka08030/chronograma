import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { ActionEntry } from '../ui/ActionMenu'
import { FilterMenuButton, SortMenuButton } from '../ui/SortMenuButton'
import { FilterChips } from '../ui/FilterChips'
import { useTaskFilterMenu } from '../ui/useTaskFilterMenu'
import { CANDIDATE_SORTS } from '../../lib/plannerCandidates'

const CANDIDATE_FILTER_KEYS = ['listId', 'color', 'tag', 'priority', 'estimate'] as const

/**
 * 今日やる候補の並び順と絞り込み（覚えておく）。To-Do 一覧と同じ並び順のボタンと、隣のじょうごのボタンから「リストで絞る ›」…を選ぶ。
 * `chipRow` は選んでいる絞り込み（× で外す）
 */
export function usePlannerCandidateFilter(pool: readonly Task[]) {
  const { t } = useTranslation()
  const view = useTaskStore((s) => s.plannerCandidateView)
  const setView = useTaskStore((s) => s.setPlannerCandidateView)
  const { entries, chips, clear } = useTaskFilterMenu({ filter: view, setFilter: setView, keys: CANDIDATE_FILTER_KEYS, pool })

  const sortEntries: ActionEntry[] = CANDIDATE_SORTS.map((sort): ActionEntry => ({
    kind: 'leaf',
    id: `sort-${sort}`,
    label: t(`planner.candidates.sort.${sort}`),
    checked: view.sort === sort,
    run: () => setView({ sort }),
  }))

  // 並び順（今の並び順の名前）と絞り込み（じょうご。絞り込み中は濃く）を並べる
  const button = (
    // 右端は上の行（「すべて今日へ」・締切）にそろえる
    <div className="mr-3 flex shrink-0 items-center">
      <SortMenuButton label={t(`planner.candidates.sort.${view.sort}`)} entries={sortEntries} ariaLabel={t('planner.candidates.menu')} />
      <FilterMenuButton entries={entries} ariaLabel={t('planner.candidates.filterMenu')} active={chips.length > 0} />
    </div>
  )

  return { view, button, chipRow: <FilterChips chips={chips} className="ml-11 mt-1" />, clearFilters: clear }
}
