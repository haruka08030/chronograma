import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { planTiming } from '../../lib/planTiming'
import { colorVars, recordHex } from '../../lib/logCategoryColors'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'
import { ColorLabelPicker } from '../labels/ColorLabelPicker'
import { useDismiss } from '../../hooks/useDismiss'
import { useHotkey } from '../../hooks/useHotkey'
import { anchoredCardClass } from '../ui/surface'
import { startTimerForTask } from '../../lib/timerDrop'
import { CloseIcon, PencilIcon, PlayIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'

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
  const { t } = useTranslation()
  const df = useDateFormat()
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId) ?? null)
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const logPlanAsPlanned = useTaskStore((s) => s.logPlanAsPlanned)
  const ref = useRef<HTMLDivElement>(null)
  const layer = useDismiss({ open: true, onClose, inside: [ref] })

  // カードが一番上のときだけ（上に色の一覧などが重なっていれば効かない）
  useHotkey('e', () => onOpenDetail(taskId), { scope: layer })
  useHotkey(['Delete', 'Backspace'], () => {
    deleteTask(taskId)
    onClose()
  }, { scope: layer })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!task) return null

  const isLog = task.isTimeLog === true
  const list = lists.find((l) => l.id === task.listId)
  // カレンダーの予定と同じ色（タスク自身の色 → リストの色）
  const hex = isLog ? recordHex(task, logCategoryColors) : task.color || NEUTRAL_HEX
  const { dateKey, canLogAsPlanned, ended: planEnded } = planTiming(task)
  const dateText = dateKey ? df.monthDayWeekdayLong(dateKey) : ''
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, isLog ? 270 : 280)
  const logAsPlanned = () => {
    logPlanAsPlanned(task.id)
    onClose()
  }

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
        <button type="button" onClick={() => onOpenDetail(task.id)} className={iconButtonClass()} aria-label={t('eventCard.edit')} {...tip(t('eventCard.edit'), 'e')}>
          <PencilIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => {
            deleteTask(task.id)
            onClose()
          }}
          className={iconButtonClass()}
          aria-label={t('common.delete')}
          {...tip(t('common.delete'), 'Delete')}
        >
          <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={onClose} className={iconButtonClass()} aria-label={t('common.close')} {...tip(t('common.close'), 'Esc')}>
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
            <p className="select-text line-clamp-3 whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">{task.description.trim()}</p>
          </>
        )}
      </div>

      {/* 記録は色＝分類、予定は色だけ（既定はリストの色） */}
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <ColorLabelPicker
          task={task}
          compact
          label={t('labels.pickerAria')}
          plan={!isLog}
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
