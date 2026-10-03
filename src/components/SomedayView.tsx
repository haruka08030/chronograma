import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { ListKindPicker } from './ListKindPicker'
import { TaskDetail } from './TaskDetail'
import type { TaskList } from '../types/list'
import type { Task } from '../types/task'
import { appTodayKey } from '../lib/timeZone'
import { isSubmitEnter } from '../lib/keyboard'

/**
 * いつか（Wish）用の画面。期限も優先度も出さず、1 行ずつ静かに並べる。
 * 行頭の ☆ で「かなえた」（下の★一覧へ）、右の「今日やる」で今日の計画へ移す。
 */
export function SomedayView({ list }: { list: TaskList }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const promoteToPlanned = useTaskStore((s) => s.promoteToPlanned)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [draft, setDraft] = useState('')

  const { wishes, fulfilled } = useMemo(() => {
    const items = tasks.filter((x) => x.listId === list.id && x.parentId === null && isActiveTask(x) && !x.isTimeLog)
    return {
      wishes: items.filter((x) => !x.completed).sort((a, b) => a.order - b.order),
      fulfilled: items
        .filter((x) => x.completed)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    }
  }, [tasks, list.id])

  const submit = () => {
    const title = draft.trim()
    if (!title) return
    addTask(title, list.id)
    setDraft('')
  }

  const doToday = (item: Task) => {
    promoteToPlanned(item.id, appTodayKey())
    showMoveBanner(t('someday.movedToToday', { title: item.title }))
  }

  const notePreview = (item: Task) => item.description.split('\n').find((l) => l.trim())?.trim() ?? ''

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="w-full px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <header className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{displayListName(list.id, list.name)}</h1>
          </div>
          <ListKindPicker list={list} />
        </header>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-4 dark:border-zinc-700">
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>☆</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('someday.addPlaceholder')}
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
        </div>

        {wishes.length === 0 ? (
          <p className="mt-6 text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">{t('someday.empty')}</p>
        ) : (
          <ul className="mt-3">
            {wishes.map((item) => {
              const note = notePreview(item)
              return (
                <li
                  key={item.id}
                  className="group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(item.id)}
                    title={t('someday.fulfill')}
                    aria-label={t('someday.fulfillItem', { title: item.title })}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg text-zinc-300 transition-colors hover:text-amber-500 dark:text-zinc-600 dark:hover:text-amber-400"
                  >
                    <span aria-hidden>☆</span>
                  </button>
                  <button type="button" onClick={() => openDetail(item.id)} className="min-w-0 flex-1 py-2.5 text-left">
                    <span className="block truncate text-[15px] text-zinc-800 dark:text-zinc-100">{item.title}</span>
                    {note && <span className="mt-0.5 block truncate text-xs text-zinc-400 dark:text-zinc-500">{note}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => doToday(item)}
                    className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-accent-50 hover:text-accent-600
                               md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100
                               dark:text-zinc-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-400"
                  >
                    {t('someday.doToday')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {fulfilled.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">{t('someday.fulfilledHeading', { count: fulfilled.length })}</h2>
            <ul>
              {fulfilled.map((item) => (
                <li key={item.id} className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => toggleTask(item.id)}
                    title={t('someday.unfulfill')}
                    aria-label={t('someday.unfulfillItem', { title: item.title })}
                    className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-amber-500 transition-colors hover:text-zinc-300 dark:text-amber-400 dark:hover:text-zinc-600"
                  >
                    <span aria-hidden>★</span>
                  </button>
                  <button type="button" onClick={() => openDetail(item.id)} className="min-w-0 truncate text-left">
                    {item.title}
                  </button>
                  {item.completedAt && (
                    <span className="ml-1 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                      {format(new Date(item.completedAt), 'yyyy/M/d')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
