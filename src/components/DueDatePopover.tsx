import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
import { useEscapeLayer } from '../hooks/useEscapeLayer'
import { zonedNow } from '../lib/timeZone'
import { dayMarkerClass } from '../lib/dayMarker'

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
  /** 期限（due）か予定日（scheduled）か。見出しと「〜なし」ボタンの文言が変わる。 */
  kind?: 'due' | 'scheduled'
}

/** Google カレンダー（Web）風の期限ピッカー・ポップオーバー。 */
export function DueDatePopover({
  value,
  onChange,
  align = 'right',
  wrapperClassName = 'relative',
  trigger,
  kind = 'due',
}: DueDatePopoverProps) {
  const { t, i18n } = useTranslation()
  const isJa = Boolean(i18n.resolvedLanguage?.startsWith('ja'))
  const dateLocale = isJa ? ja : enUS

  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(value ? parseDateKey(value) : zonedNow()),
  )

  // ref ではなく state で持つ（描画中に渡す toggle から読むため）
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()

  useEscapeLayer(() => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node
      if (panelRef.current?.contains(node)) return
      if (wrapperEl?.contains(node)) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, wrapperEl])

  const toggle = () => {
    if (!open) {
      setViewMonth(startOfMonth(value ? parseDateKey(value) : zonedNow()))
      const rect = wrapperEl?.getBoundingClientRect()
      // 下方向に十分な余白がなければ上向きに開く。
      setDropUp(Boolean(rect && window.innerHeight - rect.bottom < 380))
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

      {open && (
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-label={t(kind === 'scheduled' ? 'dueDatePicker.scheduledTitle' : 'dueDatePicker.title')}
          className={`absolute z-50 w-[272px] rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl
            dark:border-zinc-700 dark:bg-zinc-900
            ${align === 'right' ? 'right-0' : 'left-0'}
            ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
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
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t('dueDatePicker.nextMonth')}
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
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
              return (
                <div key={key} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => pick(key)}
                    aria-pressed={selected}
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] transition-colors
                      ${
                        today || selected
                          ? dayMarkerClass({ today, selected })
                          : inMonth
                              ? 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
                              : 'text-zinc-300 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:bg-zinc-800'
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
                onClick={() => pick(todayKey)}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('dueDatePicker.today')}
              </button>
              <button
                type="button"
                onClick={() => pick(tomorrowKey)}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('dueDatePicker.tomorrow')}
              </button>
            </div>
            {value != null && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {t(kind === 'scheduled' ? 'dueDatePicker.clearScheduled' : 'dueDatePicker.clear')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
