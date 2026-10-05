import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { PlusIcon } from '../icons'
import { useTextEntry } from '../../hooks/useTextEntry'

/**
 * 一覧の上・カレンダーの中・サブタスクの「追加」欄（どこでも同じ見た目と動き）。
 * 細い枠に ＋ と文字。押すと薄い背景。Enter で追加して続けて書ける、Esc で書いた分を消す。
 * 外したとき: 既定は書いた分を欄に残すだけ。開いて使う欄（カレンダーの中・サブタスク）は `onBlurSubmit` で足す。
 * `size="sm"` は月のマス・週の終日行の小さい版（＋ なし）。
 */
export const InlineAddInput = forwardRef<
  HTMLInputElement,
  {
    value: string
    onValueChange: (value: string) => void
    onSubmit: () => void
    /** Esc。省略時は書いた分を消してフォーカスを外す */
    onCancel?: () => void
    onBlurSubmit?: () => void
    /** ＋ の代わりの印（いつかは ☆） */
    icon?: ReactNode
    size?: 'md' | 'sm'
    /** 枠の代わりに下線だけ（今日の計画の追加欄） */
    underline?: boolean
    className?: string
  } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onKeyDown' | 'size' | 'className'>
>(function InlineAddInput(
  { value, onValueChange, onSubmit, onCancel, onBlurSubmit, icon, size = 'md', underline = false, className = '', onBlur, ...inputProps },
  ref,
) {
  const entry = useTextEntry({
    onSubmit,
    onCancel: () => {
      if (onCancel) return onCancel()
      onValueChange('')
      ;(document.activeElement as HTMLElement | null)?.blur()
    },
    commitOnBlur: false,
    onBlurSubmit,
  })
  const input = (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={entry.onKeyDown}
      onBlur={(e) => {
        entry.onBlur()
        onBlur?.(e)
      }}
      className={`min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'py-2.5 text-[15px]'
      }`}
      {...inputProps}
    />
  )
  return (
    <div
      className={`flex items-center transition-colors ${
        underline
          ? 'border-b border-zinc-200 focus-within:border-zinc-500 dark:border-zinc-700 dark:focus-within:border-zinc-400'
          : `border border-zinc-200 bg-white focus-within:border-zinc-300 focus-within:bg-zinc-50 focus-within:ring-2 focus-within:ring-accent-500/30
               dark:border-zinc-700 dark:bg-transparent dark:focus-within:border-zinc-600 dark:focus-within:bg-zinc-800/60 ${size === 'sm' ? 'rounded' : 'rounded-lg'}`
      } ${size === 'sm' ? '' : 'gap-3 px-3'} ${className}`}
    >
      {size === 'md' && (icon ?? <PlusIcon className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" />)}
      {input}
    </div>
  )
})
