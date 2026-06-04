import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { Task, Priority, Recurrence } from '../types/task'
import { TaskItem } from './TaskItem'
import { TimeInput } from './TimeInput'
import { formatDuration } from '../lib/timeGrid'
import { durationMinutesForTaskSlot, isOvernightTimeLog } from '../lib/taskTimeRange'
import { displayListName } from '../lib/displayListName'

const RECURRENCE_TYPES: (Recurrence['type'] | 'none')[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

const PRIORITY_OPTIONS: { value: Priority; color: string }[] = [
  { value: 'none', color: 'text-zinc-400' },
  { value: 'low', color: 'text-blue-500' },
  { value: 'medium', color: 'text-amber-500' },
  { value: 'high', color: 'text-red-500' },
]

export function TaskDetail({
  task,
  onClose,
  layout = 'split',
}: {
  task: Task
  onClose: () => void
  /** `split`: 右ペインとしてメイン列と並べる。`modal`: 従来の全画面オーバーレイ */
  layout?: 'modal' | 'split'
}) {
  const { t } = useTranslation()
  const isLog = task.isTimeLog === true
  const updateTask = useTaskStore((s) => s.updateTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const addTask = useTaskStore((s) => s.addTask)
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const moveTaskToList = useTaskStore((s) => s.moveTaskToList)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const sections = useTaskStore((s) => s.sections)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    queueMicrotask(() => setTitleValue(task.title))
  }, [task.title])
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const commitTitle = () => {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed })
    }
    setEditingTitle(false)
    setTitleValue(trimmed || task.title)
  }

  const subtasks = useMemo(
    () =>
      isLog
        ? []
        : tasks
            .filter((t) => t.parentId === task.id)
            .sort((a, b) => a.order - b.order),
    [isLog, tasks, task.id],
  )

  const sectionsForTaskList = useMemo(
    () =>
      isLog ? [] : sections.filter((s) => s.listId === task.listId).sort((a, b) => a.order - b.order),
    [isLog, sections, task.listId],
  )

  const logDurationLabel = useMemo(() => {
    if (!isLog || !task.startTime || !task.endTime) return null
    const mins = durationMinutesForTaskSlot(task)
    if (mins == null || mins <= 0) return null
    return formatDuration(mins)
  }, [isLog, task])

  const addSubtask = () => {
    const trimmed = subInput.trim()
    if (!trimmed) return
    addTask(trimmed, task.listId, task.id)
    setSubInput('')
  }

  const addTag = () => {
    const trimmed = tagInput.trim()
    if (!trimmed || task.tags.includes(trimmed)) return
    updateTask(task.id, { tags: [...task.tags, trimmed] })
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) })
  }

  const handleDeleteLog = () => {
    if (!confirm(t('confirm.deleteTimeLog'))) return
    deleteTask(task.id)
    onClose()
  }

  const showTaskTime = !isLog && task.dueDate

  const detailBody = (
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle()
                    if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false) }
                  }}
                  className="w-full text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-transparent outline-none
                             border-b-2 border-accent-400 pb-0.5 break-words"
                />
              ) : (
                <h2
                  onClick={() => setEditingTitle(true)}
                  tabIndex={0}
                  role="button"
                  aria-label={t('taskDetail.titleEditAria')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setEditingTitle(true)
                    }
                  }}
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 break-words cursor-text
                             hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-md px-1 -mx-1 transition-colors"
                >
                  {task.title}
                </h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div>
            <textarea
              value={task.description}
              onChange={(e) => updateTask(task.id, { description: e.target.value })}
              placeholder={isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
              rows={isLog ? 4 : 2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                         bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                         focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400
                         resize-none min-h-[4rem]"
            />
          </div>

          {!isLog && (
            <>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.priority')}</label>
                <div className="flex gap-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateTask(task.id, { priority: opt.value })}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all
                    ${task.priority === opt.value
                      ? 'border-accent-400 bg-accent-50 dark:bg-accent-500/10 font-medium'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}
                    ${opt.color}`}
                    >
                      {t(`common.${opt.value}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.dueDate')}</label>
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                         bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                         focus:ring-2 focus:ring-accent-500/40"
                />
              </div>
            </>
          )}

          {isLog && (
            <div className="space-y-3">
              <div
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30
                           p-3 space-y-2"
              >
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('common.start')}</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t('taskDetail.logDate')}
                    </label>
                    <input
                      type="date"
                      value={task.dueDate ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) updateTask(task.id, { dueDate: v })
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                               bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none
                               focus:ring-2 focus:ring-accent-500/40"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t('taskDetail.time')}
                    </label>
                    <TimeInput
                      value={task.startTime ?? ''}
                      onChange={(v) => updateTask(task.id, { startTime: v || null })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                  </div>
                </div>
              </div>

              <div
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30
                           p-3 space-y-2"
              >
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('common.end')}</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t('taskDetail.logEndDate')}
                    </label>
                    <input
                      type="date"
                      value={task.dueDate ? (task.endDate ?? task.dueDate) : ''}
                      min={task.dueDate ?? undefined}
                      disabled={!task.dueDate}
                      onChange={(e) => {
                        const v = e.target.value
                        if (!v || !task.dueDate) return
                        updateTask(task.id, { endDate: v !== task.dueDate ? v : null })
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                               bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none
                               focus:ring-2 focus:ring-accent-500/40
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t('taskDetail.time')}
                    </label>
                    <TimeInput
                      value={task.endTime ?? ''}
                      onChange={(v) => updateTask(task.id, { endTime: v || null })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                  </div>
                </div>
              </div>

              {logDurationLabel && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('taskDetail.logDuration', { label: logDurationLabel })}
                </p>
              )}
              {isOvernightTimeLog(task) && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('activityLog.overnightHint')}</p>
              )}
            </div>
          )}

          {showTaskTime && (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.time')}</label>
              <div className="flex items-center gap-2">
                <TimeInput
                  value={task.startTime ?? ''}
                  onChange={(v) => updateTask(task.id, { startTime: v || null })}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                />
                <span className="text-zinc-400 text-sm">〜</span>
                <TimeInput
                  value={task.endTime ?? ''}
                  onChange={(v) => updateTask(task.id, { endTime: v || null })}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                />
              </div>
            </div>
          )}

          {!isLog && task.dueDate && (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.recurrence')}</label>
              <div className="flex items-center gap-2">
                <select
                  value={task.recurrence?.type ?? 'none'}
                  onChange={(e) => {
                    const val = e.target.value as Recurrence['type'] | 'none'
                    if (val === 'none') {
                      updateTask(task.id, { recurrence: null })
                    } else {
                      updateTask(task.id, {
                        recurrence: { type: val, interval: task.recurrence?.interval ?? 1 },
                      })
                    }
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                >
                  {RECURRENCE_TYPES.map((r) => (
                    <option key={r} value={r}>{t(`taskDetail.recurrenceIntervals.${r}`)}</option>
                  ))}
                </select>
                {task.recurrence && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={task.recurrence.interval}
                      onChange={(e) => {
                        const interval = Math.max(1, parseInt(e.target.value) || 1)
                        updateTask(task.id, {
                          recurrence: { ...task.recurrence!, type: task.recurrence!.type, interval },
                        })
                      }}
                      className="w-16 px-2 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40 text-center"
                    />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t(`taskDetail.recurrenceTypes.${task.recurrence.type}`)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.tags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md
                             bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTag() }}
                placeholder={t('taskDetail.tagPlaceholder')}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800
                           hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('common.add')}
              </button>
            </div>
          </div>

          {!isLog && (
            <>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.list')}</label>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lists.find((l) => l.id === task.listId)?.color ?? paletteColors(listColorPaletteId)[0] }}
                  />
                  <select
                    value={task.listId}
                    onChange={(e) => {
                      const next = e.target.value
                      const r = moveTaskToList(task.id, next)
                      if (r.moved && r.listName) {
                        showMoveBanner(
                          t('toast.taskMovedToList', {
                            name: displayListName(r.listId ?? next, r.listName),
                          }),
                        )
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40"
                  >
                    {lists
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((l) => (
                        <option key={l.id} value={l.id}>{displayListName(l.id, l.name)}</option>
                      ))}
                  </select>
                </div>
                {!task.parentId && sectionsForTaskList.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.section')}</label>
                    <select
                      value={task.sectionId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateTask(task.id, { sectionId: v === '' ? null : v })
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                             bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                             focus:ring-2 focus:ring-accent-500/40"
                    >
                      <option value="">{t('taskDetail.sectionNone')}</option>
                      {sectionsForTaskList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">
                  {t('taskDetail.subtasks', { count: subtasks.length })}
                </label>
                <div className="space-y-1">
                  {subtasks.map((st) => (
                    <TaskItem key={st.id} task={st} />
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={subInput}
                    onChange={(e) => setSubInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addSubtask() }}
                    placeholder={t('taskDetail.subtaskPlaceholder')}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
                  />
                  <button
                    type="button"
                    onClick={addSubtask}
                    disabled={!subInput.trim()}
                    className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800
                           hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('common.add')}
                  </button>
                </div>
              </div>
            </>
          )}

          {isLog && (
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleDeleteLog}
                className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-500/40
                           text-sm font-medium text-red-600 dark:text-red-400
                           hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                {t('taskDetail.deleteLog')}
              </button>
            </div>
          )}
        </div>
  )

  if (layout === 'split') {
    return (
      <aside className="flex h-full min-h-0 w-full max-w-md shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-h-0 flex-1 overflow-y-auto">{detailBody}</div>
      </aside>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800
                   h-full overflow-y-auto shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {detailBody}
      </div>
    </div>
  )
}
