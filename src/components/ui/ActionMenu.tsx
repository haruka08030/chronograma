import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { POPOVER_PANEL } from './surface'
import { MenuDivider, MenuItem, MenuLabel } from './Menu'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../icons'
import { useIsCoarsePointer, useIsDesktop } from '../../hooks/useMediaQuery'

/** 画面の端からはみ出さないための余白 */
const EDGE = 8
/** 項目に乗せてから中のメニューが開くまで（斜めに通り過ぎただけで切り替わらないように） */
const SUB_OPEN_DELAY_MS = 120

/** 押すと実行する項目 */
export type ActionLeaf = {
  id: string
  label: string
  /** 検索結果で前に付ける「期限」「移動」など */
  group?: string
  icon?: ReactNode
  /** 右端に出す日付など */
  hint?: string
  /** 右端に出すショートカット（キーボードのある PC だけ） */
  keys?: string
  danger?: boolean
  checked?: boolean
  /** 上に区切り線 */
  divider?: boolean
  run: () => void
}

/** 横に開く中のメニュー */
export type ActionSub = {
  id: string
  label: string
  icon?: ReactNode
  /** 右の › の前に出す今の値（「締切 ›」の「今日 18:00」など） */
  hint?: string
  divider?: boolean
  leaves: ActionLeaf[]
  /** 項目の下に足すもの（カレンダー・色の一覧など）。`close` で閉じる */
  extra?: (close: () => void) => ReactNode
  /** 中のメニューの幅（カレンダーを入れるときは広く） */
  width?: 'md' | 'lg'
}

export type ActionEntry = ({ kind: 'leaf' } & ActionLeaf) | ({ kind: 'sub' } & ActionSub)

function LeafRow({
  leaf,
  active,
  onHover,
  onRun,
  withGroup = false,
}: {
  leaf: ActionLeaf
  active: boolean
  onHover: () => void
  onRun: () => void
  withGroup?: boolean
}) {
  return (
    <MenuItem
      icon={leaf.icon}
      hint={leaf.hint}
      keys={leaf.keys}
      checked={leaf.checked}
      danger={leaf.danger}
      active={active}
      onMouseEnter={onHover}
      onClick={onRun}
    >
      {withGroup && leaf.group && <span className="text-zinc-400 dark:text-zinc-500">{leaf.group} › </span>}
      {leaf.label}
    </MenuItem>
  )
}

/**
 * 右クリックで出すメニュー（タスク・予定・Google の予定・リスト・セクションで共通。Notion のブロックメニューのように）。
 * - 開くと検索欄に入るので、そのまま打って絞り込める（中のメニューの項目も出る）
 * - ↑↓ で選ぶ、→ / Enter で中のメニュー、← で戻る、Esc で閉じる。項目を実行すると閉じる
 * - 押した所に出し、画面からはみ出すなら内側へ寄せる。`above` なら (x, y) の上に出す（スマホの下のボタンから開くとき）
 * - タッチの狭い画面（スマホ）では下から出すシート: 行は 44px 以上、中のメニューは同じシートの中で切り替え（‹ で戻る）、
 *   削除など危ない項目は区切って離す。検索欄は出さない（項目は見て押す）
 */
