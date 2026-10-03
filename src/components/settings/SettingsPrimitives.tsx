import type { ReactNode } from 'react'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { HINT_TEXT } from '../ui/textClass'

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
      <h2 className={`px-1 ${CARD_TITLE_CLASS}`}>{title}</h2>
      {description && <p className={`mt-0.5 px-1 ${HINT_TEXT}`}>{description}</p>}
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
      {/* 見出しは 4rem より細くしない。操作が入りきらなければ、見出しを潰さず操作を次の行へ回す */}
      <Label {...(htmlFor ? { htmlFor } : {})} className="min-w-0 flex-1 basis-16">
        <span className="block text-sm text-zinc-800 dark:text-zinc-200">{label}</span>
        {help && <span className={`mt-0.5 block ${HINT_TEXT}`}>{help}</span>}
      </Label>
      {children && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{children}</div>}
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

