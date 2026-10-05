import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { appToday, appTodayKey } from '../lib/timeZone'
import { dayMarkerClass } from '../lib/dayMarker'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { useDateFormat } from '../hooks/useDateFormat'

/** `viewMonth` を含む月を、月曜始まりの 6 週グリッドとして並べる。 */
function monthGridDays(viewMonth: Date): Date[] {
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  return eachDayOfInterval({ start: calStart, end: calEnd })
}

/**
 * 月のカレンダー（月の切り替え・日付・今日/明日・なし）。期限のポップオーバー・タスクの右クリックメニュー・
 * カレンダー画面の見出しの日付ジャンプで共通。
 * 開くたびに作り直す前提で、`month`（なければ選んでいる日、それもなければ今日）の月から始める。
 * キーボード: 日の格子は Tab で 1 回だけ止まり、←→↑↓ で日・週、PageUp/PageDown で月、Home/End で週の頭と終わり、Enter で決める
 */
export function DatePickerBody({
  value,
  onPick,
  kind = 'due',
  min,
  footer = true,
  month,
  autoFocus = false,
}: {
  value: string | null
  onPick: (key: string | null) => void
  kind?: 'due' | 'scheduled' | 'date'
  min?: string
  /** 下の「今日・明日・なし」。上に同じ項目を並べるとき（右クリックメニュー）は出さない */
  footer?: boolean
  /** 最初に見せる月（カレンダー画面の月表示では、選んでいる日ではなく見ている月から始める） */
  month?: Date
  /** 開いたら日の格子（選んでいる日・なければ今日）にフォーカスする（期限の欄から開くポップオーバー） */
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(month ?? (value ? fromDateKey(value) : appToday())))
  const pick = onPick
  const days = monthGridDays(viewMonth)
  const weekdays = t('calendar.weekdayInitials', { returnObjects: true }) as string[]
  const todayKey = appTodayKey()
  const tomorrowKey = toDateKey(addDays(appToday(), 1))

  // キーで動かす日（格子の中で Tab が止まる 1 日）
  const [activeKey, setActiveKey] = useState(() => value ?? todayKey)
  const gridRef = useRef<HTMLDivElement>(null)
  const focusActive = useRef(autoFocus)
  useEffect(() => {
    if (!focusActive.current) return
    focusActive.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${activeKey}"]`)?.focus()
  }, [activeKey, viewMonth])
  // 見ている月に無い日は、その月の 1 日を止まる日にする（月を切り替えたとき）
  const tabKey = isSameMonth(fromDateKey(activeKey), viewMonth) ? activeKey : toDateKey(viewMonth)

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = fromDateKey(tabKey)
    const dow = (from.getDay() + 6) % 7
    const next =
      e.key === 'ArrowLeft'
        ? addDays(from, -1)
        : e.key === 'ArrowRight'
          ? addDays(from, 1)
          : e.key === 'ArrowUp'
            ? addDays(from, -7)
            : e.key === 'ArrowDown'
              ? addDays(from, 7)
              : e.key === 'PageUp'
                ? subMonths(from, 1)
                : e.key === 'PageDown'
                  ? addMonths(from, 1)
                  : e.key === 'Home'
                    ? addDays(from, -dow)
                    : e.key === 'End'
                      ? addDays(from, 6 - dow)
                      : null
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    if (!isSameMonth(next, viewMonth)) setViewMonth(startOfMonth(next))
    focusActive.current = true
    setActiveKey(toDateKey(next))
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{df.yearMonth(viewMonth)}</span>
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
          <div key={d} className="py-1.5 text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {d}
          </div>
        ))}
      </div>

      <div ref={gridRef} role="group" aria-label={df.yearMonth(viewMonth)} className="grid grid-cols-7 gap-y-0.5" onKeyDown={onGridKeyDown}>
        {days.map((day) => {
          const key = toDateKey(day)
          const inMonth = isSameMonth(day, viewMonth)
          const today = key === todayKey
          const selected = value != null && key === value
          const beforeMin = min != null && key < min
          return (
            <div key={key} className="flex justify-center">
              <button
                type="button"
                data-day={key}
                tabIndex={key === tabKey ? 0 : -1}
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

      {footer && (
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
      )}
    </>
  )
}
