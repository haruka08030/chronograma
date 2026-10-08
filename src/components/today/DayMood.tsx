import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { DAY_MOOD_NOTE_MAX, MOODS, type Mood } from '../../lib/dayMood'
import { tip } from '../../lib/tooltip'
import { FIELD_FOCUS_RING, fieldClass } from '../ui/fieldClass'
import { isCancelEscape, isSubmitEnter } from '../../lib/keyboard'
import { META_TEXT } from '../ui/textClass'

/**
 * 気分の記号（#324）。顔ではなく、塗りの量が違う丸（○ ◔ ◑ ◕ ●）を墨色（文字の色）で描く。色を増やさない。
 * 文字の ◔ ◕ は書体によって形・大きさがそろわないので SVG で描く
 */
export function MoodSymbol({ mood, className = 'h-5 w-5' }: { mood: Mood; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={className}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {mood === 2 && <path d="M8 8V1.75A6.25 6.25 0 0 1 14.25 8Z" fill="currentColor" />}
      {mood === 3 && <path d="M8 1.75A6.25 6.25 0 0 1 8 14.25Z" fill="currentColor" />}
      {mood === 4 && <path d="M8 8V1.75A6.25 6.25 0 1 1 1.75 8Z" fill="currentColor" />}
      {mood === 5 && <circle cx="8" cy="8" r="6.25" fill="currentColor" />}
    </svg>
  )
}

/** 記号の名前（画面には出さず、読み上げとツールチップだけ） */
function useMoodLabels(): Record<Mood, string> {
  const { t } = useTranslation()
  return {
    1: t('planner.moodVeryBad'),
    2: t('planner.moodBad'),
    3: t('planner.moodOkay'),
    4: t('planner.moodGood'),
    5: t('planner.moodVeryGood'),
  }
}

/**
 * 「1 日を締める」の 1 行: 5 つの記号から 1 つ押す（もう一度押すと外す）と、押すと開く一言の欄（1 行・任意）。
 * ラベル・説明文は付けない。選んだ記号は地と縁でも分かる（色だけに頼らない）
 */
export function DayMoodPicker({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const labels = useMoodLabels()
  const entry = useTaskStore((s) => s.dayMoods[dateKey])
  const setDayMood = useTaskStore((s) => s.setDayMood)
  const mood = entry?.mood ?? null
  const note = entry?.note ?? ''
  return (
    <div data-day-mood className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div role="group" aria-label={t('planner.moodGroup')} className="-ml-1.5 flex items-center gap-0.5">
        {MOODS.map((m) => {
          const selected = mood === m
          return (
            <button
              key={m}
              type="button"
              aria-pressed={selected}
              {...tip(labels[m], { name: true })}
              onClick={() => setDayMood(dateKey, { mood: selected ? null : m })}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border outline-none transition-colors touch-manipulation md:h-8 md:w-8 ${FIELD_FOCUS_RING} ${
                selected
                  ? 'border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100'
                  : `border-transparent hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${
                      mood === null ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-500'
                    }`
              }`}
            >
              <MoodSymbol mood={m} />
            </button>
          )
        })}
      </div>
      {(mood !== null || note !== '') && <MoodNoteField key={dateKey} dateKey={dateKey} note={note} />}
    </div>
  )
}

/** 一言の欄。書いている間は手元だけに持ち、離れた・Enter で保存する（Esc で書く前に戻す）。書いていない間はほかの端末から届いた一言を出す */
function MoodNoteField({ dateKey, note }: { dateKey: string; note: string }) {
  const { t } = useTranslation()
  const setDayMood = useTaskStore((s) => s.setDayMood)
  /** 書きかけ（null は書いていない） */
  const [draft, setDraft] = useState<string | null>(null)
  // 欄が消える（日が替わる・画面を移る）ときも、書きかけを残す
  const pending = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (pending.current !== null) setDayMood(dateKey, { note: pending.current })
    },
    [dateKey, setDayMood],
  )
  const edit = (value: string | null) => {
    pending.current = value
    setDraft(value)
  }
  const commit = () => {
    // Esc で戻したあとの blur では保存しない（書きかけは pending にだけ残る。描き直す前の draft は古い）
    if (pending.current !== null) setDayMood(dateKey, { note: pending.current })
    edit(null)
  }
  return (
    <input
      type="text"
      value={draft ?? note}
      maxLength={DAY_MOOD_NOTE_MAX}
      aria-label={t('planner.moodNote')}
      placeholder={t('planner.moodNotePlaceholder')}
      enterKeyHint="done"
      onChange={(e) => edit(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (isSubmitEnter(e)) {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (isCancelEscape(e)) {
          edit(null)
          e.currentTarget.blur()
        }
      }}
      className={fieldClass({ size: 'sm' }, 'min-w-0 flex-1 basis-48')}
    />
  )
}

/**
 * 過ぎた日の今日の計画の見出しに出す、その日の記号（小さく）。一言があれば押すと下に開く
 */
export function DayMoodBadge({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const labels = useMoodLabels()
  const entry = useTaskStore((s) => s.dayMoods[dateKey])
  const [open, setOpen] = useState(false)
  if (!entry || entry.mood === null) return null
  const name = t('planner.moodOfDay', { mood: labels[entry.mood] })
  const symbol = <MoodSymbol mood={entry.mood} className="h-3.5 w-3.5" />
  if (!entry.note) {
    return (
      <span role="img" aria-label={name} {...tip(name)} className="inline-flex items-center px-1.5 py-1 text-zinc-500 dark:text-zinc-400">
        {symbol}
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        {...tip(name, { name: true })}
        onClick={() => setOpen((v) => !v)}
        className={`-mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-zinc-500 outline-none transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${FIELD_FOCUS_RING}`}
      >
        {symbol}
        {/* 一言があることを、記号の横の小さな点で（押すと開く） */}
        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
      </button>
      {open && <span className={`px-1.5 ${META_TEXT}`}>{entry.note}</span>}
    </span>
  )
}
