import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, startOfMonth } from 'date-fns'
import type { CalendarMode } from '../store/storeTypes'
import { DatePickerBody } from './DatePickerBody'
import { GoogleStatusDot } from './GoogleStatusDot'
import { ActionMenu, type ActionEntry } from './ui/ActionMenu'
import { CaretDownIcon } from './icons'
import { dateFnsLocale, fromDateKey } from '../lib/dateKey'
import { zonedNow } from '../lib/timeZone'

/** スマホ幅で選べる表示（Google カレンダーと同じ並び） */
const MOBILE_MODES: CalendarMode[] = ['schedule', 'week', 'threeDay', 'month']

/**
 * スマホ幅のカレンダーの見出し（1 行）: 「10月 ▾」（押すとミニ月が下に開く）・今日・表示の切り替え・時間未定のタスク。
 * 前後へはスワイプで動く（‹ › は PC 幅だけ）
 */
export function CalendarMobileHeader({
  mode,
  onModeChange,
  selectedDateKey,
  monthCursor,
  onGoToday,
  onPickDate,
  dockOpen,
  onToggleDock,
}: {
  mode: CalendarMode
  onModeChange: (mode: CalendarMode) => void
  selectedDateKey: string
  monthCursor: Date
  onGoToday: () => void
  onPickDate: (dateKey: string) => void
  dockOpen: boolean
  onToggleDock: () => void
}) {
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [modeMenu, setModeMenu] = useState<{ x: number; y: number } | null>(null)

  const shownMonth = mode === 'month' ? monthCursor : fromDateKey(selectedDateKey)
  // 今年なら「10月」、他の年は年も付ける
  const monthLabel = format(
    shownMonth,
    shownMonth.getFullYear() === zonedNow().getFullYear() ? 'LLLL' : i18n.resolvedLanguage?.startsWith('ja') ? 'y年 LLLL' : 'LLLL y',
    { locale: dateLocale },
  )
  const modeLabel = (m: CalendarMode) =>
    m === 'schedule' ? t('calendarHub.modeSchedule')
      : m === 'week' ? t('calendarHub.modeDay')
        : m === 'threeDay' ? t('calendarHub.modeThreeDay')
          : t('common.month')
  const modeEntries: ActionEntry[] = MOBILE_MODES.map((m) => ({
    kind: 'leaf',
    id: m,
    label: modeLabel(m),
    checked: m === mode,
    run: () => onModeChange(m),
  }))

  return (
    <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          type="button"
          aria-expanded={pickerOpen}
          aria-label={t('calendarHub.openDatePickerAria')}
          onClick={() => setPickerOpen((o) => !o)}
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="truncate">{monthLabel}</span>
          <CaretDownIcon className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
        <GoogleStatusDot />
        <div className="flex-1" />
        <button
          type="button"
          onClick={onGoToday}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {t('calendarHub.today')}
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={!!modeMenu}
          aria-label={t('calendarHub.calendarTabsAria')}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setModeMenu({ x: r.left, y: r.bottom + 4 })
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {modeLabel(mode)}
          <CaretDownIcon className="h-2.5 w-2.5 text-zinc-500" />
        </button>
        <button
          type="button"
          onClick={onToggleDock}
          aria-pressed={dockOpen}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            dockOpen
              ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          }`}
        >
          {t('calendarHub.dockToggleShort')}
        </button>
      </div>
      {/* Google カレンダーと同じく、ミニ月は見出しの下に開いて下を押し下げる */}
      {pickerOpen && (
        <div className="mx-auto w-full max-w-xs px-3 pb-3">
          <DatePickerBody
            key={selectedDateKey}
            value={selectedDateKey}
            month={startOfMonth(shownMonth)}
            kind="date"
            footer={false}
            onPick={(key) => {
              if (!key) return
              onPickDate(key)
              setPickerOpen(false)
            }}
          />
        </div>
      )}
      {modeMenu && (
        <ActionMenu x={modeMenu.x} y={modeMenu.y} entries={modeEntries} onClose={() => setModeMenu(null)} searchable={false} />
      )}
    </div>
  )
}
