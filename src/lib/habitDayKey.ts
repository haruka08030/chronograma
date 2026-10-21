/** 達成を待っている習慣の鍵（押した日で達成にするので、日を変えてもずれないよう「id|日付」。`useDeferredComplete`） */
export const habitDayKey = (habitId: string, dateKey: string) => `${habitId}|${dateKey}`

export function splitHabitDayKey(key: string): [habitId: string, dateKey: string] {
  const at = key.lastIndexOf('|')
  return [key.slice(0, at), key.slice(at + 1)]
}
