import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isActiveTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { useTaskDetailModal } from '../hooks/useTaskDetailModal'
import { ListKindPicker } from './ListKindPicker'
import { TaskDetail } from './TaskDetail'
import type { TaskList } from '../types/list'
import type { Task } from '../types/task'

/**
 * チェックリスト（買い物・持ち物）用の画面。店の中で片手で使う前提で、
 * 大きいチェックだけ。日付・優先度・並べ替えは出さない。チェック済みは下にまとめ、
 * 「チェック済みを消す」「全部戻す」（持ち物リストの使い回し）ができる。
 */
export function ChecklistView({ list }: { list: TaskList }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)
  const uncheckTasks = useTaskStore((s) => s.uncheckTasks)
  const { detailTask, openDetail, closeDetail } = useTaskDetailModal(tasks)
  const [draft, setDraft] = useState('')

  const { open, checked } = useMemo(() => {
    const items = tasks.filter((x) => x.listId === list.id && x.parentId === null && isActiveTask(x) && !x.isTimeLog)
    const byOrder = (a: Task, b: Task) => a.order - b.order
    return {
      open: items.filter((x) => !x.completed).sort(byOrder),
      // チェックした順に下へ積む
      checked: items.filter((x) => x.completed).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')),
    }
  }, [tasks, list.id])

  const submit = () => {
    const title = draft.trim()
    if (!title) return
    addTask(title, list.id)
    setDraft('')
  }

  const row = (item: Task) => (
    <li key={item.id} className="group/row flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
      {/* 今日の To-Do の行と同じ大きさ。チェックリストなので四角（押せる範囲は周りに広げて 40px） */}
      <button
        type="button"
        onClick={() => toggleTask(item.id)}
        aria-label={item.completed ? t('taskItem.markIncomplete') : t('taskItem.markComplete')}
        className="group/check -m-2.5 shrink-0 p-2.5 touch-manipulation"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] transition-colors ${
            item.completed
              ? 'border-accent-500 bg-accent-500 text-on-accent'
              : 'border-zinc-300 group-hover/check:border-accent-500 dark:border-zinc-600'
          }`}
        >
          {item.completed && (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggleTask(item.id)}
        className={`min-w-0 flex-1 truncate py-2.5 text-left text-[15px] touch-manipulation ${
          item.completed ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'
        }`}
      >
        {item.title}
      </button>
      <button
        type="button"
        onClick={() => openDetail(item.id)}
        aria-label={t('checklist.details')}
        className="shrink-0 rounded-md p-2 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
    </li>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="w-full px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{displayListName(list.id, list.name)}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {open.length > 0 ? t('checklist.remaining', { count: open.length }) : t('checklist.allChecked')}
            </p>
          </div>
          <ListKindPicker list={list} />
        </header>

        <div className="flex items-center gap-3 rounded-lg px-3 focus-within:bg-zinc-50 dark:focus-within:bg-zinc-800/60">
          <svg className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t('checklist.addPlaceholder')}
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
        </div>

        <ul className="mt-2">{open.map(row)}</ul>

        {checked.length > 0 && (
          <section className="mt-8">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{t('checklist.checkedHeading', { count: checked.length })}</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => uncheckTasks(checked.map((x) => x.id))}
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {t('checklist.uncheckAll')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTasks(checked.map((x) => x.id))}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
                >
                  {t('checklist.clearChecked')}
                </button>
              </div>
            </div>
            <ul className="opacity-80">{checked.map(row)}</ul>
          </section>
        )}
      </div>
      {detailTask && <TaskDetail task={detailTask} onClose={closeDetail} />}
    </div>
  )
}