export function ActionMenu({
  x,
  y,
  above = false,
  header,
  note,
  entries,
  onClose,
  searchable = true,
}: {
  x: number
  y: number
  above?: boolean
  /** 何についてのメニューか（タスク名・「3 件のタスク」など） */
  header?: string
  /** 見出しの下に添えるもの（指で行を押したときのシートのメモ） */
  note?: ReactNode
  entries: ActionEntry[]
  onClose: () => void
  /** 項目が少ないメニューは検索欄を出さない */
  searchable?: boolean
}) {
  const { t } = useTranslation()
  const coarse = useIsCoarsePointer()
  const desktop = useIsDesktop()
  const sheet = coarse && !desktop
  const showSearch = searchable && !sheet
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [sub, setSub] = useState<string | null>(null)
  /** 中のメニューで選んでいる項目。-1 は外側のメニューを操作中 */
  const [subActive, setSubActive] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const subTimer = useRef(0)
  useDismiss({ open: true, onClose, inside: [menuRef, subRef] })

  const runLeaf = (leaf: ActionLeaf) => {
    leaf.run()
    onClose()
  }
  const subs = entries.filter((e): e is { kind: 'sub' } & ActionSub => e.kind === 'sub')
  const openedSub = subs.find((s) => s.id === sub) ?? null
  const q = query.trim().toLowerCase()
  const results = q
    ? [
        ...entries.filter((e): e is { kind: 'leaf' } & ActionLeaf => e.kind === 'leaf'),
        ...subs.flatMap((s) => s.leaves.map((l) => ({ ...l, group: l.group ?? s.label }))),
      ].filter((l) => `${l.group ?? ''} ${l.label}`.toLowerCase().includes(q))
    : []
  const visibleCount = q ? results.length : entries.length
  const activeIndex = Math.min(active, Math.max(0, visibleCount - 1))

  const openSub = (id: string, focusInside: boolean) => {
    window.clearTimeout(subTimer.current)
    setSub(id)
    setSubActive(focusInside ? 0 : -1)
  }
  const closeSub = () => {
    window.clearTimeout(subTimer.current)
    setSub(null)
    setSubActive(-1)
  }
  // 項目に乗せたら少し待って中のメニューを開く・閉じる
  const hoverSub = (i: number, id: string) => {
    setActive(i)
    window.clearTimeout(subTimer.current)
    subTimer.current = window.setTimeout(() => openSub(id, false), SUB_OPEN_DELAY_MS)
  }
  const hoverLeaf = (i: number) => {
    setActive(i)
    window.clearTimeout(subTimer.current)
    subTimer.current = window.setTimeout(closeSub, SUB_OPEN_DELAY_MS)
  }
  const keepSub = () => window.clearTimeout(subTimer.current)

  // 押した所に出し、右・下にはみ出すなら内側へ寄せる（拡大アニメーション中でも本来の大きさで測る）
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || sheet) return
    el.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - el.offsetWidth - EDGE))}px`
    const top = above ? y - el.offsetHeight - EDGE : y
    el.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - el.offsetHeight - EDGE))}px`
  }, [x, y, q, above, sheet])

  // 閉じたら開いた元（行・… のボタン）へフォーカスを戻す。Esc で閉じても次の Tab がサイドバーからやり直しにならない。
  // 閉じる間に別の所（開いたダイアログなど）へ移っていたら奪わない（useFocusTrap と同じ戻し方）
  // 開く前のフォーカスは描画の時点で取る（効果の時点ではもうメニュー・検索欄に移っている）
  const [prev] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  useEffect(() => {
    const menu = menuRef.current
    return () => {
      const now = document.activeElement
      if (now && now !== document.body && !menu?.contains(now)) return
      if (prev && prev !== document.body && prev.isConnected && !menu?.contains(prev)) prev.focus()
    }
  }, [prev])

  // 検索欄の無いメニューは、メニュー自体にフォーカスしてキーで操作できるようにする
  useLayoutEffect(() => {
    if (!searchable && !above) menuRef.current?.focus()
  }, [searchable, above])

  // 中のメニューは開いた項目の横に。右に入らなければ左に出す
  useLayoutEffect(() => {
    const el = subRef.current
    const menu = menuRef.current
    const item = sub ? menu?.querySelector(`[data-sub="${sub}"]`) : null
    if (sheet || !sub || !el || !menu || !item) return
    const m = menu.getBoundingClientRect()
    const r = item.getBoundingClientRect()
    const right = m.right - 4
    const left = right + el.offsetWidth + EDGE <= window.innerWidth ? right : m.left - el.offsetWidth + 4
    el.style.left = `${Math.max(EDGE, left)}px`
    el.style.top = `${Math.max(EDGE, Math.min(r.top - 5, window.innerHeight - el.offsetHeight - EDGE))}px`
  })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    const inSub = openedSub !== null && subActive >= 0
    const step = (n: number, len: number, cur: number) => (len === 0 ? 0 : (cur + n + len) % len)
    const current = q ? undefined : entries[activeIndex]
    let handled = true
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const n = e.key === 'ArrowDown' ? 1 : -1
      if (inSub) setSubActive((i) => step(n, openedSub.leaves.length, i))
      else {
        setActive(step(n, visibleCount, activeIndex))
        closeSub()
      }
    } else if (e.key === 'ArrowRight' && !inSub && current?.kind === 'sub') {
      openSub(current.id, true)
    } else if (e.key === 'ArrowLeft' && inSub) {
      closeSub()
    } else if (e.key === 'Enter') {
      const leaf = inSub ? openedSub.leaves[subActive] : q ? results[activeIndex] : current?.kind === 'leaf' ? current : undefined
      if (leaf) runLeaf(leaf)
      else if (current?.kind === 'sub') openSub(current.id, true)
    } else if (e.key === 'Escape') {
      if (query) setQuery('')
      else if (sub) closeSub()
      else onClose()
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  if (sheet) {
    // スマホ: 下からのシート。中のメニューは同じシートの中に出す
    return createPortal(
      <>
        <div className="fixed inset-0 z-[69] animate-fade-in bg-black/30" aria-hidden onClick={onClose} />
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          data-popover-keep
          className="fixed inset-x-0 bottom-0 z-[70] max-h-[80vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl outline-none animate-sheet-in dark:bg-zinc-800
                     [&_[role=menuitem]]:min-h-11 [&_[role=menuitemradio]]:min-h-11"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
          {openedSub ? (
            <>
              <MenuItem icon={<ChevronLeftIcon className="h-4 w-4" />} onClick={closeSub}>
                {openedSub.label}
              </MenuItem>
              <MenuDivider />
              {openedSub.leaves.map((leaf) => (
                <LeafRow key={leaf.id} leaf={leaf} active={false} onHover={() => {}} onRun={() => runLeaf(leaf)} />
              ))}
              {openedSub.extra && <div className="px-2 pt-2">{openedSub.extra(onClose)}</div>}
            </>
          ) : (
            <>
              {header && <MenuLabel>{header}</MenuLabel>}
              {note}
              {entries.map((item) => (
                <div key={item.id}>
                  {(item.divider || (item.kind === 'leaf' && item.danger)) && <MenuDivider />}
                  {item.kind === 'sub' ? (
                    <MenuItem
                      aria-haspopup="menu"
                      icon={item.icon}
                      hint={item.hint}
                      trailing={<ChevronRightIcon className="h-3.5 w-3.5 text-zinc-400" />}
                      onClick={() => openSub(item.id, false)}
                    >
                      {item.label}
                    </MenuItem>
                  ) : (
                    <LeafRow leaf={item} active={false} onHover={() => {}} onRun={() => runLeaf(item)} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </>,
      document.body,
    )
  }

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        data-popover-keep
        className={`fixed z-[70] w-64 p-1 outline-none origin-top-left ${POPOVER_PANEL}`}
        style={{ left: x, top: y }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={showSearch ? undefined : onKeyDown}
      >
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-zinc-100 px-2 pb-1.5 pt-1 dark:border-zinc-700">
            <SearchIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
            <input
              // タップの端末で開いたときはキーボードを出さない（キーボードが下の項目を隠す。検索は打ちたいときに欄を押す）
              autoFocus={!coarse}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
                closeSub()
              }}
              onKeyDown={onKeyDown}
              placeholder={t('taskMenu.search')}
              aria-label={t('taskMenu.search')}
              className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            />
          </div>
        )}
        {header && <MenuLabel>{header}</MenuLabel>}
        {note}
        {q ? (
          results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {results.map((leaf, i) => (
                <LeafRow
                  key={leaf.id}
                  leaf={leaf}
                  active={i === activeIndex}
                  onHover={() => setActive(i)}
                  onRun={() => runLeaf(leaf)}
                  withGroup
                />
              ))}
            </div>
          ) : (
            <div className="px-2 py-2 text-sm text-zinc-400">{t('taskMenu.noResults')}</div>
          )
        ) : (
          entries.map((item, i) => (
            <div key={item.id}>
              {item.divider && <MenuDivider />}
              {item.kind === 'sub' ? (
                <MenuItem
                  data-sub={item.id}
                  aria-haspopup="menu"
                  aria-expanded={sub === item.id}
                  icon={item.icon}
                  hint={item.hint}
                  active={i === activeIndex || sub === item.id}
                  trailing={<ChevronRightIcon className="h-3.5 w-3.5 text-zinc-400" />}
                  onMouseEnter={() => hoverSub(i, item.id)}
                  onClick={() => openSub(item.id, false)}
                >
                  {item.label}
                </MenuItem>
              ) : (
                <LeafRow leaf={item} active={i === activeIndex} onHover={() => hoverLeaf(i)} onRun={() => runLeaf(item)} />
              )}
            </div>
          ))
        )}
      </div>
      {openedSub && !q && (
        <div
          ref={subRef}
          role="menu"
          tabIndex={-1}
          data-popover-keep
          className={`fixed z-[71] p-1 ${openedSub.width === 'lg' ? 'w-[272px]' : 'w-56'} ${POPOVER_PANEL}`}
          style={{ left: -9999, top: 0 }}
          onMouseEnter={keepSub}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="max-h-72 overflow-y-auto">
            {openedSub.leaves.map((leaf, j) => (
              <LeafRow key={leaf.id} leaf={leaf} active={j === subActive} onHover={() => setSubActive(j)} onRun={() => runLeaf(leaf)} />
            ))}
          </div>
          {openedSub.extra && (
            <div className={openedSub.leaves.length > 0 ? 'mt-1 border-t border-zinc-100 px-2 pt-2 dark:border-zinc-700' : 'p-1'}>
              {openedSub.extra(onClose)}
            </div>
          )}
        </div>
      )}
    </>,
    document.body,
  )
}
