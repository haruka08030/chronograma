import { useMemo } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { HOUR_HEIGHT, HOURS, formatTimeLabel } from '../../lib/timeGrid'
import { GUTTER_EXTRA_WIDTH, GUTTER_PRIMARY_WIDTH, useTimeGutterWidth } from '../../hooks/useTimeGutterWidth'
import { appTimeZone, gmtLabel, instantFromWall, wallInZone } from '../../lib/timeZone'

const PRIMARY_WIDTH = GUTTER_PRIMARY_WIDTH
const EXTRA_WIDTH = GUTTER_EXTRA_WIDTH

const labelClass = 'absolute text-[11px] leading-none select-none'

/**
 * タイムラインの左の時間バー。設定で他のタイムゾーンを選んでいれば、Google カレンダーと同じく左に並べる。
 * 他のタイムゾーンの時刻は `dateKey` の日のアプリの各時刻（夏時間の切り替わりもその日で計算）
 */
export function TimeGutter({ dateKey }: { dateKey: string }) {
  const extra = useTaskStore((s) => s.extraTimeZones)
  // 設定でアプリのタイムゾーンを変えたら引き直す
  const appZoneSetting = useTaskStore((s) => s.appTimeZone)
  const columns = useMemo(() => {
    const zone = appTimeZone()
    return extra.map((tz) =>
      HOURS.map((h) => {
        const { time } = wallInZone(instantFromWall(dateKey, `${String(h).padStart(2, '0')}:00`, zone), tz)
        return `${Number(time.slice(0, 2))}:${time.slice(3)}`
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appZoneSetting は appTimeZone() の中身
  }, [extra, dateKey, appZoneSetting])

  return (
    <div className="flex flex-shrink-0">
      {columns.map((labels, i) => (
        <div key={extra[i]} style={{ width: EXTRA_WIDTH }} className="relative">
          {labels.map((label, h) => (
            <div key={h} className={`${labelClass} right-1.5 text-zinc-400/80 dark:text-zinc-500/80`} style={{ top: h * HOUR_HEIGHT - 6 }}>
              {h > 0 ? label : ''}
            </div>
          ))}
        </div>
      ))}
      <div style={{ width: PRIMARY_WIDTH }} className="relative">
        {HOURS.map((h) => (
          <div key={h} className={`${labelClass} right-2 text-zinc-400 dark:text-zinc-500`} style={{ top: h * HOUR_HEIGHT - 6 }}>
            {h > 0 ? formatTimeLabel(h) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 時間バーの上の見出し（他のタイムゾーンがあるときだけ、どの列がどのタイムゾーンか） */
export function TimeGutterHeader({ dateKey }: { dateKey: string }) {
  const extra = useTaskStore((s) => s.extraTimeZones)
  useTaskStore((s) => s.appTimeZone)
  const width = useTimeGutterWidth()
  if (extra.length === 0) return <div style={{ width }} className="flex-shrink-0" />
  const at = instantFromWall(dateKey, '12:00', appTimeZone())
  return (
    <div style={{ width }} className="flex flex-shrink-0 items-end pb-1 text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
      {extra.map((tz) => (
        <span key={tz} style={{ width: EXTRA_WIDTH }} className="truncate pr-1.5 text-right" title={tz}>
          {gmtLabel(tz, at)}
        </span>
      ))}
      <span style={{ width: PRIMARY_WIDTH }} className="truncate pr-2 text-right font-medium" title={appTimeZone()}>
        {gmtLabel(appTimeZone(), at)}
      </span>
    </div>
  )
}
