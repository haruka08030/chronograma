import { isHabitActive, isHabitDeleted, isHabitRestOn, isRoutine, type Habit } from '../types/habit'
import { courseKey } from './courseLinks'
import { habitDayStatus, type HabitRecordIndex } from './habitTiming'
import { isHabitEndedOn } from '../../supabase/functions/_shared/dayResult.ts'
import { habitPastRuleOn } from '../../supabase/functions/_shared/habitTiming.ts'

/** 予定の作成カードに出す習慣の候補の数 */
export const HABIT_SUGGEST_MAX = 3

/**
 * 予定の作成カードで打った題名に名前の合う習慣（選ぶとその日の習慣の枠になる、`placeHabitAt`）。
 * 名前は全角半角・大文字小文字・空白の違いを同じに数え、同じ名前 → 前が合う → 含む の順（同じなら習慣の順）。
 * ルーティン・アーカイブ・ゴミ箱・その日が休み・作る前・やめた日から先の習慣と、その日に済んだ習慣は出さない
 */
export function habitsMatchingTitle(
  habits: readonly Habit[],
  title: string,
  dateKey: string,
  records: HabitRecordIndex,
  max: number = HABIT_SUGGEST_MAX,
): Habit[] {
  const q = courseKey(title)
  if (!q) return []
  const rank = (h: Habit) => {
    const name = courseKey(h.title)
    return name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1
  }
  return habits
    .filter(
      (h) =>
        !isRoutine(h) &&
        isHabitActive(h) &&
        !isHabitDeleted(h) &&
        !isHabitEndedOn(h, dateKey) &&
        !isHabitRestOn(h, dateKey) &&
        !habitPastRuleOn(h, dateKey)?.off &&
        rank(h) >= 0 &&
        habitDayStatus(h, dateKey, records) === 'missed',
    )
    .map((h, i) => ({ h, i, r: rank(h) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.h)
}
