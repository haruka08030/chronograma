import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { taskPlacementDate } from '../../lib/taskTimeRange'
import { colorVars, recordHex } from '../../lib/logCategoryColors'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'

const WIDTH = 320

/**
 * タイムラインの予定・記録を押したときの小さなカード（Google カレンダーのイベントカード相当）。
 * よく使う操作（完了・記録開始・削除）はここで済ませ、細かい編集だけ「詳細」へ。
 * キー: Esc 閉じる / e 詳細 / Delete・Backspace 削除
 */
export function EventPopover({
  taskId,
  anchor,
  onClose,
  onOpenDetail,
}: {
  taskId: string
  anchor: AnchorRect
  onClose: () => void
  onOpenDetail: (taskId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId) ?? null)
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const startTimer = useTaskStore((s) => s.startTimer)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'e') {
        e.preventDefault()
        onOpenDetail(taskId)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteTask(taskId)
        onClose()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    // 開いたクリック自体で閉じないよう、次のタイミングから外側クリックを拾う
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [taskId, onClose, onOpenDetail, deleteTask])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!task) return null

  const isLog = task.isTimeLog === true
  const list = lists.find((l) => l.id === task.listId)
  const hex = isLog ? recordHex(task, logCategoryColors) : list?.color ?? NEUTRAL_HEX
  const dateKey = taskPlacementDate(task)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const dateText = dateKey ? format(parseISO(`${dateKey}T12:00:00`), t('eventCard.dateFormat'), { locale: dateLocale }) : ''
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, 220)

  const iconButton =
    'rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={task.title}
      tabIndex={-1}
      className={`fixed z-[60] border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-800 ${
        sheet ? 'animate-sheet-in rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'animate-pop-in rounded-2xl'
      }`}
      style={style}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        <button type="button" onClick={() => onOpenDetail(task.id)} className={iconButton} aria-label={t('eventCard.edit')} title={`${t('eventCard.edit')} (e)`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
        </button>
        <button
          type="button"
          onClick={() => {
            deleteTask(task.id)
            onClose()
          }}
          className={iconButton}
          aria-label={t('common.delete')}
          title={`${t('common.delete')} (Delete)`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        </button>
        <button type="button" onClick={onClose} className={iconButton} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-4">
        <span className="gc-dot mt-1.5 h-3.5 w-3.5 rounded" style={colorVars(hex)} aria-hidden />
        <div className="min-w-0">
          <p className={`break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100 ${task.completed && !isLog ? 'line-through opacity-60' : ''}`}>
            {task.title}
          </p>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
            {dateText}
            {task.startTime && task.endTime && ` · ${task.startTime} – ${task.endTime}`}
          </p>
        </div>
        <span />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {isLog
            ? `${t('eventCard.log')}${task.tags[0] ? ` · ${task.tags[0]}` : ''}`
            : list
              ? displayListName(list.id, list.name)
              : ''}
        </p>
        {task.description.trim() && (
          <>
            <span />
            <p className="line-clamp-3 whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">{task.description.trim()}</p>
          </>
        )}
      </div>

      {!isLog && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => {
              toggleTask(task.id)
              onClose()
            }}
            className="rounded-full bg-accent-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700"
          >
            {task.completed ? t('eventCard.markIncomplete') : t('eventCard.markDone')}
          </button>
          {!task.completed && (
            <button
              type="button"
              disabled={activeTimer !== null}
              onClick={() => {
                startTimer(task.title, task.tags, task.id)
                onClose()
              }}
              className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              ▶ {t('eventCard.startLog')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
