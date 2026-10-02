import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { allTimeZones, zoneCityName, zoneOptionLabel } from '../lib/timeZone'
import { isSubmitEnter } from '../lib/keyboard'

const LIST_HEIGHT = 280
const WIDTH = 320

/**
 * タイムゾーンを選ぶ（設定・タスクの詳細・作成カード・時間バーで共有）。
 * 都市名・日本語名・GMT のずれで絞り込める。`nullOption` を渡すと先頭に「端末に合わせる」などの選択肢を置く。
 */
export function TimeZonePicker({
  value,
  onChange,
  nullOption,
  exclude,
  trigger,
  ariaLabel,
}: {
  value: string | null
  onChange: (tz: string | null) => void
  /** null を選ぶ選択肢の表示（省略時は出さない） */
  nullOption?: string
  /** 一覧から外すもの（もう選んであるタイムゾーンなど） */
  exclude?: readonly string[]
  /** 押すと開くもの。省略時は今の値を出すボタン */
  trigger?: (props: { open: boolean; toggle: () => void }) => ReactNode
  ariaLabel: string
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const options = useMemo(() => {
    if (!open) return []
    const now = Date.now()
    const skip = new Set(exclude ?? [])
    return allTimeZones()
      .filter((tz) => !skip.has(tz))
      .map((tz) => ({ tz, label: zoneOptionLabel(tz, locale, now) }))
  }, [open, exclude, locale])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
    const rows: { tz: string | null; label: string }[] = []
    if (nullOption && !q) rows.push({ tz: null, label: nullOption })
    for (const o of options) {
      if (!q || o.label.toLowerCase().includes(q) || o.tz.toLowerCase().replace(/_/g, ' ').includes(q)) rows.push(o)
    }
    return rows
  }, [options, query, nullOption])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const toggle = () => {
    if (open) return close()
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.min(WIDTH, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const below = window.innerHeight - rect.bottom - 8
      const above = rect.top - 8
      // 下に入らなければ上に開く（スマホの下から出るカードの中など）
      const top = below >= LIST_HEIGHT + 48 || below >= above ? rect.bottom + 4 : Math.max(8, rect.top - 4 - Math.min(above, LIST_HEIGHT + 48))
      setPos({ left, top, maxHeight: Math.max(160, Math.min(LIST_HEIGHT, (top > rect.top ? below : above) - 48)) })
    }
    setOpen(true)
  }

  // 開いたら今の値を見える位置に
  useLayoutEffect(() => {
    if (!open) return
    const i = Math.max(0, filtered.findIndex((r) => r.tz === value))
    setHighlight(query ? 0 : i)
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 開いたときと絞り込みが変わったときだけ
  }, [open, query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  useDismiss({ open, onClose: close, inside: [popRef, wrapRef] })
  useEffect(() => {
    if (!open) return
    // 開いた位置を固定しているので、画面の大きさが変わったら閉じる
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [open])

  const pick = (tz: string | null) => {
    onChange(tz)
    close()
  }

  return (
    <span ref={wrapRef} className="relative inline-flex min-w-0">
      {trigger ? (
        trigger({ open, toggle })
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          onClick={toggle}
          className="max-w-[16rem] truncate rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          {value ? zoneOptionLabel(value, locale) : nullOption ?? zoneCityName('UTC')}
        </button>
      )}
      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={ariaLabel}
          className={`fixed z-[80] overflow-hidden ${POPOVER_PANEL}`}
          style={{ left: pos.left, top: pos.top, width: Math.min(WIDTH, window.innerWidth - 16) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => Math.min(filtered.length - 1, h + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => Math.max(0, h - 1))
            } else if (isSubmitEnter(e)) {
              e.preventDefault()
              const row = filtered[highlight]
              if (row) pick(row.tz)
            }
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('timeZone.search')}
            aria-label={t('timeZone.search')}
            className="w-full border-b border-zinc-100 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-100"
          />
          <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-400">{t('timeZone.noMatch')}</li>}
            {filtered.map((row, i) => (
              <li
                key={row.tz ?? '__null__'}
                data-index={i}
                role="option"
                aria-selected={row.tz === value}
                onPointerEnter={() => setHighlight(i)}
                onClick={() => pick(row.tz)}
                className={`cursor-pointer truncate px-3 py-1.5 text-sm ${
                  i === highlight ? 'bg-zinc-100 dark:bg-zinc-700' : ''
                } ${row.tz === value ? 'font-medium text-accent-700 dark:text-accent-300' : 'text-zinc-700 dark:text-zinc-200'}`}
              >
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
