import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID, useTaskStore } from '../store/taskStore'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { unplannedListIds } from '../lib/listKind'
import { PlusIcon } from './icons'
import { tip } from '../lib/tooltip'
import { InlineAddInput } from './ui/InlineAddInput'
import { QuickAddReading } from './QuickAddReading'

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
      {...tip(label ?? t('calendar.addTaskAria'), { name: true })}
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
 * 書いた 1 行はクイック追加と同じに読む（`addTaskFromQuickText`）。日付を書かなければそのセルの日がやる日、
 * 「15時」と書けばその日の予定、「明日」「金曜まで」「@リスト」と書けば書いたほうが勝つ。
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

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const commit = (): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false
    const { selectedListId, lists } = useTaskStore.getState()
    // いつか・チェックリストを選んでいると日付が付かずカレンダーから消えるので、そのときは未分類へ
    const defaultListId = selectedListId && !unplannedListIds(lists).has(selectedListId) ? selectedListId : INBOX_LIST_ID
    addTaskFromQuickText(trimmed, { defaultListId, currentListId: defaultListId, defaultDate: dateKey })
    setValue('')
    return true
  }

  // Enter は足して続けて書ける（空なら閉じる）。Esc は閉じる。外したら書いた分を足して閉じる。
  // 入力中だけ、読み取った締切・予定を下に 1 行で出す（セルの日を既定のやる日として読む）
  return (
    <div className="min-w-0">
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
      <QuickAddReading text={value} defaultDate={dateKey} className={size === 'md' ? 'mt-1 px-3' : 'mt-0.5 px-1'} />
    </div>
  )
}
