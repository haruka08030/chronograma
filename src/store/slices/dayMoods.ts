/** 1 日の気分とひとこと（#324）。「1 日を締める」で記号を押す・一言を書く */
import { cleanMoodNote, isEmptyDayMood } from '../../lib/dayMood'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type DayMoodActions = Pick<TaskState, 'setDayMood'>

export function createDayMoodsSlice({ set, get }: SliceContext): DayMoodActions {
  return {
    setDayMood: (dateKey, patch) => {
      const cur = get().dayMoods[dateKey]
      const mood = patch.mood !== undefined ? patch.mood : (cur?.mood ?? null)
      const note = patch.note !== undefined ? cleanMoodNote(patch.note) : (cur?.note ?? '')
      // 同じ中身なら時刻を付けない（同期で送り直さない）。まだ無い日を空のまま作らない
      if (cur ? cur.mood === mood && cur.note === note : isEmptyDayMood({ mood, note })) return
      // 時刻はこの端末で変えた時刻。もとにしたサーバーの版はそのまま（次の同期でそれをもとに送る）
      set((s) => ({
        dayMoods: { ...s.dayMoods, [dateKey]: { mood, note, updatedAt: new Date().toISOString(), syncedAt: cur?.syncedAt ?? null } },
      }))
    },
  }
}
