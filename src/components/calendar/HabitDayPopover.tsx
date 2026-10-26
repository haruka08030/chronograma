import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import type { Habit } from '../../types/habit'
import { colorVars } from '../../lib/logCategoryColors'
import { dateFnsLocale, fromDateKey } from '../../lib/dateKey'
import { appTodayKey } from '../../lib/timeZone'
import { startTaskDrag } from '../../lib/taskDrag'
import { tip } from '../../lib/tooltip'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { HabitDotMark } from './HabitDotMark'
import { useHabitToggle } from './useHabitToggle'
import { habitDotState, habitStarted } from './habitDotState'
import { useDismiss } from '../../hooks/useDismiss'
import { useTouchContextMenu } from '../../hooks/useTouchContextMenu'
import { MENU_ROW_ACTIVE, MENU_ROW_HOVER, POPOVER_PANEL } from '../ui/surface'

/** ポップオーバーの幅（位置合わせ用。`w-[260px]`） */
const PANEL_WIDTH = 260

export type HabitDayItem = { habit: Habit; id: string; time: string | null; done: boolean }

/**
 * 習慣の段の「習慣 ▾」・「+N」から開く、その日の習慣の一覧。名前を見ながら ✓ を付けられる。上に日付、週・3 日は ‹ › で丸のある日を替える。
 * 行は段と同じ並び（週・3 日は習慣の並び、1 日表示はまだを時刻順→達成）で、時刻は前に小さく灰色で。押した丸の行は目立たせ、その行の ✓ にフォーカスする（Enter・Space で ✓）。
 * ✓ で達成・取り消し（始まった時刻から。先の日・先の時刻は輪だけ）。✓ しても閉じない（続けて付けられる）。Esc・外側を押すと閉じる。
 * 行を押すとカード、右クリック（タッチは長押し）でメニュー、格子へドラッグでその日だけの枠。
 * 開いたマス（PC）・「+N」の左端に合わせて、そのすぐ下に出す。body 直下に固定で出す（段の外にはみ出しても切れない）
 */
