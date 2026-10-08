import { useMemo } from 'react'
import { useTaskStore } from '../store/taskStore'
import { dayLoad, type DayLoad } from '../lib/dayLoad'
import { unplannedListIds } from '../lib/listKind'

/**
 * 日（`yyyy-MM-dd`）ごとの空きと置いた To-Do（`dayLoad`）。週の見出しと今日の計画の「予定 / 空き」で共有し、
 * 同じ日なら必ず同じ数字になるよう、タスク・Google の予定・目安・数えないリストをここで 1 回だけ集める
 */
export function useDayLoads(dateKeys: readonly string[]): ReadonlyMap<string, DayLoad> {
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const lists = useTaskStore((s) => s.lists)
  const capacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  // 呼ぶ側は毎回配列を作り直すので、中身で依存を取る
  const keysSignature = dateKeys.join(',')
  return useMemo(() => {
    const excludedListIds = unplannedListIds(lists)
    const out = new Map<string, DayLoad>()
    for (const key of keysSignature ? keysSignature.split(',') : []) {
      out.set(key, dayLoad(tasks, calendarEvents, key, { capacityMinutes, excludedListIds }))
    }
    return out
  }, [keysSignature, tasks, calendarEvents, lists, capacityMinutes])
}
