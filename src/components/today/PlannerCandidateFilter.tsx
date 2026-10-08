import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { ActionEntry, ActionLeaf } from '../ui/ActionMenu'
import { FilterMenuButton, SortMenuButton } from '../ui/SortMenuButton'
import { chipClass } from '../ui/chipClass'
import { CloseIcon } from '../icons'
import { colorLabelText } from '../../lib/todoColorLabels'
import { colorVars } from '../../lib/logCategoryColors'
import { displayListName } from '../../lib/displayListName'
import { formatDuration } from '../../lib/timeGrid'
import {
  CANDIDATE_ESTIMATES,
  CANDIDATE_PRIORITIES,
  CANDIDATE_SORTS,
  DEFAULT_CANDIDATE_VIEW,
  type CandidateEstimate,
  type CandidatePriority,
  type CandidateView,
} from '../../lib/plannerCandidates'

type FilterKey = 'listId' | 'color' | 'tag' | 'priority' | 'estimate'

/** 候補にあるリスト・色ラベル・タグ（無いものはメニューに出さない） */
function candidateOptions(pool: readonly Task[]) {
  const listIds = new Set<string>()
  const colors = new Set<string>()
  const tags = new Set<string>()
  for (const task of pool) {
    listIds.add(task.listId)
    if (task.color) colors.add(task.color.toUpperCase())
    for (const tag of task.tags) tags.add(tag)
  }
  return { listIds, colors: [...colors], tags: [...tags].sort((a, b) => a.localeCompare(b, 'ja')) }
}

/**
 * 今日やる候補の並び順と絞り込み（覚えておく）。To-Do 一覧と同じ並び順のボタンと、隣のじょうごのボタンから「リストで絞る ›」…を選ぶ。
 * `chips` は選んでいる絞り込み（× で外す）
 */
export function usePlannerCandidateFilter(pool: readonly Task[]) {
  const { t } = useTranslation()
  const view = useTaskStore((s) => s.plannerCandidateView)
  const setView = useTaskStore((s) => s.setPlannerCandidateView)
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  const options = useMemo(() => candidateOptions(pool), [pool])

  const listName = (id: string) => {
    const list = lists.find((l) => l.id === id)
    return list ? displayListName(list.id, list.name) : null
  }
  const colorName = (hex: string) => colorLabelText(hex, presets, categoryColors, t)
  const priorityName = (p: CandidatePriority) => t(p === 'high' ? 'planner.candidates.priorityHigh' : 'planner.candidates.priorityMedium')
  const estimateName = (e: CandidateEstimate) =>
    e === 'set' ? t('planner.candidates.estimateSet') : t('planner.candidates.estimateWithin', { time: formatDuration(e) })
  const dot = (hex: string) => <span className="gc-dot h-3 w-3 rounded-full" style={colorVars(hex)} aria-hidden />

  /** 中のメニュー: 先頭に「指定なし」、続けて選べる値 */
  const sub = (
    key: FilterKey,
    label: string,
    values: { value: CandidateView[FilterKey]; label: string; icon?: ActionLeaf['icon'] }[],
  ): ActionEntry => {
    const current = values.find((v) => v.value === view[key])
    return {
      kind: 'sub',
      id: key,
      label,
      hint: current?.label,
      leaves: [
        { id: `${key}-any`, label: t('planner.candidates.any'), checked: view[key] === null, run: () => setView({ [key]: null }) },
        ...values.map((v) => ({
          id: `${key}-${String(v.value)}`,
          label: v.label,
          icon: v.icon,
          checked: view[key] === v.value,
          run: () => setView({ [key]: v.value }),
        })),
      ],
    }
  }

  const sortEntries: ActionEntry[] = CANDIDATE_SORTS.map((sort): ActionEntry => ({
    kind: 'leaf',
    id: `sort-${sort}`,
    label: t(`planner.candidates.sort.${sort}`),
    checked: view.sort === sort,
    run: () => setView({ sort }),
  }))

  const filterEntries: ActionEntry[] = [
    // 選べる値が 2 つ以上あるときだけ（1 つなら絞っても変わらない）。選んでいる値は消さない
    ...(options.listIds.size > 1 || view.listId
      ? [
          sub(
            'listId',
            t('planner.candidates.list'),
            lists
              .filter((l) => options.listIds.has(l.id) || l.id === view.listId)
              .map((l) => ({ value: l.id, label: displayListName(l.id, l.name) })),
          ),
        ]
      : []),
    ...(options.colors.length > 0 || view.color
      ? [
          sub(
            'color',
            t('planner.candidates.label'),
            [...new Set([...options.colors, ...(view.color ? [view.color] : [])])]
              .map((hex) => ({ value: hex, label: colorName(hex), icon: dot(hex) }))
              .sort((a, b) => a.label.localeCompare(b.label, 'ja')),
          ),
        ]
      : []),
    ...(options.tags.length > 0 || view.tag
      ? [
          sub(
            'tag',
            t('planner.candidates.tag'),
            [...new Set([...options.tags, ...(view.tag ? [view.tag] : [])])].map((tag) => ({ value: tag, label: tag })),
          ),
        ]
      : []),
    sub(
      'priority',
      t('planner.candidates.priority'),
      CANDIDATE_PRIORITIES.map((p) => ({ value: p, label: priorityName(p) })),
    ),
    sub(
      'estimate',
      t('planner.candidates.estimate'),
      CANDIDATE_ESTIMATES.map((e) => ({ value: e, label: estimateName(e) })),
    ),
  ]

  const chips: { key: FilterKey; label: string; icon?: ReactNode }[] = []
  if (view.listId) chips.push({ key: 'listId', label: listName(view.listId) ?? view.listId })
  if (view.color) chips.push({ key: 'color', label: colorName(view.color), icon: dot(view.color) })
  if (view.tag) chips.push({ key: 'tag', label: view.tag })
  if (view.priority) chips.push({ key: 'priority', label: t('planner.candidates.priorityChip', { value: priorityName(view.priority) }) })
  if (view.estimate !== null) chips.push({ key: 'estimate', label: estimateName(view.estimate) })

  // 並び順（今の並び順の名前）と絞り込み（じょうご。絞り込み中は濃く）を並べる
  const button = (
    // 右端は上の行（「すべて今日へ」・締切）にそろえる
    <div className="mr-3 flex shrink-0 items-center">
      <SortMenuButton label={t(`planner.candidates.sort.${view.sort}`)} entries={sortEntries} ariaLabel={t('planner.candidates.menu')} />
      <FilterMenuButton entries={filterEntries} ariaLabel={t('planner.candidates.filterMenu')} active={chips.length > 0} />
    </div>
  )

  const chipRow =
    chips.length > 0 ? (
      <div className="ml-11 mt-1 flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setView({ [chip.key]: null })}
            aria-label={t('planner.candidates.removeFilter', { name: chip.label })}
            className={chipClass({ variant: 'fill', hover: true })}
          >
            {chip.icon}
            {chip.label}
            <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
          </button>
        ))}
      </div>
    ) : null

  const clearFilters = () =>
    setView({
      listId: DEFAULT_CANDIDATE_VIEW.listId,
      color: DEFAULT_CANDIDATE_VIEW.color,
      tag: DEFAULT_CANDIDATE_VIEW.tag,
      priority: DEFAULT_CANDIDATE_VIEW.priority,
      estimate: DEFAULT_CANDIDATE_VIEW.estimate,
    })

  return { view, button, chipRow, clearFilters }
}
