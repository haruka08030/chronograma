import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, INBOX_LIST_ID, type SortMode } from '../../store/taskStore'
import type { SectionGroupingScope } from '../../store/storeTypes'
import type { ListKind, TaskList } from '../../types/list'
import { ListKindPicker } from '../ListKindPicker'
import type { ActionEntry } from '../ui/ActionMenu'
import { FilterMenuButton, SortMenuButton } from '../ui/SortMenuButton'
import { FilterChips, type FilterChip } from '../ui/FilterChips'
import { useTaskFilterMenu } from '../ui/useTaskFilterMenu'
import { MenuIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { META_TEXT } from '../ui/textClass'
import { colorVars } from '../../lib/logCategoryColors'
import { TODO_FILTER_KEYS } from '../../lib/taskFilter'
import type { Task } from '../../types/task'

const SORT_OPTIONS: SortMode[] = ['manual', 'dueDate', 'priority', 'title', 'createdAt']
/** いつか・チェックリストは締切・優先度を持たないので、その並び順は出さない */
const UNPLANNED_SORT_OPTIONS: SortMode[] = ['manual', 'title', 'createdAt']
/** 優先度・見積もりは値が決まっているので、候補の To-Do から選ぶ値を集めない */
const NO_POOL: Task[] = []

/**
 * To-Do 一覧の見出し（名前・未完了の件数・絞り込みのチップ）と、種類・セクション追加・並び順・絞り込みのボタン。
 * じょうごは優先度・見積もりだけ（リスト・ラベルは左のパネル）。いつか・チェックリストには出さない
 */
export function TaskListHeader({
  title,
  colorView,
  filterColor,
  incompleteCount,
  selectedList,
  selectedListId,
  listKind,
  sortMode,
  groupingScope,
  groupBySection,
  hasSections,
  onAddSection,
  onOpenNav,
}: {
  title: string
  colorView: boolean
  /** 色ラベルを開いているときの色（見出しの丸） */
  filterColor: string | undefined
  incompleteCount: number
  selectedList: TaskList | null
  selectedListId: string | null
  listKind: ListKind
  sortMode: SortMode
  groupingScope: SectionGroupingScope
  groupBySection: boolean
  /** 分けられるセクションがあるか */
  hasSections: boolean
  onAddSection: (listId: string) => void
  /** スマホで ≡ を押したとき（左のパネルが無いので、リストのドロワーを出す） */
  onOpenNav?: () => void
}) {
  const { t } = useTranslation()
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const setSectionGrouping = useTaskStore((s) => s.setSectionGrouping)
  const todoFilter = useTaskStore((s) => s.todoFilter)
  const setTodoFilter = useTaskStore((s) => s.setTodoFilter)
  const filterMenu = useTaskFilterMenu({ filter: todoFilter, setFilter: setTodoFilter, keys: TODO_FILTER_KEYS, pool: NO_POOL })
  const canFilter = listKind === 'tasks'
  const chips: FilterChip[] = [
    ...(filterTag ? [{ key: 'tag', label: filterTag, onRemove: () => setFilterTag(null) }] : []),
    ...(canFilter ? filterMenu.chips : []),
  ]
  const sortOptions = useMemo(
    () => (listKind === 'tasks' ? SORT_OPTIONS : UNPLANNED_SORT_OPTIONS).map((value) => ({ value, label: t(`taskList.sort.${value}`) })),
    [t, listKind],
  )
  const sortEntries: ActionEntry[] = [
    ...sortOptions.map((opt): ActionEntry => ({
      kind: 'leaf',
      id: opt.value,
      label: opt.label,
      checked: sortMode === opt.value,
      run: () => setSortMode(opt.value),
    })),
    // 手動はセクションの中で並べ替えるものなので、分けるかどうかを選ぶのは手動以外のときだけ。セクションが無ければ出さない
    ...(sortMode !== 'manual' && hasSections
      ? [
          {
            kind: 'leaf',
            id: 'group-by-section',
            label: t('taskList.groupBySection'),
            checked: groupBySection,
            divider: true,
            run: () => setSectionGrouping(groupingScope, !groupBySection),
          } satisfies ActionEntry,
        ]
      : []),
  ]

  // 見出しは下のリスト（「タスクを追加」の＋・行の頭）と同じ 32px にそろえる
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-8 pb-2 pt-6 md:pt-8">
      <div className="min-w-0">
        <h1 className={`flex items-center gap-2.5 ${PAGE_TITLE_CLASS}`}>
          {onOpenNav && (
            <button
              type="button"
              onClick={onOpenNav}
              aria-label={t('taskList.openLists')}
              className="-my-1 -ml-2 shrink-0 rounded-full p-1.5 text-zinc-500 touch-manipulation active:bg-zinc-100 md:hidden dark:text-zinc-400 dark:active:bg-zinc-800"
            >
              <MenuIcon className="h-5 w-5" strokeWidth={1.75} />
            </button>
          )}
          {colorView && filterColor && (
            <span className="gc-dot h-3.5 w-3.5 shrink-0 rounded-full" style={colorVars(filterColor)} aria-hidden />
          )}
          {title}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <p className={META_TEXT}>{t('taskList.incompleteTasks', { count: incompleteCount })}</p>
          <FilterChips chips={chips} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        {selectedList && selectedList.id !== INBOX_LIST_ID && <ListKindPicker list={selectedList} />}
        {selectedListId && (
          <button type="button" onClick={() => onAddSection(selectedListId)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            {t('taskList.addSection')}
          </button>
        )}
        <div className="flex items-center">
          <SortMenuButton label={sortOptions.find((o) => o.value === sortMode)?.label ?? ''} entries={sortEntries} />
          {canFilter && (
            <FilterMenuButton entries={filterMenu.entries} ariaLabel={t('taskList.filterMenu')} active={filterMenu.chips.length > 0} />
          )}
        </div>
      </div>
    </div>
  )
}
