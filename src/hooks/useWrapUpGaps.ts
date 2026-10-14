import { useMemo, useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import { useNow } from './useAppClock'
import { logLimitAt } from '../lib/timelineBlockEdit'
import { unplannedListIds } from '../lib/listKind'
import { logsOnDay, unrecordedGapsForDay, type MinuteSpan } from '../lib/unrecordedGaps'
import { gapKey, loadIdleGaps, pickWrapUpGaps, saveIdleGaps } from '../lib/wrapUpGaps'

/** その日の記録の無い時間（今日の見出しの「記録なし」・タイムラインの点線の枠と同じ） */
function useDayGaps(dateKey: string): MinuteSpan[] {
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const nowMinute = Math.floor(useNow().getTime() / 60_000)
  return useMemo(() => {
    const limit = logLimitAt(new Date(nowMinute * 60_000))
    return unrecordedGapsForDay(logsOnDay(tasks, dateKey, unplannedListIds(lists)), dateKey, limit(dateKey), activeTimer)
  }, [tasks, lists, dateKey, activeTimer, nowMinute])
}

/**
 * 1 日の締めの記録の無い時間（#418）。「何もしていない」にしたものを除いた抜けと、その日の締めで隠した抜けの印を返す
 */
export function useWrapUpGaps(dateKey: string) {
  const gaps = useDayGaps(dateKey)
  const [idle, setIdle] = useState(() => ({ dateKey, keys: loadIdleGaps(dateKey) }))
  // 日が変わったら（見ている日を移した・0 時をまたいだ）その日の分を読み直す
  const keys = idle.dateKey === dateKey ? idle.keys : loadIdleGaps(dateKey)
  const picked = useMemo(() => pickWrapUpGaps(gaps, keys), [gaps, keys])
  const markIdle = (g: MinuteSpan) => {
    const next = new Set(keys).add(gapKey(g))
    saveIdleGaps(dateKey, next)
    setIdle({ dateKey, keys: next })
  }
  return { ...picked, markIdle }
}
