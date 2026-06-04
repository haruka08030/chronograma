import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface TimeInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
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

function buildTimeOptions(stepMinutes: number): string[] {
  const out: string[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (let min = 0; min < 60; min += stepMinutes) {
      out.push(`${pad2(hour)}:${pad2(min)}`)
    }
  }
  return out
}

export function TimeInput({
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = '00:00',
}: TimeInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const options = useMemo(() => buildTimeOptions(15), [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const node = optionRefs.current[highlightIndex]
    if (node) node.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

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
      if (!rootRef.current.contains(e.target as Node)) {
        // フォーカスしていないインスタンスは draft が初期値のままなので、
        // 外側クリックのたびに commit すると他 UI（日付など）操作で空文字が確定し value が消える
        if (openRef.current) commitDraft()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [commitDraft])

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
        const idx = options.indexOf(normalizeTime(draft) ?? '')
        setHighlightIndex(idx >= 0 ? idx : 0)
        setOpen(true)
      } else {
        setHighlightIndex((prev) => Math.min(prev + 1, options.length - 1))
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        const idx = options.indexOf(normalizeTime(draft) ?? '')
        setHighlightIndex(idx >= 0 ? idx : options.length - 1)
        setOpen(true)
      } else {
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const normalizedDraft = normalizeTime(draft)
      const highlightedOption = options[highlightIndex]
      const shouldPreferTypedValue =
        normalizedDraft !== null &&
        normalizedDraft !== '' &&
        normalizedDraft !== highlightedOption

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
    if (e.key === 'Escape') {
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
    const idx = options.indexOf(normalizeTime(nextDraft) ?? '')
    if (idx >= 0) setHighlightIndex(idx)
    setOpen(true)
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
          if (!open) return
          const idx = options.indexOf(normalizeTime(nextDraft) ?? '')
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
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-300 bg-white p-1 shadow-[0_8px_20px_rgba(0,0,0,0.16)] dark:border-zinc-700 dark:bg-zinc-900"
          role="listbox"
        >
          {options.map((option, idx) => {
            const active = idx === highlightIndex
            const selected = option === (value ?? '')
            return (
              <button
                key={option}
                ref={(node) => { optionRefs.current[idx] = node }}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectValue(option)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                    : selected
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
                role="option"
                aria-selected={selected}
              >
                <span className="tabular-nums">{option}</span>
                <span className={`text-xs ${selected ? 'opacity-100' : 'opacity-0'}`}>✓</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
