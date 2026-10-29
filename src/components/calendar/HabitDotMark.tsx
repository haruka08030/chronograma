import { CheckIcon } from '../icons'
import { HABIT_DONE_FILL, HABIT_MISSED, HABIT_OFF_TIME_FILL, HABIT_PENDING } from '../../lib/habitMark'

/** 習慣の丸の状態: 達成・時間外（やったが決めた時間とは違う時間）・今日のまだ・先の日（まだ押せない）・やらずに過ぎた日 */
export type DotState = 'done' | 'offTime' | 'today' | 'future' | 'missed'

/**
 * カレンダーの習慣の段・その日の一覧の習慣の丸（12px、`large` は 16px）。見た目は習慣画面・今日画面と同じ `gc-mark*`（`lib/habitMark`）:
 * - 達成: 薄い塗り＋その色の輪＋✓（`gc-mark-done`）
 * - 時間外: その色の点線の輪＋✓（`gc-mark-off`）
 * - 今日のまだ: その色の細い輪（`gc-mark`）
 * - 先の日・まだの時刻: 同じ輪を薄く（押しても何もしない）
 * - やらずに過ぎた日: 灰の細い輪（`gc-mark-missed`。後から ✓ できる）
 */
export function HabitDotMark({ state, large = false }: { state: DotState; large?: boolean }) {
  const size = large ? 'h-4 w-4' : 'h-3 w-3'
  const mark =
    state === 'done'
      ? HABIT_DONE_FILL
      : state === 'offTime'
        ? HABIT_OFF_TIME_FILL
        : state === 'missed'
          ? HABIT_MISSED
          : `${HABIT_PENDING} ${state === 'future' ? 'opacity-50' : ''}`
  return (
    <span aria-hidden data-dot-state={state} className={`${mark} flex ${size} shrink-0 items-center justify-center rounded-full`}>
      {(state === 'done' || state === 'offTime') && <CheckIcon className={large ? 'h-2.5 w-2.5' : 'h-2 w-2'} strokeWidth={3.5} />}
    </span>
  )
}
