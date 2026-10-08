import { useState, type ReactNode } from 'react'
import { ActionMenu, type ActionEntry } from './ActionMenu'
import { FilterIcon, SortIcon } from '../icons'

/** 見出しの脇の小さなボタン。押すとその下にメニュー（他のメニューと同じ部品。スマホは下から出すシート） */
function MenuButton({
  children,
  entries,
  ariaLabel,
  active = false,
  iconOnly = false,
}: {
  children: ReactNode
  entries: ActionEntry[]
  ariaLabel?: string
  /** 選んでいるものがある（絞り込み中）。濃くして分かるように */
  active?: boolean
  /** アイコンだけ（スマホでも指で押せる 40px 四方に） */
  iconOnly?: boolean
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const tone = active
    ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
    : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        aria-label={ariaLabel}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenu(menu ? null : { x: r.left, y: r.bottom + 4 })
        }}
        // スマホは指で押せる高さ（40px）に。PC は見出しの脇に小さく
        className={`flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg py-1.5 text-xs transition-colors md:min-h-0 ${
          iconOnly ? 'min-w-10 justify-center px-2 md:min-w-0' : 'px-3'
        } ${tone}`}
      >
        {children}
      </button>
      {menu && <ActionMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} searchable={false} />}
    </>
  )
}

/** 並び順のボタン（To-Do 一覧の見出し・今日やる候補で共通）。今の並び順を出し、押すと並び順のメニュー */
export function SortMenuButton({ label, entries, ariaLabel }: { label: string; entries: ActionEntry[]; ariaLabel?: string }) {
  return (
    <MenuButton entries={entries} ariaLabel={ariaLabel}>
      <SortIcon className="w-3.5 h-3.5" />
      {label}
    </MenuButton>
  )
}

/** 絞り込みのボタン（じょうご）。絞り込み中は濃くする */
export function FilterMenuButton({ entries, ariaLabel, active }: { entries: ActionEntry[]; ariaLabel: string; active: boolean }) {
  return (
    <MenuButton entries={entries} ariaLabel={ariaLabel} active={active} iconOnly>
      <FilterIcon className="w-3.5 h-3.5" />
    </MenuButton>
  )
}
