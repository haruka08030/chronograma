import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { minutesToTime, pad2, toMinutes } from '../lib/clockTime'
import { formatDuration } from '../lib/timeGrid'
import { isCancelEscape, isSubmitEnter } from '../lib/keyboard'
import { zonedNow } from '../lib/timeZone'
import { FLOATING_SURFACE, MENU_ROW_ACTIVE, MENU_ROW_HOVER, MENU_ROW_PRESS } from './ui/surface'

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  /** 時刻だけでは何の欄か分からないところ（見出しの無い欄）の読み上げ名 */
  ariaLabel?: string
  /**
   * 値が空でピッカーを開いたときに最初にハイライト／スクロールする時刻 (HH:MM)。
   * 未指定なら現在時刻周辺を初期表示する。
   */
  pickerDefault?: string
  /**
   * 終わりの欄の開始（HH:MM）。候補を開始の 15 分後から並べ、それぞれに長さを添える（Google カレンダーと同じ）。
   * 予定は日をまたげないので 23:59 まで、`overnight` の欄（記録・睡眠）は翌日の開始の手前まで 1 周
   */
  durationFrom?: string
  overnight?: boolean
}

interface TimeOption {
  time: string
  /** 開始からの長さ（分）。`durationFrom` の無い欄は null */
  minutes: number | null
}

function nearestOptionIndex(options: TimeOption[], target: string): number {
  const t = toMinutes(target)
  if (t === null) return -1
  let best = -1
  let bestDiff = Infinity
  options.forEach((opt, i) => {
    const m = toMinutes(opt.time)
    if (m === null) return
    const diff = Math.abs(m - t)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  })
  return best
}

