import { useCallback } from 'react'
import { useTaskStore } from '../../store/taskStore'

/**
 * 習慣の段・その日の一覧の丸の ✓ / 取り消し。押し間違えてもすぐ戻せるよう、必ず「元に戻す」付きのトーストを出す。
 * ストアが自分でトーストを出したとき（予定どおりの記録を作った・記録をゴミ箱へ入れた）はそれに任せ、
 * 出さなかったとき（時間なしの達成・取り消し）だけ「達成にしました / 取り消しました」を出す。何も変わらなければ出さない
 */
export function useHabitToggle() {
  return useCallback((habitId: string, dateKey: string) => {
    const before = useTaskStore.getState()
    const habit = before.habits.find((h) => h.id === habitId)
    if (!habit) return
    before.toggleHabitDate(habitId, dateKey)
    const after = useTaskStore.getState()
    if (after.habits === before.habits && after.tasks === before.tasks) return
    if (after.undoBanner !== before.undoBanner || after.recentDeletes !== before.recentDeletes) return
    const done = after.habits.find((h) => h.id === habitId)?.completedDates.includes(dateKey) ?? false
    useTaskStore.setState({
      undoBanner: {
        text: { key: done ? 'undo.habitChecked' : 'undo.habitUnchecked', params: { name: habit.title } },
        at: Date.now(),
        undoId: after.lastUndoId() ?? undefined,
      },
    })
  }, [])
}
