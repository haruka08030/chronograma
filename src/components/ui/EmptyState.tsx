import type { ReactNode } from 'react'

/**
 * 画面・パネルがまるごと空のとき（線のアイコン＋中央）。一覧の途中の一言（「この日の予定はなし」など）には使わない。
 * - lg: 画面（To-Do・ゴミ箱・検索・いつか・習慣）
 * - sm: パネルの中（日パネル・時間未定のタスク）
 * アイコンは線のアイコンを `strokeWidth={1}` で渡す（大きさと色はここで決める）。
 */
export function EmptyState({
  icon,
  title,
  hint,
  size = 'lg',
  className = '',
}: {
  icon: ReactNode
  title: ReactNode
  hint?: ReactNode
  size?: 'lg' | 'sm'
  className?: string
}) {
  const lg = size === 'lg'
  return (
    <div className={`text-center ${lg ? 'py-16' : 'py-8'} ${className}`}>
      <span
        aria-hidden
        className={`mx-auto block text-zinc-200 dark:text-zinc-700 [&>svg]:h-full [&>svg]:w-full ${lg ? 'mb-4 h-16 w-16' : 'mb-2 h-8 w-8'}`}
      >
        {icon}
      </span>
      <p className={`mx-auto max-w-xs leading-relaxed text-zinc-400 dark:text-zinc-500 ${lg ? 'text-sm' : 'text-xs'}`}>{title}</p>
      {hint && <p className={`mx-auto mt-1 max-w-xs text-zinc-300 dark:text-zinc-600 ${lg ? 'text-xs' : 'text-[11px]'}`}>{hint}</p>}
    </div>
  )
}
