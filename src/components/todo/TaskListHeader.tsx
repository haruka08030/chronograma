import { useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { POPOVER_PANEL } from '../ui/surface'
import { useTaskStore, INBOX_LIST_ID, type SortMode } from '../../store/taskStore'
import type { SectionGroupingScope } from '../../store/storeTypes'
import type { ListKind, TaskList } from '../../types/list'
import { ListKindPicker } from '../ListKindPicker'
import { MenuDivider, MenuItem } from '../ui/Menu'
import { CaretDownIcon, CloseIcon, SortIcon } from '../icons'
import { TodoSwitcherMenu } from './TodoSwitcherMenu'
import { Switch } from '../settings/SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'
import { chipClass } from '../ui/chipClass'
import { PAGE_TITLE_CLASS } from '../ui/headingClass'
import { META_TEXT } from '../ui/textClass'

const SORT_OPTIONS: SortMode[] = ['manual', 'dueDate', 'priority', 'title', 'createdAt']
/** いつか・チェックリストは締切・優先度を持たないので、その並び順は出さない */
const UNPLANNED_SORT_OPTIONS: SortMode[] = ['manual', 'title', 'createdAt']

/** To-Do 一覧の見出し（名前・未完了の件数・タグの絞り込み）と、種類・セクション追加・並び順のボタン */
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
  onAddSection,
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
  onAddSection: (listId: string) => void
}) {
  const { t } = useTranslation()
  const setSortMode = useTaskStore((s) => s.setSortMode)
  const filterTag = useTaskStore((s) => s.filterTag)
  const setFilterTag = useTaskStore((s) => s.setFilterTag)
  const setSectionGrouping = useTaskStore((s) => s.setSectionGrouping)
  const [showSort, setShowSort] = useState(false)
  const [switcher, setSwitcher] = useState<{ x: number; y: number } | null>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  useDismiss({ open: showSort, onClose: () => setShowSort(false), inside: [sortMenuRef] })
  const sortOptions = useMemo(
    () => (listKind === 'tasks' ? SORT_OPTIONS : UNPLANNED_SORT_OPTIONS).map((value) => ({ value, label: t(`taskList.sort.${value}`) })),
    [t, listKind],
  )

  // 見出しは下のリスト（「タスクを追加」の＋・行の頭）と同じ 32px にそろえる
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-8 pb-2 pt-6 md:pt-8">
      <div className="min-w-0">
        <h1 className={`flex items-center gap-2.5 ${PAGE_TITLE_CLASS}`}>
          {colorView && (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: filterColor }} aria-hidden />
          )}
          {/* スマホは題名を押すとリスト・絞り込みを切り替えられる（左のパネルが無いので） */}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={switcher !== null}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setSwitcher({ x: r.left, y: r.bottom + 4 })
            }}
            className="-mx-1 inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1 touch-manipulation active:bg-zinc-100 md:hidden dark:active:bg-zinc-800"
          >
            <span className="truncate">{title}</span>
            <CaretDownIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
          <span className="hidden md:inline">{title}</span>
        </h1>
        {switcher && <TodoSwitcherMenu x={switcher.x} y={switcher.y} onClose={() => setSwitcher(null)} />}
        <div className="flex items-center gap-2 mt-1">
          <p className={META_TEXT}>
            {t('taskList.incompleteTasks', { count: incompleteCount })}
          </p>
          {filterTag && (
            <button
              onClick={() => setFilterTag(null)}
              className={chipClass({ variant: 'fill', hover: true })}
            >
              {filterTag}
              <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        {selectedList && selectedList.id !== INBOX_LIST_ID && <ListKindPicker list={selectedList} />}
        {selectedListId && (
          <button
            type="button"
            onClick={() => onAddSection(selectedListId)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            {t('taskList.addSection')}
          </button>
        )}
        <div ref={sortMenuRef} className="relative">
        <button
          type="button"
          aria-expanded={showSort}
          onClick={() => setShowSort(!showSort)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                     text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <SortIcon className="w-3.5 h-3.5" />
          {sortOptions.find((o) => o.value === sortMode)?.label}
        </button>
        {showSort && (
          <>
            {/* 見出しの whitespace-nowrap を受け継いで項目が横一列にならないよう、縦に積む */}
            <div role="menu" className={`absolute right-0 top-full z-20 mt-1 origin-top-right flex min-w-44 flex-col p-1 ${POPOVER_PANEL}`}>
              {sortOptions.map((opt) => (
                <MenuItem
                  key={opt.value}
                  role="menuitemradio"
                  checked={sortMode === opt.value}
                  onClick={() => { setSortMode(opt.value); setShowSort(false) }}
                >
                  {opt.label}
                </MenuItem>
              ))}
              {/* 手動はセクションの中で並べ替えるものなので、分けるかどうかを選ぶのは手動以外のときだけ */}
              {sortMode !== 'manual' && (
                <>
                  <MenuDivider />
                  {/* 並び順（どれか 1 つ）とは別の、オン/オフの設定なのでスイッチにする。切り替えてもメニューは閉じない */}
                  <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                    <span
                      className="cursor-pointer select-none text-sm text-zinc-700 dark:text-zinc-200"
                      onClick={() => setSectionGrouping(groupingScope, !groupBySection)}
                    >
                      {t('taskList.groupBySection')}
                    </span>
                    <Switch
                      checked={groupBySection}
                      onChange={(on) => setSectionGrouping(groupingScope, on)}
                      label={t('taskList.groupBySection')}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}
