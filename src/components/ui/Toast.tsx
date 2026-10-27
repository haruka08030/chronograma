import type { ReactNode } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { INVERSE_SURFACE } from './surface'
import { FLOAT_BOTTOM, FLOAT_BOTTOM_ABOVE_TIMER } from './toastClass'

/**
 * トーストの置き場（App に 1 つ）。元に戻す・移動・Canvas の提出済みのトーストを下から縦に積むので、同時に出ても重ならない。
 * 置き場は押下を通し、トーストの面だけが押せる
 */
export function ToastStack({ children }: { children: ReactNode }) {
  const timerOpen = useTaskStore((s) => s.activeTimer !== null)
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex flex-col-reverse items-center gap-2 px-3 ${timerOpen ? FLOAT_BOTTOM_ABOVE_TIMER : FLOAT_BOTTOM}`}
    >
      {children}
    </div>
  )
}

/**
 * トースト 1 枚（濃い色の面・角・文字の大きさ・出入りの動き・読み上げ `role="status"` を共通にする）。
 * `closing` は `usePresence` の閉じる動きの間（押せないようにして沈める）
 */
export function Toast({ closing, children }: { closing: boolean; children: ReactNode }) {
  return (
    <div
      role="status"
      inert={closing}
      className={`pointer-events-auto flex w-max max-w-[min(100vw-1.5rem,32rem)] items-center gap-3 rounded-xl px-4 py-3 text-sm ${INVERSE_SURFACE} ${
        closing ? 'animate-toast-out' : 'animate-toast-in'
      }`}
    >
      {children}
    </div>
  )
}
