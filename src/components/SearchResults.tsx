import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { TaskItem } from './TaskItem'
import { SearchIcon } from './icons'
import { EmptyState } from './ui/EmptyState'
import { openTaskDetail } from '../lib/overlays'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'

export function SearchResults() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const query = useTaskStore((s) => s.searchQuery)
  const openDetail = openTaskDetail

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return tasks.filter(
      (t) =>
        t.parentId === null &&
        isActiveTask(t) &&
        (t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))),
    )
  }, [tasks, query])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row">
      <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
        <div className="px-6 pt-8 pb-2">
          <h1 className={PAGE_TITLE_CLASS}>
            {t('search.title')}
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {t('search.countLine', { query, count: results.length })}
          </p>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-1">
          {results.length === 0 ? (
            <EmptyState icon={<SearchIcon strokeWidth={1} />} title={t('search.empty')} />
          ) : (
            results.map((t) => (
              <TaskItem key={t.id} task={t} onRowClick={() => openDetail(t.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
