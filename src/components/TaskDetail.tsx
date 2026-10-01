import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore, paletteColors } from '../store/taskStore'
import type { Task, Priority, Recurrence } from '../types/task'
import { TaskItem } from './TaskItem'
import { TimeInput } from './TimeInput'
import { addClockMinutes } from '../lib/clockTime'
import { DueDatePopover } from './DueDatePopover'
import { ColorLabelPicker } from './labels/ColorLabelPicker'
import { formatDuration } from '../lib/timeGrid'
import { durationMinutesForTaskSlot, isOvernightTimeLog } from '../lib/taskTimeRange'
import { displayListName } from '../lib/displayListName'
import { linkifySegments, googleMapsUrl } from '../lib/linkify'

const RECURRENCE_TYPES: (Recurrence['type'] | 'none')[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

const PRIORITY_OPTIONS: { value: Priority; color: string }[] = [
  { value: 'none', color: 'text-zinc-400' },
  { value: 'low', color: 'text-blue-500' },
  { value: 'medium', color: 'text-amber-500' },
  { value: 'high', color: 'text-red-500' },
]

/** 詳細は常に右からのオーバーレイシート（行のタップで開き、外側タップ / ✕ で閉じる） */
export function TaskDetail({
  task,
  onClose,
}: {
  task: Task
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const dueDateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const isLog = task.isTimeLog === true
  const updateTask = useTaskStore((s) => s.updateTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const addTask = useTaskStore((s) => s.addTask)
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  // いつか・チェックリストには締切や予定を付けない（付けると期限のビューに戻ってきてしまう）
  const listKind = lists.find((l) => l.id === task.listId)?.kind ?? 'tasks'
  const plannable = listKind === 'tasks'
  const moveTaskToList = useTaskStore((s) => s.moveTaskToList)
  const showMoveBanner = useTaskStore((s) => s.showMoveBanner)
  const listColorPaletteId = useTaskStore((s) => s.listColorPaletteId)
  const sections = useTaskStore((s) => s.sections)
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editingMemo, setEditingMemo] = useState(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    queueMicrotask(() => setTitleValue(task.title))
  }, [task.title])
  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])
  useEffect(() => {
    if (editingMemo) {
      const el = memoTextareaRef.current
      el?.focus()
      if (el) el.selectionStart = el.selectionEnd = el.value.length
    }
  }, [editingMemo])

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

  // ゴミ箱行き + ⌘Z で戻せるので、一覧の削除と同じく確認は出さない
  const handleDeleteTask = () => {
    deleteTask(task.id)
    onClose()
  }

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
            {editingMemo ? (
              <textarea
                ref={memoTextareaRef}
                value={task.description}
                onChange={(e) => updateTask(task.id, { description: e.target.value })}
                onBlur={() => setEditingMemo(false)}
                placeholder={isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
                rows={isLog ? 4 : 2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400
                           resize-none min-h-[4rem]"
              />
            ) : task.description.trim() ? (
              <div
                onClick={() => setEditingMemo(true)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 min-h-[4rem]
                           whitespace-pre-wrap break-words cursor-text
                           hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              >
                {linkifySegments(task.description).map((seg, i) =>
                  seg.type === 'url' ? (
                    <a
                      key={i}
                      href={seg.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-accent-600 dark:text-accent-400 hover:underline break-all"
                    >
                      {seg.value}
                    </a>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  ),
                )}
              </div>
            ) : (
              <div
                onClick={() => setEditingMemo(true)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-400 min-h-[4rem] cursor-text
                           hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              >
                {isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.location')}</label>
            <div className="flex items-center gap-2">
              <input
                value={task.location ?? ''}
                onChange={(e) => updateTask(task.id, { location: e.target.value || null })}
                placeholder={t('taskDetail.locationPlaceholder')}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
              />
              {task.location?.trim() && (
                <a
                  href={googleMapsUrl(task.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('taskDetail.openInMaps')}
                  aria-label={t('taskDetail.openInMaps')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700
                             text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10
                             transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <span className="hidden sm:inline">{t('taskDetail.openInMaps')}</span>
                </a>
              )}
            </div>
          </div>

          {!isLog && plannable && (
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
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.deadline')}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <DueDatePopover
                    value={task.dueDate ?? null}
                    onChange={(v) => updateTask(task.id, { dueDate: v })}
                    align="left"
                    wrapperClassName="relative inline-block"
                    trigger={({ open, toggle }) => (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-haspopup="dialog"
                        onClick={toggle}
                        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                          bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                          ${open ? 'border-accent-500 ring-2 ring-accent-500/40' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}
                      >
                        <svg className={`w-4 h-4 ${task.dueDate ? 'text-accent-500' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        <span className={task.dueDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                          {task.dueDate
                            ? format(parseISO(`${task.dueDate}T12:00:00`), 'PPP', { locale: dueDateLocale })
                            : t('dueDatePicker.noDate')}
                        </span>
                      </button>
                    )}
                  />
                  {task.dueDate && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('taskDetail.deadlineTime')}</span>
                      <TimeInput
                        value={task.dueTime ?? ''}
                        onChange={(v) => updateTask(task.id, { dueTime: v || null })}
                        className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                   bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                   focus:ring-2 focus:ring-accent-500/40"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('taskDetail.scheduled')}</label>
                <DueDatePopover
                  value={task.scheduledDate ?? null}
                  onChange={(v) => updateTask(task.id, { scheduledDate: v })}
                  kind="scheduled"
                  align="left"
                  wrapperClassName="relative inline-block"
                  trigger={({ open, toggle }) => (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-haspopup="dialog"
                      onClick={toggle}
                      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                        bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                        ${open ? 'border-accent-500 ring-2 ring-accent-500/40' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}
                    >
                      <svg className={`w-4 h-4 ${task.scheduledDate ? 'text-accent-500' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className={task.scheduledDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                        {task.scheduledDate
                          ? format(parseISO(`${task.scheduledDate}T12:00:00`), 'PPP', { locale: dueDateLocale })
                          : t('taskDetail.scheduledNone')}
                      </span>
                    </button>
                  )}
                />
                {task.scheduledDate && (
                  <div className="mt-2 flex items-center gap-2">
                    <TimeInput
                      value={task.startTime ?? ''}
                      onChange={(v) => updateTask(task.id, { startTime: v || null })}
                      className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                    <span className="text-zinc-400 text-sm">〜</span>
                    <TimeInput
                      value={task.endTime ?? ''}
                      onChange={(v) => updateTask(task.id, { endTime: v || null })}
                      pickerDefault={task.startTime ? addClockMinutes(task.startTime, 60) : undefined}
                      className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                  </div>
                )}
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
                      pickerDefault={task.startTime ? addClockMinutes(task.startTime, 60) : undefined}
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

          {isLog ? (
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-2">{t('labels.title')}</label>
              <ColorLabelPicker task={task} />
            </div>
          ) : (
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
          )}

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

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={isLog ? handleDeleteLog : handleDeleteTask}
              className="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-500/40
                         text-sm font-medium text-red-600 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              {t(isLog ? 'taskDetail.deleteLog' : 'taskDetail.deleteTask')}
            </button>
          </div>
        </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 dark:shadow-[-8px_0_24px_rgba(0,0,0,0.5)]
                   h-full overflow-y-auto shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {detailBody}
      </div>
    </div>
  )
}
