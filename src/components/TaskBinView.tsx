import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isArchivedTask, isDeletedTask } from '../lib/taskLifecycle'
import { isListedTimeLog } from '../lib/timeLogTask'
import { displayListName } from '../lib/displayListName'
import type { Task } from '../types/task'
import { ICON_PATHS } from '../lib/iconPaths'
import { buttonClass } from './ui/buttonClass'
import { PathIcon } from './PathIcon'
import { askConfirm } from '../lib/confirmDialog'
import { tip } from '../lib/tooltip'
import { EmptyState } from './ui/EmptyState'
import { useDateFormat } from '../hooks/useDateFormat'

type BinMode = 'archived' | 'deleted'

const RESTORE_ICON =
  'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3'
const DELETE_ICON =
  ICON_PATHS.trash
const ARCHIVE_BOX_ICON =
  'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
const TRASH_BOX_ICON =
  ICON_PATHS.trash

export function TaskBinView({ mode }: { mode: BinMode }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const restoreDeletedTask = useTaskStore((s) => s.restoreDeletedTask)
  const permanentlyDeleteTask = useTaskStore((s) => s.permanentlyDeleteTask)
  const emptyDeleted = useTaskStore((s) => s.emptyDeleted)
  const unarchiveTask = useTaskStore((s) => s.unarchiveTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)

  const df = useDateFormat()
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
            onClick={async () => {
              if (await askConfirm({ message: t('taskBin.emptyConfirm'), confirmLabel: t('taskBin.emptyTrash'), danger: true })) emptyDeleted()
            }}
            className={buttonClass({ variant: 'danger', size: 'sm' })}
          >
            {t('taskBin.emptyTrash')}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1 px-4 pb-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<PathIcon d={boxIcon} strokeWidth={1} />}
            title={mode === 'deleted' ? t('taskBin.emptyDeleted') : t('taskBin.emptyArchived')}
          />
        ) : (
          rows.map(({ task, stamp, childCount }) => {
            const list = lists.find((l) => l.id === task.listId)
            const notePreview = task.description.split('\n').find((line) => line.trim())?.trim() ?? ''
            const timeLog = isListedTimeLog(task)
            let stampLabel = ''
            try {
              stampLabel = df.monthDayTime(parseISO(stamp))
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
                    {...tip(mode === 'deleted' ? t('taskBin.restore') : t('taskBin.unarchive'))}
                  >
                    <PathIcon d={RESTORE_ICON} className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {mode === 'deleted' ? t('taskBin.restore') : t('taskBin.unarchive')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (mode === 'deleted') {
                        if (await askConfirm({ message: t('taskBin.permanentConfirm'), confirmLabel: t('taskBin.deleteForever'), danger: true })) {
                          permanentlyDeleteTask(task.id)
                        }
                      } else {
                        deleteTask(task.id)
                      }
                    }}
                    className="inline-flex items-center rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    {...tip(mode === 'deleted' ? t('taskBin.deleteForever') : t('common.delete'))}
                    aria-label={mode === 'deleted' ? t('taskBin.deleteForever') : t('common.delete')}
                  >
                    <PathIcon d={DELETE_ICON} className="h-4 w-4" />
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
