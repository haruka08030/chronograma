import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { searchTasks } from '../lib/searchTasks'
import { TaskItem } from './TaskItem'
import { SearchIcon } from './icons'
import { EmptyState } from './ui/EmptyState'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'

export function SearchResults() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const query = useTaskStore((s) => s.searchQuery)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const bulk = useBulkTaskActions()

  const results = useMemo(() => searchTasks(tasks, query), [tasks, query])
  const resultIds = useMemo(() => results.map((r) => r.id), [results])

  // 選択とキー操作は To-Do 一覧と同じ（検索欄の ↓ で最初の結果に枠が移る）
  const clearSelectedRef = useRef<() => void>(() => {})
  const { clearSelection, makeRowClick, makeSelection, listboxProps } = useTaskListSelection({
    rowIds: resultIds,
    openDetail: openTaskDetail,
    toggleRow: toggleTask,
    removeRows: deleteTasks,
    completeRows: bulk.complete,
    openMenu: (m) => openTaskMenu({ kind: 'task', ...m, onDone: () => clearSelectedRef.current() }),
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
          {results.length === 0 ? (
            <EmptyState icon={<SearchIcon strokeWidth={1} />} title={t('search.empty')} />
          ) : (
            <div {...listboxProps} aria-label={t('search.title')} className="space-y-1 outline-none">
              {results.map((r) => (
                <TaskItem key={r.id} task={r} onRowClick={makeRowClick(r.id)} selection={makeSelection(r.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
