import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { searchRecords, searchTasks } from '../lib/searchTasks'
import { TaskItem } from './TaskItem'
import { SearchIcon } from './icons'
import { EmptyState } from './ui/EmptyState'
import { SectionLabel } from './ui/SectionLabel'
import { ShowMoreButton } from './ui/ShowMoreButton'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { useShowMore } from '../hooks/useShowMore'
import { useDateFormat } from '../hooks/useDateFormat'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'
import { MENU_ROW_HOVER } from './ui/surface'
import type { Task } from '../types/task'

/**
 * 検索の結果。To-Do（と予定）は一覧の行で、記録・睡眠は下に件数と「記録を見る」で分けて出す（性質の違うものを混ぜない。#288）。
 * 当たった行は先頭から 100 件だけ描き、「さらに表示」・最後の行で ↓ で足す。
 * 語は `useDeferredValue` で受ける（打つのを待たせず、結果は手が空いたときに描き直す）
 */
export function SearchResults() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const typed = useTaskStore((s) => s.searchQuery)
  const query = useDeferredValue(typed)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const bulk = useBulkTaskActions()

  const results = useMemo(() => searchTasks(tasks, query), [tasks, query])
  const records = useMemo(() => searchRecords(tasks, query), [tasks, query])
  const { limit, remaining, showMore } = useShowMore(results.length, query)
  const shown = useMemo(() => results.slice(0, limit), [results, limit])
  const shownIds = useMemo(() => shown.map((r) => r.id), [shown])

  // 選択とキー操作は To-Do 一覧と同じ（検索欄の ↓ で最初の結果に枠が移る）。⌘A・削除は描いている行だけ
  const clearSelectedRef = useRef<() => void>(() => {})
  const { clearSelection, makeRowClick, makeSelection, listboxProps } = useTaskListSelection({
    rowIds: shownIds,
    openDetail: openTaskDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.toggleComplete,
    openMenu: (m) => openTaskMenu({ kind: 'task', ...m, onDone: () => clearSelectedRef.current() }),
    onShowMore: showMore,
    resetOn: [query],
  })
  useEffect(() => {
    clearSelectedRef.current = clearSelection
  }, [clearSelection])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
        <div className="px-6 pt-8 pb-2">
          <h1 className={PAGE_TITLE_CLASS}>{t('search.title')}</h1>
          <p className={`mt-1 ${META_TEXT}`}>{t('search.countLine', { query, count: results.length })}</p>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-1">
          {results.length === 0 && records.length === 0 ? (
            <EmptyState icon={<SearchIcon strokeWidth={1} />} title={t('search.empty')} />
          ) : results.length === 0 ? (
            <p className={`px-1 py-2 ${META_TEXT}`}>{t('search.noTodos')}</p>
          ) : (
            <>
              <div {...listboxProps} aria-label={t('search.title')} className="space-y-1 outline-none">
                {shown.map((r) => (
                  <TaskItem key={r.id} task={r} onRowClick={makeRowClick(r.id)} selection={makeSelection(r.id)} />
                ))}
              </div>
              {showMore && <ShowMoreButton onClick={showMore} remaining={remaining} />}
            </>
          )}
          {records.length > 0 && <RecordMatches key={query} records={records} />}
        </div>
      </div>
    </div>
  )
}

/**
 * 当たった記録。始めは件数と「記録を見る」だけ（To-Do を探しているときに毎日の記録で埋めない）。
 * 開くと新しい順に題名・日付・時刻の 1 行で並べ、押すと詳細を開く
 */
function RecordMatches({ records }: { records: Task[] }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const [open, setOpen] = useState(false)
  const { limit, remaining, showMore } = useShowMore(records.length, '')
  return (
    <section aria-label={t('search.records')} className="pt-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <SectionLabel as="h2">{t('search.recordsCount', { count: records.length })}</SectionLabel>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {open ? t('search.hideRecords') : t('search.showRecords')}
        </button>
      </div>
      {open && (
        <>
          <ul className="mt-1 space-y-0.5">
            {records.slice(0, limit).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => openTaskDetail(r.id)}
                  className={`flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left ${MENU_ROW_HOVER}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{r.title || ' '}</span>
                  <span className={`flex-shrink-0 tabular-nums ${META_TEXT}`}>
                    {[
                      r.dueDate ? df.shortDateWeekday(r.dueDate) : null,
                      r.startTime && r.endTime ? `${r.startTime}${t('common.timeRangeSeparator')}${r.endTime}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {showMore && <ShowMoreButton onClick={showMore} remaining={remaining} />}
        </>
      )}
    </section>
  )
}
