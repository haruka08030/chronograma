import type { ReactNode } from 'react'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { HINT_TEXT } from '../ui/textClass'
import { ChevronRightIcon, ExternalLinkIcon } from '../icons'

/** 設定のまとまり。見出しは枠の外、中身は 1 枚の枠に行を区切り線で並べる */
export function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id?: string
  /** 無ければ見出しを出さず枠だけ（「統計 ›」のように行の名前だけで分かるもの） */
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6">
      {title && <h2 className={`px-1 ${CARD_TITLE_CLASS}`}>{title}</h2>}
      {description && <p className={`mt-0.5 px-1 ${HINT_TEXT}`}>{description}</p>}
      <div
        className={`${title || description ? 'mt-2' : ''} divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900`}
      >
        {children}
      </div>
    </section>
  )
}

const LINK_ROW_CLASS =
  'flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50'

/**
 * 行ごと押して先へ進む 1 行。`onClick` は次のページ・画面（右に ›）、`href` は別のタブで開くページ（右に ↗）。
 * 連携の「管理」、ラベルの編集、規約など
 */
export function SettingsLinkRow({
  label,
  hint,
  ...to
}: { label: ReactNode; hint?: ReactNode } & ({ onClick: () => void } | { href: string })) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="block text-sm text-zinc-800 dark:text-zinc-200">{label}</span>
      {hint && <span className={`mt-0.5 block ${HINT_TEXT}`}>{hint}</span>}
    </span>
  )
  if ('href' in to) {
    return (
      <a href={to.href} target="_blank" rel="noopener" className={LINK_ROW_CLASS}>
        {body}
        <ExternalLinkIcon className="h-4 w-4 shrink-0 text-zinc-400" />
      </a>
    )
  }
  return (
    <button type="button" onClick={to.onClick} className={LINK_ROW_CLASS}>
      {body}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
    </button>
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

/** 読み込み中の行。文字の代わりに灰色の帯を置き、読み込めたときに行の高さが変わらないようにする */
export function SettingsLoadingRow({ label }: { label: string }) {
  return (
    <SettingsRow
      label={
        <span role="status" aria-label={label} className="block h-4 w-32 rounded bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
      }
    />
  )
}

/** オン/オフ */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
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
      <span
        className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-0.5 bg-white'}`}
      />
    </button>
  )
}
