import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { isArchivedTask, isDeletedTask } from '../lib/taskLifecycle'
import { isListedTimeLog } from '../lib/timeLogTask'
import { displayListName } from '../lib/displayListName'
import type { Task } from '../types/task'

type BinMode = 'archived' | 'deleted'

const RESTORE_ICON =
  'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3'
const DELETE_ICON =
  'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'
const ARCHIVE_BOX_ICON =
  'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
const TRASH_BOX_ICON =
  'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'

export function TaskBinView({ mode }: { mode: BinMode }) {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const restoreDeletedTask = useTaskStore((s) => s.restoreDeletedTask)
  const permanentlyDeleteTask = useTaskStore((s) => s.permanentlyDeleteTask)
  const emptyDeleted = useTaskStore((s) => s.emptyDeleted)
  const unarchiveTask = useTaskStore((s) => s.unarchiveTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)

  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const flagged = mode === 'deleted' ? isDeletedTask : isArchivedTask

  const rows = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const isRootOfBin = (t: Task): boolean => {
      if (!flagged(t)) return false
      if (!t.parentId) return true
      const parent = byId.get(t.parentId)
      // 親も同じ箱にあるなら、その親を代表として表示（子は隠す）
      return !(parent && flagged(parent))
    }
    const stamp = (t: Task): string => (mode === 'deleted' ? t.deletedAt : t.archivedAt) ?? t.updatedAt
    return tasks
      .filter(isRootOfBin)
      .map((t) => ({
        task: t,
        stamp: stamp(t),
        childCount: tasks.filter((c) => c.parentId === t.id).length,
      }))
      .sort((a, b) => b.stamp.localeCompare(a.stamp))
  }, [tasks, flagged, mode])

  const title = mode === 'deleted' ? t('sidebar.views.deleted') : t('sidebar.views.archived')
  const boxIcon = mode === 'deleted' ? TRASH_BOX_ICON : ARCHIVE_BOX_ICON

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-end justify-between px-6 pt-8 pb-2">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {t('taskBin.count', { count: rows.length })}
          </p>
        </div>
        {mode === 'deleted' && rows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('taskBin.emptyConfirm'))) emptyDeleted()
            }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {t('taskBin.emptyTrash')}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1 px-4 pb-6">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="mx-auto mb-4 h-16 w-16 text-zinc-200 dark:text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d={boxIcon} />
            </svg>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              {mode === 'deleted' ? t('taskBin.emptyDeleted') : t('taskBin.emptyArchived')}
            </p>
          </div>
        ) : (
          rows.map(({ task, stamp, childCount }) => {
            const list = lists.find((l) => l.id === task.listId)
            const notePreview = task.description.split('\n').find((line) => line.trim())?.trim() ?? ''
            const timeLog = isListedTimeLog(task)
            let stampLabel = ''
            try {
              stampLabel = format(parseISO(stamp), i18n.resolvedLanguage?.startsWith('ja') ? 'M月d日 HH:mm' : 'MMM d, HH:mm', { locale: dateLocale })
            } catch {
              stampLabel = ''
            }
            return (
              <div
                key={task.id}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${task.completed && !timeLog ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                    {task.title || '\u00A0'}
                  </p>
                  {notePreview && (
                    <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">{notePreview}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                    {list && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: list.color }} />
                        {displayListName(list.id, list.name)}
                      </span>
                    )}
                    {childCount > 0 && <span>{t('taskBin.subtaskCount', { count: childCount })}</span>}
                    {stampLabel && <span>{stampLabel}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => (mode === 'deleted' ? restoreDeletedTask(task.id) : unarchiveTask(task.id))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    title={mode === 'deleted' ? t('taskBin.restore') : t('taskBin.unarchive')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={RESTORE_ICON} />
                    </svg>
                    <span className="hidden sm:inline">
                      {mode === 'deleted' ? t('taskBin.restore') : t('taskBin.unarchive')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === 'deleted') {
                        if (window.confirm(t('taskBin.permanentConfirm'))) permanentlyDeleteTask(task.id)
                      } else {
                        deleteTask(task.id)
                      }
                    }}
                    className="inline-flex items-center rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    title={mode === 'deleted' ? t('taskBin.deleteForever') : t('common.delete')}
                    aria-label={mode === 'deleted' ? t('taskBin.deleteForever') : t('common.delete')}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={DELETE_ICON} />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
