import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { zonedNow } from '../lib/timeZone'
import { dayMarkerClass } from '../lib/dayMarker'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

/** パネルの大きさ（位置合わせ用。`w-[272px]` と 6 週の高さ） */
const PANEL_WIDTH = 272
const PANEL_HEIGHT = 360

/** `viewMonth` を含む月を、月曜始まりの 6 週グリッドとして並べる。 */
function monthGridDays(viewMonth: Date): Date[] {
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  return eachDayOfInterval({ start: calStart, end: calEnd })
}

/** 正午固定でパースし、タイムゾーンによる日付ズレを避ける。 */
function parseDateKey(key: string): Date {
  return parseISO(`${key}T12:00:00`)
}

type TriggerArgs = {
  open: boolean
  toggle: () => void
  value: string | null
}

type DueDatePopoverProps = {
  /** `yyyy-MM-dd` 形式。未設定は null。 */
  value: string | null
  onChange: (value: string | null) => void
  /** ポップオーバーの水平アライン。 */
  align?: 'left' | 'right'
  /** トリガー部分のラッパー（`position: relative` の親）に付与する class。 */
  wrapperClassName?: string
  trigger: (args: TriggerArgs) => ReactNode
  /**
   * 期限（due）か予定日（scheduled）か、空にできない日付（date: 記録の日付など）か。
   * 見出しと「〜なし」ボタンが変わる（date には「〜なし」が無い）。
   */
  kind?: 'due' | 'scheduled' | 'date'
  /** これより前の日は選べない（`yyyy-MM-dd`。終了日の下限など） */
  min?: string
}

/** Google カレンダー（Web）風の日付ピッカー・ポップオーバー（期限・予定日・記録の日付で共通）。 */
export function DueDatePopover({
  value,
  onChange,
  align = 'right',
  wrapperClassName = 'relative',
  trigger,
  kind = 'due',
  min,
}: DueDatePopoverProps) {
  const { t, i18n } = useTranslation()
  const isJa = Boolean(i18n.resolvedLanguage?.startsWith('ja'))
  const dateLocale = isJa ? ja : enUS

  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value ? parseDateKey(value) : zonedNow()),
  )

  // ref ではなく state で持つ（描画中に渡す toggle から読むため）
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()

  useDismiss({ open, onClose: () => setOpen(false), inside: [panelRef, wrapperEl] })

  /**
   * 画面に固定して body 直下に出す。ダイアログやスクロールする欄の中でも切れない。
   * 下に余白がなければ上向き、横は画面からはみ出さないように寄せる。
   */
  const place = () => {
    const rect = wrapperEl?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom
    const up = below < PANEL_HEIGHT && rect.top > below
    const left = align === 'right' ? rect.right - PANEL_WIDTH : rect.left
    setPanelStyle({
      position: 'fixed',
      left: Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }

  // 開いている間に周りがスクロール・リサイズしたら、開くボタンに付いていく
  useEffect(() => {
    if (!open) return
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
  })

  const toggle = () => {
    if (!open) {
      setViewMonth(startOfMonth(value ? parseDateKey(value) : zonedNow()))
      place()
    }
    setOpen((o) => !o)
  }

  const pick = (key: string | null) => {
    onChange(key)
    setOpen(false)
  }

  const days = monthGridDays(viewMonth)
  const weekdays = t('calendar.weekdayInitials', { returnObjects: true }) as string[]
  const todayKey = format(zonedNow(), 'yyyy-MM-dd')
  const tomorrowKey = format(addDays(zonedNow(), 1), 'yyyy-MM-dd')

  return (
    <div
      ref={setWrapperEl}
      className={wrapperClassName}
      onClick={(e) => e.stopPropagation()}
    >
      {trigger({ open, toggle, value })}

      {open && createPortal(
        <div
          ref={panelRef}
          id={dialogId}
          // 開いている予定カードなどからは「内側」（押しても閉じない）
          data-popover-keep
          style={panelStyle}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={t(
            kind === 'scheduled' ? 'dueDatePicker.scheduledTitle' : kind === 'date' ? 'dueDatePicker.dateTitle' : 'dueDatePicker.title',
          )}
          className={`z-[90] w-[272px] p-3 ${POPOVER_PANEL}`}
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {format(viewMonth, isJa ? 'yyyy年M月' : 'MMMM yyyy', { locale: dateLocale })}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={t('dueDatePicker.prevMonth')}
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t('dueDatePicker.nextMonth')}
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7">
            {weekdays.map((d) => (
              <div
                key={d}
                className="py-1.5 text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const inMonth = isSameMonth(day, viewMonth)
              const today = key === todayKey
              const selected = value != null && key === value
              const beforeMin = min != null && key < min
              return (
                <div key={key} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => pick(key)}
                    aria-pressed={selected}
                    disabled={beforeMin}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-30
                      ${
                        today || selected
                          ? dayMarkerClass({ today, selected })
                          : inMonth
                              ? 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700'
                              : 'text-zinc-300 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:bg-zinc-700'
                      }`}
                  >
                    {format(day, 'd')}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <div className="flex gap-1">
              <button
                type="button"
                disabled={min != null && todayKey < min}
                onClick={() => pick(todayKey)}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {t('dueDatePicker.today')}
              </button>
              <button
                type="button"
                disabled={min != null && tomorrowKey < min}
                onClick={() => pick(tomorrowKey)}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {t('dueDatePicker.tomorrow')}
              </button>
            </div>
            {value != null && kind !== 'date' && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {t(kind === 'scheduled' ? 'dueDatePicker.clearScheduled' : 'dueDatePicker.clear')}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
