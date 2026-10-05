import { useTranslation } from 'react-i18next'
import { HOUR_HEIGHT, timeToY } from '../../lib/timeGrid'
import { getResizeCursor, type CreatePopup } from '../../lib/useTimelineDrag'
import { useNowMinuteTick } from '../../hooks/useNowMinuteTick'
import { colorVars } from '../../lib/logCategoryColors'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { planVisualState } from '../../lib/planVisual'
import { CalendarCheck } from '../timeline/CalendarCheck'
import { MoonSolidIcon } from '../icons'
import { tip } from '../../lib/tooltip'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { blockGeometry, type TimeBlockTask } from './timeBlockGeometry'

/**
 * タイムライン上の 1 ブロック（Google カレンダー風）。
 * 記録（実績）とこれからの予定（Google の予定も）は薄い塗り＋枠（`gc-plan`）。記録は右、予定は左の列で見分ける。
 * 終わった・完了した予定は灰色（`gc-missed`）。
 * 背景色の細い縁で、隣り合う・重なるブロックの境目を見せる。
 */
export function TimeBlock({
  task,
  dayKey,
  onPointerDown,
  onOpenDetail,
  onTap,
  isLog,
  sleep,
  hStyle,
  colorHex,
  withCheck,
}: {
  task: TimeBlockTask
  /** 右上に ✓（`SlotCheck`）を重ねる。文字を避け、完了は ✓ の塗りで見せる */
  withCheck?: boolean
  /** クリック・タップで開く（ドラッグしない Google の予定用） */
  onTap?: () => void
  /** 週グリッド上の列の日付（ログのセグメント表示用） */
  dayKey?: string
  onPointerDown: (e: React.PointerEvent) => void
  onOpenDetail: () => void
  isLog?: boolean
  /** 睡眠の記録。色の付いた記録と並べても目立たない、落ち着いた帯にする */
  sleep?: boolean
  /** 重なり回避の横位置（left/width） */
  hStyle?: React.CSSProperties
  /** 予定はリストの色、記録は分類の色、外部の予定は Google の青 */
  colorHex: string
}) {
  const { t } = useTranslation()
  const { top, height } = blockGeometry(task, dayKey, Boolean(isLog))

  const handlePointerMoveLocal = (e: React.PointerEvent) => {
    if (onTap) {
      // 押すとカードが開くだけ（動かせない）
      ;(e.currentTarget as HTMLElement).style.cursor = 'pointer'
      return
    }
    const cursor = getResizeCursor(e)
    ;(e.currentTarget as HTMLElement).style.cursor = cursor ?? 'grab'
  }

  // 記録（実績）は分類の色、予定はその色で、どちらも薄い塗り＋枠。予定は終わったら（完了・未完了とも）グレー
  // Google の予定（外部）も予定と同じ見せ方
  const state = !isLog && dayKey ? planVisualState(task, dayKey) : 'upcoming'
  const variant = sleep ? 'gc-sleep' : isLog ? 'gc-plan' : state === 'upcoming' ? 'gc-plan' : 'gc-missed'
  const moon = sleep && <MoonSolidIcon className="mr-1 inline h-3 w-3 -translate-y-px" />
  const doneMark = state === 'done' && !withCheck ? '✓ ' : ''
  // 締切がこの日まで（過ぎていれば赤、当日はオレンジ）の予定は、題名の前に点を付ける（予定を入れても締切を見失わない）
  const dueTone =
    !isLog && !sleep && state === 'upcoming' && dayKey && task.dueDate && task.dueDate <= dayKey
      ? task.dueDate < dayKey
        ? 'overdue'
        : 'today'
      : null
  const dueDot = dueTone && (
    <span aria-hidden className={`mr-1 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-current ${DUE_TONE_CLASS[dueTone]}`} />
  )
  // 30 分未満の短いブロックは Google と同じく「タイトル、9:00」を 1 行に。
  // 20 分未満は余白を詰め、1 行が入らない 13 分未満は文字を出さない（ホバーのヒントで読める）
  const compact = height < 32
  const tight = height < 20
  const bare = height < 13
  const timeLabel = `${task.title}  ${task.startTime} – ${task.endTime}`

  return (
    <button
      onPointerDown={(e) => {
        e.stopPropagation()
        // 右クリックはメニュー（ドラッグを始めない）
        if (e.button !== 0) return
        onPointerDown(e)
      }}
      onPointerMove={handlePointerMoveLocal}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onOpenDetail()
        }
      }}
      className={`${variant} absolute overflow-hidden ${bare ? 'rounded-[2px]' : 'rounded-[5px]'} ${tight ? 'py-0 leading-none' : 'py-0.5 leading-tight'} pl-1.5 ${withCheck ? 'pr-1.5 @[5.5rem]:pr-5' : 'pr-1.5'} @container text-left text-[11px]
        cursor-grab select-none touch-none pointer-coarse:touch-auto ring-1 ring-[var(--gc-surface)] transition-shadow hover:z-30! hover:shadow-md active:cursor-grabbing
        `}
      data-block-id={task.id}
      aria-label={bare ? timeLabel : undefined}
      {...tip(timeLabel)}
      style={{
        top,
        height,
        left: 2,
        right: 2,
        ...hStyle,
        ...colorVars(colorHex),
      }}
    >
      {bare ? null : compact ? (
        <span className="block truncate">
          <span className="font-medium">
            {dueDot}
            {moon}
            {doneMark}
            {task.title}
          </span>
          <span className="opacity-80">
            {t('common.listSeparator')}
            {task.startTime}
          </span>
        </span>
      ) : (
        <>
          <span className="block truncate font-medium">
            {dueDot}
            {moon}
            {doneMark}
            {task.title}
          </span>
          <span className="block text-[10px] opacity-80">
            {task.startTime} – {task.endTime}
          </span>
        </>
      )}
    </button>
  )
}

