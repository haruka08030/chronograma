import { useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react'
import { useTaskStore } from '../store/taskStore'
import { logTitleSuggestions, type LogTitleSuggestion } from '../lib/logCategory'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { isCancelEscape, isImeKeyEvent, isSubmitEnter } from '../lib/keyboard'
import { TITLE_MAX_LENGTH } from '../lib/textLimits'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { chipClass } from './ui/chipClass'
import { FLOATING_SURFACE, MENU_ROW_ACTIVE, MENU_ROW_HOVER, MENU_ROW_PRESS } from './ui/surface'

/**
 * 記録の名前の欄。打った文字に合う過去の記録を最大 3 件、ラベルの色の点つきで出す（空欄では出さない）。
 * PC は欄の下（`dropUp` なら上）に浮く一覧。↑↓ で選び、Enter で決め、Esc で一覧だけ閉じる。何も選んでいない Enter は親へ。
 * スマホは欄のすぐ下に 1 行のチップ（浮く一覧はキーボードとラベルのチップに隠れる）。
 * 日本語の変換中の ↑↓・Enter・Esc は変換に使うので触らない。
 */
export function LogTitleInput({
  value,
  onChange,
  onPick,
  onKeyDown,
  onBlur,
  inputRef,
  dropUp = false,
  className,
  ...inputProps
}: {
  value: string
  onChange: (v: string) => void
  onPick: (s: LogTitleSuggestion) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
  inputRef?: Ref<HTMLInputElement>
  /** 画面の下に浮く欄（タイマー）では一覧を上に開く */
  dropUp?: boolean
  className?: string
  autoFocus?: boolean
  placeholder?: string
  'aria-label'?: string
}) {
  const desktop = useIsDesktop()
  const tasks = useTaskStore((s) => s.tasks)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const items = useMemo(() => logTitleSuggestions(tasks, value), [tasks, value])
  const [focused, setFocused] = useState(false)
  // Esc・選んだあとは、次に打つまで閉じておく
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const open = focused && !dismissed && items.length > 0
  const activeIndex = open && active < items.length ? active : -1

  const pick = (s: LogTitleSuggestion) => {
    setDismissed(true)
    setActive(-1)
    onPick(s)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && !isImeKeyEvent(e.nativeEvent)) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = items.length
        setActive(e.key === 'ArrowDown' ? (activeIndex + 1) % n : activeIndex <= 0 ? n - 1 : activeIndex - 1)
        return
      }
      if (isSubmitEnter(e) && activeIndex >= 0) {
        e.preventDefault()
        pick(items[activeIndex]!)
        return
      }
      if (isCancelEscape(e)) {
        // 一覧だけ閉じる（カード・欄は次の Esc で）
        e.preventDefault()
        e.stopPropagation()
        setDismissed(true)
        setActive(-1)
        return
      }
    }
    onKeyDown?.(e)
  }

  const dot = (s: LogTitleSuggestion) => (
    <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(categoryHex(s.category, colors))} aria-hidden />
  )

  const list = open && (
    <div
      id={listId}
      role="listbox"
      className={
        desktop
          ? `absolute inset-x-0 z-40 animate-pop-in rounded-md p-1 shadow-[0_8px_20px_rgba(0,0,0,0.16)] ${FLOATING_SURFACE} ${
              dropUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'
            }`
          : 'mt-2 flex min-w-0 gap-1.5'
      }
    >
      {items.map((s, i) => (
        <button
          key={s.title}
          id={`${listId}-${i}`}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          tabIndex={-1}
          // 押しても欄からフォーカスを外さない（離れたら保存する欄で、選ぶ前に保存しない）
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(s)}
          className={
            desktop
              ? `flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-200 ${
                  i === activeIndex ? MENU_ROW_ACTIVE : `${MENU_ROW_HOVER} ${MENU_ROW_PRESS}`
                }`
              : chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 min-w-0 gap-1.5')
          }
        >
          {/* ラベルは名前と違うときだけ右に（「授業」の記録に「授業」と並べない） */}
          {dot(s)}
          <span className="min-w-0 truncate">{s.title}</span>
          {desktop && s.category && s.category !== s.title && (
            <span className="ml-auto max-w-[40%] shrink-0 truncate pl-2 text-xs text-zinc-400 dark:text-zinc-500">{s.category}</span>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <div className={desktop ? 'relative' : undefined}>
      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setDismissed(false)
          setActive(-1)
          onChange(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setActive(-1)
          onBlur?.()
        }}
        onKeyDown={handleKeyDown}
        maxLength={TITLE_MAX_LENGTH}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={Boolean(open)}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className={className}
      />
      {list}
    </div>
  )
}
