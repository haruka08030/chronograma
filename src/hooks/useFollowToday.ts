import { useEffect, useRef } from 'react'
import { useTaskStore } from '../store/taskStore'
import { useAppTodayKey } from './useAppClock'

/**
 * 開いたまま日をまたいだら、今日を見ていた画面の「見ている日」を新しい今日へ進める（今日の計画・カレンダー・習慣でそれぞれ）。
 * 前後の日を自分で選んでいた画面は動かさない。App に 1 つ置く
 */
export function useFollowToday(): void {
  const todayKey = useAppTodayKey()
  const prev = useRef(todayKey)
  useEffect(() => {
    const before = prev.current
    prev.current = todayKey
    if (before === todayKey) return
    const s = useTaskStore.getState()
    if (s.plannerDateKey === before) s.setPlannerDateKey(todayKey)
    if (s.selectedCalendarDateKey === before) s.setSelectedCalendarDateKey(todayKey)
    if (s.habitsDateKey === before) s.setHabitsDateKey(todayKey)
  }, [todayKey])
}
