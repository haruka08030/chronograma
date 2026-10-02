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
import { ColorLabelPicker } from '../labels/ColorLabelPicker'
import { useDismiss } from '../../hooks/useDismiss'
import { anchoredCardClass } from '../ui/surface'
import { startTimerForTask } from '../../lib/timerDrop'
import { zonedNow } from '../../lib/timeZone'
import { CloseIcon, PencilIcon, PlayIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'

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
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const logPlanAsPlanned = useTaskStore((s) => s.logPlanAsPlanned)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ open: true, onClose, inside: [ref] })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'e') {
        e.preventDefault()
        onOpenDetail(taskId)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteTask(taskId)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [taskId, onClose, onOpenDetail, deleteTask])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!task) return null

  const isLog = task.isTimeLog === true
  const list = lists.find((l) => l.id === task.listId)
  // カレンダーの予定と同じ色（タスク自身の色 → リストの色）
  const hex = isLog ? recordHex(task, logCategoryColors) : task.color || list?.color || NEUTRAL_HEX
  const dateKey = taskPlacementDate(task)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const dateText = dateKey ? format(parseISO(`${dateKey}T12:00:00`), t('eventCard.dateFormat'), { locale: dateLocale }) : ''
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, isLog ? 270 : 280)
  // 始まった予定は「予定どおり」記録にして完了できる（今より先の分は記録しない）
  const now = zonedNow()
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const todayKey = format(now, 'yyyy-MM-dd')
  const canLogAsPlanned =
    !isLog && !task.completed && Boolean(dateKey && task.startTime && task.endTime) &&
    (dateKey! < todayKey || (dateKey === todayKey && task.startTime! < nowHm))
  /** 終わった予定は記録を始めても意味がないので、記録開始は出さない */
  const planEnded = Boolean(dateKey && task.endTime) && (dateKey! < todayKey || (dateKey === todayKey && task.endTime! <= nowHm))
  const logAsPlanned = () => {
    logPlanAsPlanned(task.id)
    onClose()
  }

  const iconButton =
    'rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={task.title}
      tabIndex={-1}
      className={anchoredCardClass(sheet)}
      // 色の一覧を開くと背が伸びる。画面からはみ出す分はカードの中でスクロール
      // （時刻の候補リストのような中の絶対配置が無いのでここだけ。新規作成・Google の予定のカードには付けない）
      style={{ ...style, maxHeight: sheet ? '85vh' : `calc(100vh - ${Number(style.top ?? 0)}px - 12px)`, overflowY: 'auto' }}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        <button type="button" onClick={() => onOpenDetail(task.id)} className={iconButton} aria-label={t('eventCard.edit')} title={`${t('eventCard.edit')} (e)`}>
          <PencilIcon className="h-4 w-4" strokeWidth={1.75} />
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
          <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onClose} className={iconButton} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
          <CloseIcon className="h-4 w-4" />
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
            ? t('eventCard.log')
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

      {/* 記録は色＝分類、予定は色だけ（既定はリストの色） */}
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <ColorLabelPicker
          task={task}
          compact
          label={t('labels.pickerAria')}
          planDefaultHex={isLog ? undefined : list?.color ?? NEUTRAL_HEX}
        />
      </div>

      {!isLog && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => {
              toggleTask(task.id)
              onClose()
            }}
            className={buttonClass({ variant: 'primary', size: 'sm' })}
          >
            {task.completed ? t('eventCard.markIncomplete') : t('eventCard.markDone')}
          </button>
          {canLogAsPlanned && (
            <button
              type="button"
              onClick={logAsPlanned}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              {t('eventCard.logAsPlanned')}
            </button>
          )}
          {!task.completed && !planEnded && (
            <button
              type="button"
              // 記録中でも押せる（前の記録を保存して切り替える）
              disabled={activeTimer?.taskId === task.id}
              onClick={() => {
                if (startTimerForTask(task.id)) onClose()
              }}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <PlayIcon className="h-3 w-3" />
              {t('eventCard.startLog')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
