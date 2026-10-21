import { isHabitDeleted, type Habit } from '../types/habit'
import type { TaskState } from './storeTypes'

let lastHabits: Habit[] | null = null
let lastLive: Habit[] = []

/**
 * ゴミ箱に無い習慣（アーカイブしたものは含む）。習慣を出す画面・統計はここから読む。
 * 同じ `habits` には同じ配列を返す（`useTaskStore(selectLiveHabits)` で描き直しを増やさない）
 */
export function selectLiveHabits(s: Pick<TaskState, 'habits'>): Habit[] {
  if (s.habits !== lastHabits) {
    lastHabits = s.habits
    lastLive = s.habits.some(isHabitDeleted) ? s.habits.filter((h) => !isHabitDeleted(h)) : s.habits
  }
  return lastLive
}
