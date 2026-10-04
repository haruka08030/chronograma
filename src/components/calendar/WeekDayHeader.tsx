import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { isAppToday } from '../../lib/timeZone'
import { TimeGutterHeader } from '../timeline/TimeGutter'
import { dayMarkerClass, TODAY_TEXT } from '../../lib/dayMarker'
import { CalendarAddTaskButton } from '../CalendarInlineTaskAdd'
import { dateFnsLocale, toDateKey } from '../../lib/dateKey'

/** 週の曜日・日付の行（押すとその日を選ぶ。＋ で終日の ToDo を追加）と、1 日だけ描くときの「予定 / 記録」の行 */
export function WeekDayHeader({
  singleDay,
  days,
  gridDays,
  gridKey0,
  gutterWidth,
  selectedDateKey,
  onSelectDate,
  setAllDayAddDate,
}: {
  singleDay: boolean
  days: Date[]
  gridDays: Date[]
  gridKey0: string
  gutterWidth: number
  selectedDateKey?: string
  onSelectDate?: (dateKey: string) => void
  setAllDayAddDate: (dateKey: string) => void
}) {
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  return (
    <>
    {!singleDay && (
    <div className="flex border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 px-2 pt-1">
      {gridDays.length > 1 ? (
        <TimeGutterHeader dateKey={gridKey0} />
      ) : (
        <div style={{ width: gutterWidth }} className="flex-shrink-0" />
      )}
      <div className="flex-1 grid grid-cols-7">
        {days.map((day, i) => {
          const today = isAppToday(day)
          const key = toDateKey(day)
          const selected = selectedDateKey ? selectedDateKey === key : false
          // 「予定 / 記録」は 7 日すべてに並べるとうるさいので 1 か所だけ（今日、無ければ先頭の日）
          const showLaneLabels = today || (i === 0 && !days.some((d) => isAppToday(d)))
          return (
            <div key={day.toISOString()} className="group relative">
              <button
                type="button"
                onClick={() => onSelectDate?.(key)}
                className={`w-full text-center py-2 transition-colors ${
                  today ? TODAY_TEXT : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <div className="text-[11px] font-medium">{format(day, 'E', { locale: dateLocale })}</div>
                <div className={`text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full
                  ${dayMarkerClass({ today, selected })}`}>
                  {format(day, 'd')}
                </div>
                <div className={`mt-0.5 hidden grid-cols-2 text-[9px] font-normal text-zinc-400 dark:text-zinc-500 ${showLaneLabels ? 'md:grid' : ''}`}>
                  <span>{t('weekCalendar.lanePlan')}</span>
                  <span>{t('weekCalendar.laneLog')}</span>
                </div>
              </button>
              <CalendarAddTaskButton
                onClick={() => {
                  onSelectDate?.(key)
                  setAllDayAddDate(key)
                }}
                // スマホ幅は曜日の文字に重なるので出さない（inline-flex に hidden が負けるので max-md で消す）
                className={`absolute right-1 top-1 h-4 w-4 p-px opacity-0 transition-opacity max-md:hidden
                  focus-visible:opacity-100 group-hover:opacity-100 ${selected ? 'opacity-60' : ''}`}
              />
            </div>
          )
        })}
      </div>
    </div>
    )}

    {/* 1 日だけ描くとき（今日・スマホの週）は列の上に 1 行で */}
    {gridDays.length === 1 && (
      <div className="flex flex-shrink-0 border-b border-zinc-100 px-2 dark:border-zinc-800">
        <TimeGutterHeader dateKey={gridKey0} />
        <div className="grid flex-1 grid-cols-2 py-1.5 text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          <span>{t('weekCalendar.lanePlan')}</span>
          <span>{t('weekCalendar.laneLog')}</span>
        </div>
      </div>
    )}
    </>
  )
}
