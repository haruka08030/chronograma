import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { PlusIcon } from './icons'
import { tip } from '../lib/tooltip'
import { InlineAddInput } from './ui/InlineAddInput'

/** カレンダー各面の控えめな「＋」ボタン（クリックでインライン追加を開く） */
export function CalendarAddTaskButton({
  onClick,
  className = '',
  label,
}: {
  onClick: (e: React.MouseEvent) => void
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label ?? t('calendar.addTaskAria')}
      {...tip(label ?? t('calendar.addTaskAria'))}
      className={`inline-flex items-center justify-center rounded text-zinc-400 transition-colors
                  hover:bg-zinc-200/70 hover:text-zinc-600 dark:hover:bg-zinc-700/70 dark:hover:text-zinc-200
                  ${className}`}
    >
      <PlusIcon className="h-full w-full" />
    </button>
  )
}

/**
 * カレンダー各面（月セル / 週の終日行 / 選択日パネル）で共有するインライン ToDo 追加入力。
 * 追加はその日の「予定日」として扱われる（`addTaskWithDate`）。
 * タスクの追加欄はどこでも、Enter で追加したあとも開いたまま続けて書ける（空の Enter・Esc・外を押すと閉じる）。
 * 入れ物（リスト・セクション）を作る欄は 1 つ作ったら閉じる。
 */
export function CalendarInlineTaskAdd({
  dateKey,
  onDone,
  size = 'sm',
  autoFocus = true,
}: {
  dateKey: string
  onDone: () => void
  size?: 'sm' | 'md'
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const addTaskWithDate = useTaskStore((s) => s.addTaskWithDate)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const commit = (): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false
    addTaskWithDate(trimmed, dateKey)
    setValue('')
    return true
  }

  // Enter は足して続けて書ける（空なら閉じる）。Esc は閉じる。外したら書いた分を足して閉じる
  return (
    <InlineAddInput
      ref={ref}
      size={size === 'md' ? 'md' : 'sm'}
      value={value}
      onValueChange={setValue}
      onSubmit={() => {
        if (!commit()) onDone()
      }}
      onCancel={onDone}
      onBlurSubmit={() => {
        commit()
        onDone()
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder={t('calendar.addTaskPlaceholder')}
    />
  )
}
