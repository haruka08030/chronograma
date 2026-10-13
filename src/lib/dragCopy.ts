import { useSyncExternalStore } from 'react'
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'

/**
 * カレンダーで ⌥（Windows は Alt）を押しながらドラッグすると、元は動かさずに置いた先へ複製する（Google カレンダーと同じ、#398）。
 * ポインタのドラッグ（時間の格子）は離したときの位置しか渡さないので、押しているかはここで覚えておく。
 * ネイティブの D&D（月のマス・終日の行）は drop の `altKey` を見る
 */
let held = false
const subscribers = new Set<() => void>()

function setHeld(next: boolean) {
  if (next === held) return
  held = next
  subscribers.forEach((f) => f())
}

if (typeof window !== 'undefined') {
  const read = (e: KeyboardEvent | MouseEvent) => setHeld(e.altKey)
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'dragover'] as const) {
    window.addEventListener(type, read as EventListener, { capture: true, passive: true })
  }
  window.addEventListener('blur', () => setHeld(false))
}

/** 今 ⌥ を押しているか（ドラッグを離したときに読む） */
export function isCopyModifierHeld(): boolean {
  return held
}

/** ネイティブの D&D を落としたときに複製にするか（drop の `altKey`。無いときはドラッグ中の dragover で覚えた状態） */
export function isCopyDrop(e: { altKey?: boolean }): boolean {
  return e.altKey === true || held
}

/** ⌥ を押しているか（押している間は動かしている元を薄くしない・カーソルをコピーにする） */
export function useCopyModifier(): boolean {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f)
      return () => {
        subscribers.delete(f)
      }
    },
    () => held,
    () => false,
  )
}

/** 複製して置けるか（記録・睡眠・Google の予定・習慣の枠は複製しない） */
export function canCopyOnDrop(taskId: string): boolean {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
  return !!task && !isLogTask(task)
}

/**
 * `ids` を複製し、複製を `placeAt` の日時に置く（元はそのまま）。1 回の取り消しで戻り、トーストは複製の文。複製した id を返す
 */
export function placeCopies(ids: readonly string[], placeAt: (task: Task) => Partial<Task>): string[] {
  return useTaskStore.getState().duplicateTasks(ids.filter(canCopyOnDrop), placeAt)
}
