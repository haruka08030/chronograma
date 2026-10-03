import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../icons'

/** 見出しの役割で色を変える。alert＝やり残しなど焦らせてよいもの、default＝候補、muted＝完了など */
export type DisclosureTone = 'alert' | 'default' | 'muted'

const TONE: Record<DisclosureTone, { text: string; chevron: string }> = {
  alert: {
    text: 'font-medium text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30',
    chevron: '',
  },
  default: {
    text: 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
    chevron: 'text-zinc-400',
  },
  muted: {
    text: 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300',
    chevron: '',
  },
}

/**
 * 開閉する見出し（今日の計画・To-Do の「完了」などで共通）。小さな ＞ が開くと下を向く。
 * 中身は使う側で `open` のときだけ描く。
 */
export function DisclosureButton({
  open,
  onToggle,
  tone = 'default',
  className = '',
  children,
}: {
  open: boolean
  onToggle: () => void
  tone?: DisclosureTone
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${TONE[tone].text} ${className}`}
    >
      <ChevronRightIcon className={`h-3 w-3 shrink-0 transition-transform ${TONE[tone].chevron} ${open ? 'rotate-90' : ''}`} strokeWidth={2.5} />
      {children}
    </button>
  )
}
