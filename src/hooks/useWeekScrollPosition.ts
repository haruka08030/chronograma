import { useEffect, type RefObject } from 'react'
import { startOfWeek } from 'date-fns'
import { HOUR_HEIGHT } from '../lib/timeGrid'
import { isAppToday, zonedNow, isNowOnDay } from '../lib/timeZone'
import { toDateKey } from '../lib/dateKey'

/** 週タイムラインを開いた・表示する週が変わったときの縦スクロールの位置（今・朝・夕方） */
export function useWeekScrollPosition({
  scrollRef,
  keepScrollOnFlipRef,
  anchor,
  days,
  singleDay,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  /** ドラッグ中に週をめくったとき true。次の 1 回はスクロールを保つ */
  keepScrollOnFlipRef: RefObject<boolean>
  anchor: Date
  days: Date[]
  singleDay: boolean
}) {
  /**
   * 日を押すと親が anchor を作り直すので、anchor そのものではなく「表示している週（1 日表示なら日）」が
   * 変わったときだけスクロールを合わせる。でないと朝や夜で押した瞬間に今の時刻へ戻されてしまう
   */
  const scrollKey = toDateKey(singleDay ? anchor : startOfWeek(anchor, { weekStartsOn: 1 }))
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 1 日表示で今日なら「今」が上から少し下に来るように。それ以外は朝から
    const now = zonedNow()
    const showNow = singleDay ? isNowOnDay(anchor) : days.some((d) => isNowOnDay(d))
    // 夜中（区切りの前）に前の日を開いたときは、夜の予定・記録が見えるよう夕方から
    const lateNight = !showNow && (singleDay ? isAppToday(anchor) : days.some((d) => isAppToday(d)))
    const hours = showNow ? Math.max(0, now.getHours() + now.getMinutes() / 60 - 1.5) : lateNight ? 17 : 7.5
    // ドラッグ中に週をめくったときは、つかんだ位置がずれないようスクロールを保つ
    if (keepScrollOnFlipRef.current) {
      keepScrollOnFlipRef.current = false
      return
    }
    const top = HOUR_HEIGHT * hours
    // 隠れている間（スマホの「やること」タブ）は scrollTop が効かないので、見えた時点で合わせる
    if (el.clientHeight > 0) {
      el.scrollTop = top
      return
    }
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === 0) return
      el.scrollTop = top
      ro.disconnect()
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 表示週が変わったときだけ合わせる
  }, [singleDay, scrollKey])
}
