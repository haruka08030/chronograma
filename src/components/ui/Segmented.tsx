/**
 * 2〜3 択の切り替え（テーマ・言語・月/週・予定/記録・やること/タイムライン）。
 * 灰色の溝の中で、選んでいるものだけ白く浮かせる。アプリ中で同じ見た目にする。
 * - role: 表示を切り替えるタブなら 'tab'、設定値を選ぶなら 'radio'
 * - size: md はスマホの画面切り替えなど、指で押す大きめのもの
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  role = 'radio',
  size = 'sm',
  fullWidth = false,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel: string
  role?: 'radio' | 'tab'
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
}) {
  return (
    <div
      role={role === 'tab' ? 'tablist' : 'radiogroup'}
      aria-label={ariaLabel}
      className={`${fullWidth ? 'flex' : 'inline-flex'} rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800 ${className}`}
    >
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role={role}
            {...(role === 'tab' ? { 'aria-selected': selected } : { 'aria-checked': selected })}
            onClick={() => onChange(o.value)}
            className={`rounded-md font-medium transition-colors touch-manipulation ${
              size === 'md' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1.5 text-xs'
            } ${fullWidth ? 'flex-1' : ''} ${
              selected
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