/**
 * 予定ブロックの右上に重ねる ✓（ToDo の完了、習慣の「予定どおりやった」、Google の予定を記録にする）。
 * ブロック自体が button なので入れ子にせず、同じ位置に重ねる。
 */
export function SlotCheck({
  top,
  height,
  hStyle,
  label,
  done,
  onCheck,
}: {
  top: number
  height: number
  hStyle?: React.CSSProperties
  label: string
  done?: boolean
  onCheck: () => void
}) {
  // ブロックからはみ出さない大きさにする。入らない短いブロックでは出さない（完了はカード・メニューから）
  if (height < 14) return null
  const small = height < 20
  return (
    // 細いブロック（週表示の予定・記録の 2 列など）では出さない。題名を隠し、つかむ場所で完了になってしまう。完了はカード・メニューから
    <div
      className={`@container pointer-events-none absolute z-[31] flex justify-end ${small ? 'px-0.5' : 'p-0.5'}`}
      style={{ top, left: 2, right: 2, ...hStyle }}
    >
      <span className="pointer-events-auto hidden @[5.5rem]:block">
        <CalendarCheck size={small ? 'sm' : 'md'} done={done} label={label} onCheck={onCheck} />
      </span>
    </div>
  )
}

/** クリック / ドラッグで作成中の枠（作成カードの位置の基準にもなる）。見た目は予定・記録と同じ `gc-plan` */
export function CreateGhost({
  popup,
  onAnchor,
  laneClass,
}: {
  popup: CreatePopup
  onAnchor: (el: HTMLDivElement | null) => void
  laneClass: string
}) {
  const { t } = useTranslation()
  const top = timeToY(popup.startTime)
  const height = Math.max(timeToY(popup.endTime) - top, 20)
  return (
    <div
      ref={onAnchor}
      className={`gc-plan pointer-events-none absolute ${laneClass} z-30 rounded-[5px] px-1.5 py-0.5 text-[11px] leading-tight shadow-lg`}
      style={{ top, height, ...colorVars(NEUTRAL_HEX) }}
    >
      <span className="block font-medium">{t('quickCreate.untitled')}</span>
      <span className="block text-[10px] opacity-80">
        {popup.startTime} – {popup.endTime}
      </span>
    </div>
  )
}

export function NowIndicator() {
  const now = useNowMinuteTick()

  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 60) * HOUR_HEIGHT

  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  )
}
