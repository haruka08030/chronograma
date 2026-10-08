import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { planTiming } from '../../lib/planTiming'
import { colorVars, labelForHex, recordHex } from '../../lib/logCategoryColors'
import { CourseAssignments } from './CourseAssignments'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { anchoredCardStyle, memoHeightEstimate, type AnchorRect } from './anchoredCard'
import { ColorLabelPicker } from '../labels/ColorLabelPicker'
import { useDismiss } from '../../hooks/useDismiss'
import { useHotkey } from '../../hooks/useHotkey'
import { anchoredCardClass } from '../ui/surface'
import { startTimerForTask } from '../../lib/timerDrop'
import { CloseIcon, PencilIcon, PlayIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { shortcutTip, tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SHORTCUTS } from '../../lib/shortcuts'
import { META_TEXT, SUBTLE_TEXT } from '../ui/textClass'
import { sourceLinkOf } from '../../lib/sourceLink'
import { TaskSourceLink } from '../ui/TaskSourceLink'
import { MemoPreview } from '../ui/MemoPreview'
import { isEventTask, isLogTask, type Task } from '../../types/task'
import { endKeepingLength } from '../../lib/clockTime'
import { isOvernightTimeLog } from '../../lib/taskTimeRange'
import { useTaskTimes } from '../detail/useTaskTimes'
import { CardTimeRange } from './CardTimeRange'
import { nudgeBlockByKey } from '../../lib/timelineBlockEdit'

const WIDTH = 320

/**
 * タイムラインの予定・記録を押したときの小さなカード（Google カレンダーのイベントカード相当）。
 * よく使う操作（完了・記録開始・削除）はここで済ませ、細かい編集だけ「詳細」へ。予定（完了の無いもの）には完了を出さない。
 * キー: Esc 閉じる / e 詳細 / Delete・Backspace 削除 / Alt+↑↓ 15 分ずつ動かす / Alt+Shift+↑↓ 終わりを伸び縮み
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
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId) ?? null)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const ref = useRef<HTMLDivElement>(null)
  const layer = useDismiss({ open: true, onClose, inside: [ref] })

  // カードが一番上のときだけ（上に色の一覧などが重なっていれば効かない）
  useHotkey(SHORTCUTS.edit.hotkeys, () => onOpenDetail(taskId), { scope: layer })
  useHotkey(
    SHORTCUTS.delete.hotkeys,
    () => {
      deleteTask(taskId)
      onClose()
    },
    { scope: layer },
  )

  // カードを開いたまま Alt+↑↓ で 15 分ずつ動かし、Alt+Shift+↑↓ で終わりを伸び縮み（時刻の欄で打ち直さずに）
  useHotkey([...SHORTCUTS.nudgeBlock.hotkeys, ...SHORTCUTS.resizeBlock.hotkeys], (e) => void nudgeBlockByKey(taskId, e), {
    scope: layer,
  })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!task) return null
  return <EventPopoverBody task={task} anchor={anchor} onClose={onClose} onOpenDetail={onOpenDetail} cardRef={ref} />
}

function EventPopoverBody({
  task,
  anchor,
  onClose,
  onOpenDetail,
  cardRef: ref,
}: {
  task: Task
  anchor: AnchorRect
  onClose: () => void
  onOpenDetail: (taskId: string) => void
  cardRef: React.RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const timeLogTagPresets = useTaskStore((s) => s.timeLogTagPresets)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const deleteTask = useTaskStore((s) => s.deleteTask)
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
  // タイムゾーンを決めたタスクはそのタイムゾーンの時刻で見せて直す（詳細と同じ）
  const { tv, updateTimes } = useTaskTimes(task)

  const isLog = isLogTask(task)
  const isEvent = isEventTask(task)
  const list = lists.find((l) => l.id === task.listId)
  // カレンダーの予定と同じ色（タスク自身の色 → リストの色）
  const hex = isLog ? recordHex(task, logCategoryColors) : task.color || NEUTRAL_HEX
  const { dateKey, canLogAsPlanned, ended: planEnded } = planTiming(task)
  const dateText = dateKey ? df.monthDayWeekdayLong(dateKey) : ''
  // メモがリンクだけ（Canvas・Notion の取り込み）なら URL の文字は出さず、上の列の「開く」ボタンにする
  const sourceLink = sourceLinkOf(task.description)
  const memo = sourceLink ? '' : task.description.trim()
  // 時刻はカードでそのまま分単位に直せる（詳細まで行かずに）。日をまたぐ記録は終わりの日付もあるので詳細で
  const editableTimes = !!tv.startTime && !!tv.endTime && !isOvernightTimeLog(task)
  /** To-Do・予定は開始を動かすと長さを保って終わりもずらす（Google と同じ。23:59 まで）。記録は実際の時刻なので開始だけ直す */
  const commitStart = (v: string) => {
    if (v === tv.startTime) return
    if (isLog) {
      updateTimes({ startTime: v })
      return
    }
    updateTimes({ startTime: v, endTime: endKeepingLength(tv.startTime!, tv.endTime!, v) })
  }
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, (isLog ? 270 : 280) + (editableTimes ? 30 : 0) + memoHeightEstimate(memo))
  // 始まった予定は「記録して完了」が主役（予定どおり / ずれた時刻を選ぶ画面）。完了だけは控えめに。予定（完了の無いもの）は「記録にする」
  const recordAndComplete = () => {
    openRecordPrompt(task.id)
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={task.title}
      tabIndex={-1}
      className={anchoredCardClass(sheet)}
      // 色の一覧を開くと背が伸びる。画面からはみ出す分はカードの中でスクロール（Google の予定のカードも同じ）
      style={{ ...style, maxHeight: sheet ? '85vh' : `calc(100vh - ${Number(style.top ?? 0)}px - 12px)`, overflowY: 'auto' }}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        {/* Google の予定のカードの「Google カレンダーで開く」と同じ位置 */}
        {sourceLink && <TaskSourceLink link={sourceLink} className={iconButtonClass()} iconClassName="h-4 w-4" />}
        <button
          type="button"
          onClick={() => onOpenDetail(task.id)}
          className={iconButtonClass()}
          aria-label={t('eventCard.edit')}
          {...tip(t('eventCard.edit'), 'e')}
        >
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
          {...shortcutTip(t('common.delete'), 'delete')}
        >
          <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className={iconButtonClass()}
          aria-label={t('common.close')}
          {...tip(t('common.close'), 'Esc')}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-4">
        <span className="gc-dot mt-1.5 h-3.5 w-3.5 rounded" style={colorVars(hex)} aria-hidden />
        <div className="min-w-0">
          <p
            className={`break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100 ${task.completed && !isLog ? 'line-through opacity-60' : ''}`}
          >
            {task.title}
          </p>
          {editableTimes ? (
            <>
              <p className={`mt-0.5 ${SUBTLE_TEXT}`}>{dateText}</p>
              <div className="mt-1.5">
                <CardTimeRange
                  startTime={tv.startTime!}
                  endTime={tv.endTime!}
                  onStart={commitStart}
                  onEnd={(v) => v !== tv.endTime && updateTimes({ endTime: v })}
                  startLabel={t('common.start')}
                  endLabel={t('common.end')}
                />
              </div>
            </>
          ) : (
            <p className={`mt-0.5 ${SUBTLE_TEXT}`}>
              {dateText}
              {tv.startTime && tv.endTime && ` · ${tv.startTime} – ${tv.endTime}`}
            </p>
          )}
        </div>
        <span />
        <p className={META_TEXT}>{isLog ? t('eventCard.log') : list ? displayListName(list.id, list.name) : ''}</p>
        {memo && (
          <>
            <span />
            <MemoPreview text={memo} />
          </>
        )}
      </div>

      {/* 記録は色＝分類、予定は色だけ（既定はリストの色） */}
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <ColorLabelPicker task={task} compact label={t('labels.pickerAria')} plan={!isLog} />
      </div>

      {/* 授業の予定（時刻のある予定）: その科目の未完了の課題（#309） */}
      {isEvent && task.startTime && (
        <CourseAssignments
          title={task.title}
          labelName={labelForHex(task.color, timeLogTagPresets, logCategoryColors)}
          onOpenTask={onOpenDetail}
        />
      )}

      {!isLog && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          {canLogAsPlanned && (
            <button type="button" onClick={recordAndComplete} className={buttonClass({ variant: 'primary', size: 'sm' })}>
              {isEvent ? t('eventCard.toRecord') : t('eventCard.recordAndComplete')}
            </button>
          )}
          {/* 予定（バイト・授業）には「完了にする」を出さない（Google の予定と同じく、時間が過ぎたらグレー） */}
          {!isEvent && (
            <button
              type="button"
              onClick={() => {
                toggleTask(task.id)
                onClose()
              }}
              className={buttonClass({ variant: canLogAsPlanned ? 'secondary' : 'primary', size: 'sm' })}
            >
              {task.completed ? t('eventCard.markIncomplete') : canLogAsPlanned ? t('eventCard.markDoneOnly') : t('eventCard.markDone')}
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