function normalizeTime(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (/^\d{1,2}:\d{1,2}$/.test(trimmed)) {
    const [hRaw, mRaw] = trimmed.split(':')
    const h = Number(hRaw)
    const m = Number(mRaw)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    if (h < 0 || h > 23 || m < 0 || m > 59) return null
    return `${pad2(h)}:${pad2(m)}`
  }

  if (!/^\d{1,4}$/.test(trimmed)) return null
  const digits = trimmed
  let h = 0
  let m = 0
  if (digits.length <= 2) {
    h = Number(digits)
    m = 0
  } else if (digits.length === 3) {
    h = Number(digits.slice(0, 1))
    m = Number(digits.slice(1))
  } else {
    h = Number(digits.slice(0, 2))
    m = Number(digits.slice(2))
  }
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${pad2(h)}:${pad2(m)}`
}

/** 候補の高さの上限（max-h-64）と、画面の端・欄から空ける幅 */
const LIST_MAX_HEIGHT = 256
const GAP = 4
const EDGE = 8
/** 下にこれだけ入らなければ、上の方が広いとき上に開く */
const LIST_MIN_HEIGHT = 160
/** 長さを添えた候補の幅（「23:45 23時間45分」が 1 行に入る） */
const LIST_WIDTH_WITH_DURATIONS = 176

/**
 * 候補を置く所（画面に対して）。欄の下に入らなければ、上の方が広いとき上に開く。高さは入る分だけ。
 * スマホでキーボードが出ているときは見えている範囲（visualViewport）で測る
 */
function listPlacement(input: DOMRect, minWidth = 96): CSSProperties {
  const vv = window.visualViewport
  const top = vv?.offsetTop ?? 0
  const bottom = top + (vv?.height ?? window.innerHeight)
  const below = bottom - input.bottom - GAP - EDGE
  const above = input.top - top - GAP - EDGE
  const up = below < Math.min(LIST_MIN_HEIGHT, LIST_MAX_HEIGHT) && above > below
  const width = Math.max(input.width, minWidth)
  return {
    position: 'fixed',
    left: Math.max(EDGE, Math.min(input.left, window.innerWidth - width - EDGE)),
    width,
    maxHeight: Math.min(LIST_MAX_HEIGHT, up ? above : below),
    ...(up ? { bottom: window.innerHeight - input.top + GAP } : { top: input.bottom + GAP }),
  }
}

function buildTimeOptions(stepMinutes: number, durationFrom?: string, overnight = false): TimeOption[] {
  const from = durationFrom ? toMinutes(durationFrom) : null
  if (from !== null) {
    const out: TimeOption[] = []
    const last = overnight ? 24 * 60 - stepMinutes : 24 * 60 - 1 - from
    for (let d = stepMinutes; d <= last; d += stepMinutes) out.push({ time: minutesToTime((from + d) % (24 * 60)), minutes: d })
    // 開始が日の終わり近くで並べる時刻が無ければ、ふつうの候補
    if (out.length > 0) return out
  }
  const out: TimeOption[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (let min = 0; min < 60; min += stepMinutes) {
      out.push({ time: `${pad2(hour)}:${pad2(min)}`, minutes: null })
    }
  }
  return out
}

export function TimeInput({
  value,
  onChange,
  disabled = false,
  className = '',
  // 空欄は --:--（00:00 だと設定済みの 0 時に見える）
  placeholder = '--:--',
  pickerDefault,
  ariaLabel,
  durationFrom,
  overnight = false,
}: TimeInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  // 候補はカード・シートの中に置くと切れ、今の行へ送るときにカードごとスクロールするので、画面に対して置く（`listPlacement`）
  const [listStyle, setListStyle] = useState<CSSProperties>({})
  const dropUp = listStyle.bottom !== undefined
  const openRef = useRef(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const options = useMemo(() => buildTimeOptions(15, durationFrom, overnight), [durationFrom, overnight])
  const withDurations = options[0]?.minutes != null

  useEffect(() => {
    openRef.current = open
  }, [open])

  // 値が空のときの初期ハイライト位置: pickerDefault があればそれ、なければ現在時刻周辺。
  const defaultHighlightIndex = useCallback(() => {
    if (pickerDefault) {
      const idx = nearestOptionIndex(options, pickerDefault)
      if (idx >= 0) return idx
    }
    const now = zonedNow()
    const idx = nearestOptionIndex(options, `${pad2(now.getHours())}:${pad2(now.getMinutes())}`)
    return idx >= 0 ? idx : 0
  }, [options, pickerDefault])

  // 開いたときの位置: 今の値（15 分刻みに無い 14:07 などは近い行）、空なら既定
  const initialHighlightIndex = useCallback(
    (raw: string) => {
      const normalized = normalizeTime(raw)
      const idx = normalized ? nearestOptionIndex(options, normalized) : -1
      return idx >= 0 ? idx : defaultHighlightIndex()
    },
    [options, defaultHighlightIndex],
  )

  const centerOnOpen = useRef(false)
  // ハイライトの行が見えるよう候補の中だけを送る（scrollIntoView は周りのカードまでスクロールしてしまう）
  useLayoutEffect(() => {
    const list = listRef.current
    const node = optionRefs.current[highlightIndex]
    if (!open || !list || !node) return
    const pad = 4
    // 開いたときは今の行を真ん中に（前後の時刻がどちらも見える）。その後のキー操作は見える所まで送るだけ
    if (centerOnOpen.current) {
      centerOnOpen.current = false
      list.scrollTop = node.offsetTop - (list.clientHeight - node.offsetHeight) / 2
    } else if (node.offsetTop - pad < list.scrollTop) list.scrollTop = node.offsetTop - pad
    else if (node.offsetTop + node.offsetHeight + pad > list.scrollTop + list.clientHeight)
      list.scrollTop = node.offsetTop + node.offsetHeight + pad - list.clientHeight
  }, [highlightIndex, open, listStyle])

  // 開いている間に周り（カード・シート・画面）がスクロール・リサイズしたら、欄に付いていく
  useEffect(() => {
    if (!open) return
    const place = (e?: Event) => {
      if (e?.target instanceof Node && listRef.current?.contains(e.target)) return
      const rect = inputRef.current?.getBoundingClientRect()
      if (rect) setListStyle(listPlacement(rect, withDurations ? LIST_WIDTH_WITH_DURATIONS : undefined))
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('resize', place)
    }
  }, [open, withDurations])

  const commitDraft = useCallback(() => {
    const normalized = normalizeTime(draft)
    if (normalized === null) {
      setDraft(value ?? '')
      return
    }
    onChange(normalized)
    setDraft(normalized)
  }, [draft, onChange, value])

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) {
        // フォーカスしていないインスタンスは draft が初期値のままなので、
        // 外側クリックのたびに commit すると他 UI（日付など）操作で空文字が確定し value が消える
        if (openRef.current) commitDraft()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [commitDraft])

  const openList = () => {
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) setListStyle(listPlacement(rect, withDurations ? LIST_WIDTH_WITH_DURATIONS : undefined))
    centerOnOpen.current = true
    setOpen(true)
  }

  const selectValue = (next: string) => {
    onChange(next)
    setDraft(next)
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setHighlightIndex(initialHighlightIndex(draft))
        openList()
      } else {
        setHighlightIndex((prev) => Math.min(prev + 1, options.length - 1))
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setHighlightIndex(initialHighlightIndex(draft))
        openList()
      } else {
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
      }
      return
    }
    if (isSubmitEnter(e)) {
      e.preventDefault()
      const normalizedDraft = normalizeTime(draft)
      const highlightedOption = options[highlightIndex]?.time
      const shouldPreferTypedValue = normalizedDraft !== null && normalizedDraft !== '' && normalizedDraft !== highlightedOption

      if (shouldPreferTypedValue) {
        commitDraft()
        setOpen(false)
        return
      }

      if (open && highlightedOption) {
        selectValue(highlightedOption)
        return
      }
      commitDraft()
      setOpen(false)
      return
    }
    if (e.key === 'Tab') {
      commitDraft()
      setOpen(false)
      return
    }
    if (isCancelEscape(e)) {
      e.preventDefault()
      setDraft(value ?? '')
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    if (disabled) return
    const nextDraft = value ?? ''
    setDraft(nextDraft)
    setHighlightIndex(initialHighlightIndex(nextDraft))
    openList()
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={open ? draft : (value ?? '')}
        onChange={(e) => {
          const nextDraft = e.target.value
          setDraft(nextDraft)
          const typed = normalizeTime(nextDraft) ?? ''
          const idx = options.findIndex((o) => o.time === typed)
          // 候補から選んで閉じた後もフォーカスは欄に残る。閉じている間は value を見せるので、打ったら開き直して打った文字を見せる
          if (!open) {
            setHighlightIndex(idx >= 0 ? idx : initialHighlightIndex(nextDraft))
            openList()
            return
          }
          if (idx >= 0) setHighlightIndex(idx)
        }}
        onFocus={handleFocus}
        onBlur={(e) => {
          const nextTarget = e.relatedTarget
          if (nextTarget && listRef.current?.contains(nextTarget as Node)) return
          commitDraft()
          setOpen(false)
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && highlightIndex >= 0 ? `${listId}-${highlightIndex}` : undefined}
        aria-autocomplete="list"
      />
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            style={listStyle}
            // body 直下に出すので、開いている予定カード・シートからは「内側」（押しても閉じない）
            data-popover-keep
            className={`z-[95] animate-pop-in ${dropUp ? 'origin-bottom' : 'origin-top'} overflow-y-auto overscroll-contain rounded-md p-1 shadow-[0_8px_20px_rgba(0,0,0,0.16)] ${FLOATING_SURFACE}`}
            role="listbox"
          >
            {options.map(({ time: option, minutes }, idx) => {
              const active = idx === highlightIndex
              const selected = option === (value ?? '')
              return (
                <button
                  key={option}
                  id={`${listId}-${idx}`}
                  ref={(node) => {
                    optionRefs.current[idx] = node
                  }}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectValue(option)}
                  // ハイライトはメニューと同じ色。今の値は ✓ と太字で示す
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                    active ? MENU_ROW_ACTIVE : `${MENU_ROW_HOVER} ${MENU_ROW_PRESS}`
                  } ${selected ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-200'}`}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="tabular-nums">
                    {option}
                    {minutes != null && <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{formatDuration(minutes)}</span>}
                  </span>
                  <span className={`text-xs ${selected ? 'opacity-100' : 'opacity-0'}`}>✓</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
