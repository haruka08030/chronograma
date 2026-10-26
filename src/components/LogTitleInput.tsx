import { useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react'
import { useTaskStore } from '../store/taskStore'
import { logSuggestions, type LogSuggestion, type LogWindow } from '../lib/logSuggestions'
import { categoryHex, colorVars, logLabelFromTask } from '../lib/logCategoryColors'
import { getDayPlan } from '../lib/dayPlan'
import { unplannedListIds } from '../lib/listKind'
import { useTranslation } from 'react-i18next'
import { isCancelEscape, isImeKeyEvent, isSubmitEnter } from '../lib/keyboard'
import { TITLE_MAX_LENGTH } from '../lib/textLimits'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { chipClass } from './ui/chipClass'
import { FLOATING_SURFACE, MENU_ROW_ACTIVE, MENU_ROW_HOVER, MENU_ROW_PRESS } from './ui/surface'

/**
 * 記録の名前の欄。候補を最大 3 件、ラベルの色の点つきで出す（`logSuggestions`）。
 * 空欄ならその時間帯（`when`）にいつもやっていることと、最近よく記録するもの。打った後は合う今日の To-Do・過去の記録。
 * 予定はチェックで記録できるので出さない。
 * To-Do は丸の印で過去の記録と分ける。
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
  when = null,
  emptySuggestions = true,
  className,
  ...inputProps
}: {
  value: string
  onChange: (v: string) => void
  onPick: (s: LogSuggestion) => void
  /** 何時から何時の記録か（いつもやっていることを引く）。分からなければ null */
  when?: LogWindow | null
  /** 空欄のときも候補を出す（1 タップで記録するチップを別に並べる画面では false） */
  emptySuggestions?: boolean
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
  const { t } = useTranslation()
  const desktop = useIsDesktop()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const dateKey = when?.dateKey ?? null
  // 今日やる To-Do（未完了）。打った文字に合うものを候補に混ぜる
  const todos = useMemo(() => (dateKey ? getDayPlan(tasks, dateKey, unplannedListIds(lists)).open : []), [tasks, dateKey, lists])
  // 時間は中身で比べる（タイマーは毎秒描き直すので、作り直した同じ時間で数え直さない）
  const whenStart = when?.start ?? null
  const whenEnd = when?.end ?? null
  const items = useMemo(
    () =>
      logSuggestions({
        tasks,
        query: value,
        window: dateKey && whenStart && whenEnd ? { dateKey, start: whenStart, end: whenEnd } : null,
        todos,
        labelOf: (item) => {
          const label = logLabelFromTask(item, presets, colors)
          return { category: label.tags[0] ?? null, color: label.color }
        },
      }),
    [tasks, value, dateKey, whenStart, whenEnd, todos, presets, colors],
  )
  const [focused, setFocused] = useState(false)
  // Esc・選んだあとは、次に打つまで閉じておく
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  // 浮く一覧は PC で打っている間だけ。空欄（いつもやっていること・よく記録するもの）とスマホは欄の下に 1 行のチップで並べる
  // （開いてすぐ浮かせると時刻の欄を隠す）。並べるだけなら何も隠さないので、欄を押す前から出す
  const floating = desktop && value.trim() !== ''
  const open = (focused || !floating) && !dismissed && items.length > 0 && (emptySuggestions || value.trim() !== '')
  const activeIndex = open && active < items.length ? active : -1

  const pick = (s: LogSuggestion) => {
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

  const markHex = (s: LogSuggestion) => (s.category || !s.color ? categoryHex(s.category, colors) : s.color)
  // To-Do は丸の枠（To-Do の完了の丸と同じ形）、ほかは色の点
  const mark = (s: LogSuggestion) =>
    s.source === 'todo' ? (
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-[var(--c)]" style={colorVars(markHex(s))} aria-hidden />
    ) : (
      <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(markHex(s))} aria-hidden />
    )
  // 右の薄い字: To-Do は「To-Do」、記録はラベル（名前と同じなら出さない。「授業」の記録に「授業」と並べない）
  const hint = (s: LogSuggestion) =>
    s.source === 'todo' ? t('quickCreate.kindTodo') : s.category && s.category !== s.title ? s.category : null

  const list = open && (
    <div
      id={listId}
      role="listbox"
      className={
        floating
          ? `absolute inset-x-0 z-40 animate-pop-in rounded-md p-1 shadow-[0_8px_20px_rgba(0,0,0,0.16)] ${FLOATING_SURFACE} ${
              dropUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'
            }`
          : 'mt-2 flex min-w-0 gap-1.5'
      }
    >
      {items.map((s, i) => (
        <button
          key={`${s.source}:${s.title}`}
          id={`${listId}-${i}`}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          tabIndex={-1}
          // 押しても欄からフォーカスを外さない（離れたら保存する欄で、選ぶ前に保存しない）
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(s)}
          className={
            floating
              ? `flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-200 ${
                  i === activeIndex ? MENU_ROW_ACTIVE : `${MENU_ROW_HOVER} ${MENU_ROW_PRESS}`
                }`
              : chipClass(
                  { variant: 'outline', size: 'md' },
                  `min-h-9 min-w-0 gap-1.5 md:min-h-7 ${i === activeIndex ? MENU_ROW_ACTIVE : ''}`,
                )
          }
        >
          {mark(s)}
          <span className="min-w-0 truncate">{s.title}</span>
          {floating && hint(s) && (
            <span className="ml-auto max-w-[40%] shrink-0 truncate pl-2 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              {hint(s)}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <div className={floating ? 'relative' : undefined}>
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
