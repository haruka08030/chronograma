import type { ReactNode } from 'react'

/** 設定のまとまり。見出しは枠の外、中身は 1 枚の枠に行を区切り線で並べる */
export function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="px-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {description && <p className="mt-0.5 px-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </section>
  )
}

/** 1 行: 左にラベルと説明、右に操作 */
export function SettingsRow({
  label,
  help,
  children,
  htmlFor,
}: {
  label: ReactNode
  help?: ReactNode
  children?: ReactNode
  htmlFor?: string
}) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <Label {...(htmlFor ? { htmlFor } : {})} className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-800 dark:text-zinc-200">{label}</span>
        {help && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{help}</span>}
      </Label>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

/** オン/オフ */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-accent-600' : 'bg-zinc-300 dark:bg-zinc-600'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-0.5 bg-white'}`} />
    </button>
  )
}


/** 連携の設定で貼るトークン・URL などの入力欄 */
export const settingsFieldClass =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-accent-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
