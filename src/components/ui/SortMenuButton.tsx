import { useState } from 'react'
import { ActionMenu, type ActionEntry } from './ActionMenu'
import { SortIcon } from '../icons'

/**
 * 並び順のボタン（To-Do 一覧の見出し・今日やる候補で共通）。今の並び順を出し、押すと並び順・絞り込みのメニュー。
 * スマホは指で押せる高さ（40px）に、PC は見出しの脇に小さく
 */
export function SortMenuButton({ label, entries, ariaLabel }: { label: string; entries: ActionEntry[]; ariaLabel?: string }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
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
        className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 md:min-h-0 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <SortIcon className="w-3.5 h-3.5" />
        {label}
      </button>
      {/* 他のメニューと同じ部品（スマホは下から出すシート） */}
      {menu && <ActionMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} searchable={false} />}
    </>
  )
}
