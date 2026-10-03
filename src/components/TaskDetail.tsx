import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { appTimeZone } from '../lib/timeZone'
import { convertTaskTimes, foreignTimeZone, timesPatchFromZone } from '../lib/taskTimeZone'
import { TaskTimeZoneButton, TaskTimeZoneNote } from './TaskTimeZoneField'
import { TaskRemindersField } from './TaskRemindersField'
import { useEscapeLayer } from '../hooks/useHotkey'
import { CalendarIcon, ClockIcon, CloseIcon, MapPinIcon, RepeatIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { DateField } from './DateField'
import { useTextAreaEntry, useTextEntry } from '../hooks/useTextEntry'
import { tip } from '../lib/tooltip'
import { PRIORITY_TEXT_CLASS } from '../lib/priorityColor'
import { InlineAddInput } from './ui/InlineAddInput'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { useDateFormat } from '../hooks/useDateFormat'
import { SectionLabel } from './ui/SectionLabel'
import { sectionLabelClass } from './ui/sectionLabelClass'

const RECURRENCE_TYPES: (Recurrence['type'] | 'none')[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

const PRIORITY_OPTIONS: Priority[] = ['none', 'low', 'medium', 'high']

/** 詳細は常に右からのオーバーレイシート（行のタップで開き、外側タップ / ✕ で閉じる） */
export function TaskDetail({
  task,
  onClose,
}: {
  task: Task
  onClose: () => void
}) {
  const { t } = useTranslation()
  // Esc で閉じる（上に日付ピッカーなどが開いていればそちらが先）
  useEscapeLayer(onClose)
  const df = useDateFormat()
  const isLog = task.isTimeLog === true
  const updateTask = useTaskStore((s) => s.updateTask)
  const tagsEnabled = useTaskStore((s) => s.tagsEnabled)
  useTaskStore((s) => s.appTimeZone)
  // タイムゾーンを決めたタスクは、日付・時刻をそのタイムゾーンで見せて編集する（列はアプリのタイムゾーン）
  const zone = foreignTimeZone(task)
  const tv = zone ? convertTaskTimes(task, appTimeZone(), zone) : task
  // タイムゾーンは時刻の行の末尾に置く（予定の時刻があれば予定の行、なければ締切の行）
  const showTimeZone = !!(task.startTime || task.dueTime || zone)
  const tzOnScheduled = showTimeZone && !!tv.scheduledDate && (!!task.startTime || !task.dueTime)
  const tzOnDeadline = showTimeZone && !tzOnScheduled && !!tv.dueDate
  const tzLoose = showTimeZone && !tzOnScheduled && !tzOnDeadline
  const updateTimes = (patch: Partial<Pick<Task, 'dueDate' | 'dueTime' | 'scheduledDate' | 'startTime' | 'endTime' | 'endDate'>>) =>
    updateTask(task.id, zone ? timesPatchFromZone(tv, patch, zone) : patch)
  const deleteTask = useTaskStore((s) => s.deleteTask)
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

  const titleEntry = useTextEntry({
    onSubmit: commitTitle,
    onCancel: () => {
      setTitleValue(task.title)
      setEditingTitle(false)
    },
  })
  // 追加の欄の Esc は書きかけを消す（欄は出たまま）
  const tagEntry = useTextEntry({ onSubmit: () => addTag(), onCancel: () => setTagInput('') })
  // メモは打つたびに保存している。離れたら表示に戻すだけ
  const memoEntry = useTextAreaEntry({ onCommit: () => setEditingMemo(false) })

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
    // 「明日」「15時」「金曜まで」はクイック追加と同じに読む。リストは親と同じ（`@…` は題名に残す）
    addTaskFromQuickText(trimmed, { parentId: task.id })
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
                  {...titleEntry}
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
              aria-label={t('common.close')}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
            >
              <CloseIcon className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          <div>
            {editingMemo ? (
              <textarea
                ref={memoTextareaRef}
                value={task.description}
                onChange={(e) => updateTask(task.id, { description: e.target.value })}
                {...memoEntry}
                placeholder={isLog ? t('taskDetail.memoPlaceholderLog') : t('taskDetail.memoPlaceholderTask')}
                rows={isLog ? 4 : 2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400
                           resize-none min-h-[4rem]"
              />
            ) : task.description.trim() ? (
              <div
                onClick={() => {
                  // 文字を選んでコピーしたいときは編集に切り替えない
                  if (window.getSelection()?.toString()) return
                  setEditingMemo(true)
                }}
                className="select-text w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
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
            <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.location')}</label>
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
                  {...tip(t('taskDetail.openInMaps'))}
                  aria-label={t('taskDetail.openInMaps')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700
                             text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10
                             transition-colors flex-shrink-0"
                >
                  <MapPinIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('taskDetail.openInMaps')}</span>
                </a>
              )}
            </div>
          </div>

          {!isLog && plannable && (
            <>
              <div>
                <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.priority')}</label>
                <div className="flex gap-2">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateTask(task.id, { priority: p })}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all
                    ${task.priority === p
                      ? 'border-accent-400 bg-accent-50 dark:bg-accent-500/10 font-medium'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}
                    ${PRIORITY_TEXT_CLASS[p]}`}
                    >
                      {t(`common.${p}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.deadline')}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <DueDatePopover
                    value={tv.dueDate ?? null}
                    onChange={(v) => updateTimes({ dueDate: v })}
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
                        <CalendarIcon className={`w-4 h-4 ${tv.dueDate ? 'text-date-500' : 'text-zinc-400'}`} />
                        <span className={tv.dueDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                          {tv.dueDate
                            ? df.fullDate(tv.dueDate)
                            : t('dueDatePicker.noDate')}
                        </span>
                      </button>
                    )}
                  />
                  {tv.dueDate && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('taskDetail.deadlineTime')}</span>
                      <TimeInput
                        value={tv.dueTime ?? ''}
                        onChange={(v) => updateTimes({ dueTime: v || null })}
                        className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                   bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                   focus:ring-2 focus:ring-accent-500/40"
                      />
                    </div>
                  )}
                  {tzOnDeadline && <TaskTimeZoneButton task={task} view={tv} />}
                </div>
                {tzOnDeadline && <TaskTimeZoneNote task={task} />}
                {/* 繰り返し（締切のあるタスクだけ。完了すると次の締切で作り直す）。習慣とは別の「毎週の課題」など */}
                {task.dueDate && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <RepeatIcon className={`h-3.5 w-3.5 shrink-0 ${task.recurrence ? 'text-zinc-600 dark:text-zinc-300' : ''}`} />
                    <select
                      aria-label={t('taskDetail.recurrence')}
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
                      className={`rounded-md bg-transparent py-1 pl-1.5 text-xs [field-sizing:content] outline-none transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:ring-2 focus:ring-accent-500/40 ${
                        task.recurrence ? 'text-zinc-800 dark:text-zinc-100' : ''
                      }`}
                    >
                      {RECURRENCE_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {r === 'none' ? t('taskDetail.recurrenceNone') : t(`taskDetail.recurrenceIntervals.${r}`)}
                        </option>
                      ))}
                    </select>
                    {task.recurrence && (
                      <>
                        <input
                          type="number"
                          min={1}
                          aria-label={t('taskDetail.recurrenceEvery')}
                          value={task.recurrence.interval}
                          onChange={(e) => {
                            const interval = Math.max(1, parseInt(e.target.value) || 1)
                            updateTask(task.id, {
                              recurrence: { ...task.recurrence!, type: task.recurrence!.type, interval },
                            })
                          }}
                          className="w-12 rounded-md border border-zinc-200 px-1.5 py-1 text-center text-xs text-zinc-900 outline-none
                                     bg-transparent dark:border-zinc-700 dark:text-zinc-100 focus:ring-2 focus:ring-accent-500/40"
                        />
                        <span>{t(`taskDetail.recurrenceTypes.${task.recurrence.type}`)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.scheduled')}</label>
                <DueDatePopover
                  value={tv.scheduledDate ?? null}
                  onChange={(v) => updateTimes({ scheduledDate: v })}
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
                      <ClockIcon className={`w-4 h-4 ${tv.scheduledDate ? 'text-date-500' : 'text-zinc-400'}`} />
                      <span className={tv.scheduledDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                        {tv.scheduledDate
                          ? df.fullDate(tv.scheduledDate)
                          : t('taskDetail.scheduledNone')}
                      </span>
                    </button>
                  )}
                />
                {tv.scheduledDate && (
                  <div className="mt-2 flex items-center gap-2">
                    <TimeInput
                      value={tv.startTime ?? ''}
                      onChange={(v) => updateTimes({ startTime: v || null })}
                      className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                    <span className="text-zinc-400 text-sm">{t('common.timeRangeSeparator')}</span>
                    <TimeInput
                      value={tv.endTime ?? ''}
                      onChange={(v) => updateTimes({ endTime: v || null })}
                      pickerDefault={tv.startTime ? addClockMinutes(tv.startTime, 60) : undefined}
                      className="w-[7rem] px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                                 bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                                 focus:ring-2 focus:ring-accent-500/40"
                    />
                    {tzOnScheduled && <TaskTimeZoneButton task={task} view={tv} />}
                  </div>
                )}
                {tzOnScheduled && <TaskTimeZoneNote task={task} />}
              </div>
              {tzLoose && (
                <div>
                  <TaskTimeZoneButton task={task} view={tv} />
                  <TaskTimeZoneNote task={task} />
                </div>
              )}
              <TaskRemindersField task={task} />
            </>
          )}

          {isLog && (
            <div className="space-y-3">
              <div
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30
                           p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <SectionLabel as="p" level="field">{t('common.start')}</SectionLabel>
                  {(task.startTime || zone) && <TaskTimeZoneButton task={task} view={tv} compact />}
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                    <label className={sectionLabelClass('field')}>
                      {t('taskDetail.logDate')}
                    </label>
                    <DateField
                      value={tv.dueDate ?? null}
                      onChange={(v) => updateTimes({ dueDate: v })}
                      ariaLabel={t('taskDetail.logDate')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                    <label className={sectionLabelClass('field')}>
                      {t('taskDetail.time')}
                    </label>
                    <TimeInput
                      value={tv.startTime ?? ''}
                      onChange={(v) => updateTimes({ startTime: v || null })}
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
                <SectionLabel as="p" level="field">{t('common.end')}</SectionLabel>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
                    <label className={sectionLabelClass('field')}>
                      {t('taskDetail.logEndDate')}
                    </label>
                    <DateField
                      value={tv.dueDate ? (tv.endDate ?? tv.dueDate) : null}
                      min={tv.dueDate ?? undefined}
                      disabled={!tv.dueDate}
                      onChange={(v) => {
                        if (!tv.dueDate) return
                        updateTimes({ endDate: v !== tv.dueDate ? v : null })
                      }}
                      ariaLabel={t('taskDetail.logEndDate')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
                    <label className={sectionLabelClass('field')}>
                      {t('taskDetail.time')}
                    </label>
                    <TimeInput
                      value={tv.endTime ?? ''}
                      onChange={(v) => updateTimes({ endTime: v || null })}
                      pickerDefault={tv.startTime ? addClockMinutes(tv.startTime, 60) : undefined}
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
              <TaskTimeZoneNote task={task} />
            </div>
          )}

          {isLog ? (
            // 見出しは付けない（ボタンに色とラベル名が出るので重ねない）
            <ColorLabelPicker task={task} />
          ) : tagsEnabled && (
          <div>
            <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.tags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md
                             bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={t('taskDetail.removeTag', { tag })} className="hover:text-red-500 transition-colors">
                    <CloseIcon className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                // 確定せずに閉じても書いた分を捨てない（リスト・セクションの名前と同じ）
                {...tagEntry}
                placeholder={t('taskDetail.tagPlaceholder')}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700
                           bg-transparent text-zinc-900 dark:text-zinc-100 outline-none
                           focus:ring-2 focus:ring-accent-500/40 placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim()}
                className={buttonClass({ variant: 'secondary', size: 'sm' }, 'shrink-0')}
              >
                {t('common.add')}
              </button>
            </div>
          </div>
          )}

          {!isLog && (
            <>
              <div>
                <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.list')}</label>
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
                {/* 色＝ラベル（記録と同じ）。カレンダーの色と To‑Do の色ラベルに使う。既定はリストの色。
                    見出しは付けない（ボタンに色とラベル名が出るので重ねない） */}
                <div className="mt-3">
                  <ColorLabelPicker
                    task={task}
                    plan
                  />
                </div>
                {!task.parentId && sectionsForTaskList.length > 0 && (
                  <div className="mt-3">
                    <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.section')}</label>
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
                <label className={sectionLabelClass('field', 'mb-2 block')}>
                  {t('taskDetail.subtasks', { count: subtasks.length })}
                </label>
                <div className="space-y-1">
                  {subtasks.map((st) => (
                    <TaskItem key={st.id} task={st} />
                  ))}
                </div>
                <InlineAddInput
                  className="mt-2"
                  value={subInput}
                  onValueChange={setSubInput}
                  onSubmit={addSubtask}
                  onCancel={() => setSubInput('')}
                  // 確定せずに閉じても書いた分を捨てない（リスト・セクションの名前と同じ）
                  onBlurSubmit={addSubtask}
                  placeholder={t('taskDetail.subtaskPlaceholder')}
                />
              </div>
            </>
          )}

          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={isLog ? handleDeleteLog : handleDeleteTask}
              className={buttonClass({ variant: 'danger', size: 'md' }, 'w-full')}
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
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 dark:shadow-[-8px_0_24px_rgba(0,0,0,0.5)]
                   h-full overflow-y-auto shadow-xl animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {detailBody}
      </div>
    </div>
  )
}