export function HabitDayPopover({
  anchor,
  dateKey,
  items,
  highlightId,
  logLimitMin,
  openHabitCard,
  openHabitMenu,
  onStep,
  canPrev = false,
  canNext = false,
  onClose,
}: {
  /** 開いたマス・「+N」（位置合わせと、カードの起点） */
  anchor: Element
  dateKey: string
  items: HabitDayItem[]
  /** 押した丸の習慣（その行を目立たせる。「+N」から開いたときは null） */
  highlightId: string | null
  logLimitMin: (key: string) => number | null
  openHabitCard: (slotId: string, el?: Element | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
  /** 前・次の日へ（無ければ ‹ › を出さない） */
  onStep?: (dir: -1 | 1) => void
  canPrev?: boolean
  canNext?: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const toggle = useHabitToggle()
  const panelRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' })
  /** 格子へドラッグしている間は、下の格子に落とせるよう見えなくして素通しにする（離したら閉じる） */
  const [dragging, setDragging] = useState(false)
  useDismiss({ open: true, onClose, inside: [panelRef, anchor] })
  // スマホは長押しで右クリックと同じメニュー（パネルはカレンダーの外にあるので、ここでも拾う）
  useTouchContextMenu(panelRef)

  useEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
        top: rect.bottom + 2,
        maxHeight: window.innerHeight - rect.bottom - 16,
      })
    }
    place()
    const onMove = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      place()
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [anchor])

  // 置けて見えるようになったら、押した丸の行の ✓ にフォーカスする（隠れている間はフォーカスできない）
  const placed = style.visibility !== 'hidden'
  const focusedRef = useRef(false)
  useEffect(() => {
    if (!placed || focusedRef.current || highlightId === null) return
    focusedRef.current = true
    const row = panelRef.current?.querySelector<HTMLElement>('[data-highlight]')
    ;(row?.querySelector<HTMLElement>('button[aria-pressed]') ?? row?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true })
  }, [placed, highlightId])

  const limit = logLimitMin(dateKey)
  const today = appTodayKey()
  const past = dateKey < today
  const label = t('weekCalendar.habitDayList', {
    date: format(fromDateKey(dateKey), 'M/d', { locale: dateFnsLocale(i18n.resolvedLanguage) }),
  })
  return createPortal(
    <div
      ref={panelRef}
      id={dialogId}
      data-popover-keep
      role="dialog"
      aria-label={label}
      style={style}
      className={`z-[80] w-[260px] overflow-y-auto p-1 ${POPOVER_PANEL} ${dragging ? 'pointer-events-none opacity-0' : ''}`}
    >
      <div className="flex h-7 items-center gap-1 px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {onStep && (
          <StepButton label={t('planner.prevDay')} disabled={!canPrev} onClick={() => onStep(-1)}>
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </StepButton>
        )}
        <span className={`flex-1 tabular-nums ${onStep ? 'text-center' : 'px-1'}`}>{label}</span>
        {onStep && (
          <StepButton label={t('planner.nextDay')} disabled={!canNext} onClick={() => onStep(1)}>
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </StepButton>
        )}
      </div>
      {items.map(({ habit, id, time, done }) => {
        // 始まった（記録にできる）時刻からは ✓ で予定どおり達成。時間なしは今日と過ぎた日（先の日の記録は付けない）
        const started = habitStarted(time, limit)
        const missed = past && !done
        return (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 押して開くのはマウス・指の近道（題名はボタン）
          <div
            key={id}
            data-block-id={id}
            data-touch-menu
            data-highlight={id === highlightId || undefined}
            // 予定の列に落とすとその日だけその時間の枠、記録の列ならその時間にやった記録（時間なしも同じ）
            draggable
            onDragStart={(e) => {
              startTaskDrag(e, id)
              setDragging(true)
            }}
            onDragEnd={onClose}
            onClick={() => {
              openHabitCard(id, anchor)
              onClose()
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openHabitMenu(id, e.clientX, e.clientY)
              onClose()
            }}
            className={`flex min-h-8 cursor-grab items-center gap-1.5 rounded-md px-2 text-xs leading-tight active:cursor-grabbing pointer-coarse:min-h-11
              ${id === highlightId ? MENU_ROW_ACTIVE : MENU_ROW_HOVER}`}
            style={colorVars(habit.color)}
          >
            {done || started ? (
              <button
                type="button"
                draggable={false}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(habit.id, dateKey)
                }}
                {...tip(
                  done
                    ? t('weekCalendar.habitUndo')
                    : time === null
                      ? t('weekCalendar.habitMarkDone')
                      : t('weekCalendar.habitDoneAsPlanned'),
                  { name: true },
                )}
                aria-pressed={done}
                className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full outline-none hover:bg-zinc-200/70 focus-visible:ring-2 focus-visible:ring-accent-500 pointer-coarse:h-11 pointer-coarse:w-11 dark:hover:bg-zinc-600"
              >
                {/* 段の丸と同じ見た目（過ぎた日のやらなかった分は、付けられるよう灰色の縁の丸で） */}
                <HabitDotMark state={habitDotState({ time, done }, dateKey, today, limit)} large list />
              </button>
            ) : (
              <span className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-11">
                <HabitDotMark state="future" large list />
              </span>
            )}
            <button
              type="button"
              draggable={false}
              className={`flex min-w-0 flex-1 items-baseline gap-1.5 py-1 text-left ${
                done || missed ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-100'
              }`}
            >
              {time !== null && <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{time}</span>}
              <span className="truncate">{habit.title}</span>
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

/** 一覧の上の ‹ ›（前・次の日） */
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...tip(label, { name: true })}
      className="grid h-6 w-6 place-items-center rounded-md hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent pointer-coarse:h-9 pointer-coarse:w-9 dark:hover:bg-zinc-700"
    >
      {children}
    </button>
  )
}
