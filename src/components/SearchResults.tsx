import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { TaskItem } from './TaskItem'
import { TaskDetail } from './TaskDetail'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'

export function SearchResults() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const query = useTaskStore((s) => s.searchQuery)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)

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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="px-6 pt-8 pb-2">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {t('search.title')}
          </h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {t('search.countLine', { query, count: results.length })}
          </p>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-1">
          {results.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('search.empty')}</p>
            </div>
          ) : (
            results.map((t) => (
              <TaskItem key={t.id} task={t} onRowClick={() => openDetail(t.id)} />
            ))
          )}
        </div>
      </div>

      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
