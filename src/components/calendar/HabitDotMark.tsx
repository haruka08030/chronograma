import { CheckIcon } from '../icons'

/** 習慣の丸の状態: 達成（塗り＋✓）・今日のまだ（色の縁＋薄い塗り）・先の日（細い縁を薄く）・やらずに過ぎた日（灰色） */
export type DotState = 'done' | 'today' | 'future' | 'missed'

/** ダークでは縁の色を白に寄せて持ち上げる（紫・藍が暗い背景に沈まないよう、背景に対して 3:1 以上） */
const RING = 'border-[var(--c)] dark:border-[color-mix(in_srgb,var(--c)_70%,white)]'

/**
 * 習慣の段・その日の一覧で共有する習慣の丸の見た目（12px、`large` は 16px）。
 * - 達成: gc-dot の塗り＋✓
 * - 今日のまだ: 2px の色の縁＋色 20% の薄い塗り
 * - 先の日: 1px の色の縁を半分の濃さで（ダークは沈まないよう 62%、一覧・1 日表示は 70%）
 * - やらずに過ぎた日: 段は直径 6px の灰色の点。一覧（`list`）では後から ✓ できるよう灰色の縁の丸
 */
export function HabitDotMark({ state, large = false, list = false }: { state: DotState; large?: boolean; list?: boolean }) {
  const size = large ? 'h-4 w-4' : 'h-3 w-3'
  if (state === 'done')
    return (
      <span aria-hidden data-dot-state={state} className={`gc-dot ${RING} flex ${size} shrink-0 items-center justify-center rounded-full`}>
        <CheckIcon className={large ? 'h-2.5 w-2.5' : 'h-2 w-2'} strokeWidth={3.5} />
      </span>
    )
  if (state === 'missed')
    return list ? (
      <span
        aria-hidden
        data-dot-state={state}
        className={`${size} shrink-0 rounded-full border-[1.5px] border-[#a1a1aa] dark:border-[#8e8e93]`}
      />
    ) : (
      <span aria-hidden data-dot-state={state} className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a1a1aa] dark:bg-[#8e8e93]" />
    )
  return (
    <span
      aria-hidden
      data-dot-state={state}
      className={`${size} shrink-0 rounded-full ${RING} ${
        state === 'today'
          ? 'border-2 bg-[color-mix(in_srgb,var(--c)_20%,transparent)]'
          : `border ${list ? 'opacity-70' : 'opacity-50 dark:opacity-[0.62]'}`
      }`}
    />
  )
}
