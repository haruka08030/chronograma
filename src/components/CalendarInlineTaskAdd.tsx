import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID, useTaskStore } from '../store/taskStore'
import { addTaskFromQuickText, type QuickAddPicks } from '../lib/quickAddTask'
import { unplannedListIds } from '../lib/listKind'
import type { TaskList } from '../types/list'
import { PlusIcon } from './icons'
import { tip } from '../lib/tooltip'
import { InlineAddInput } from './ui/InlineAddInput'
import { QuickAddReading } from './QuickAddReading'
import { QuickAddDetails } from './QuickAddDetails'

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

/** いつか・チェックリストを選んでいると日付が付かずカレンダーから消えるので、そのときは未分類へ */
function defaultListFor(selectedListId: string | null, lists: readonly TaskList[]): string {
  return selectedListId && !unplannedListIds(lists).has(selectedListId) ? selectedListId : INBOX_LIST_ID
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
  const boxRef = useRef<HTMLDivElement>(null)
  // 下のチップで選んだ値（大きい欄だけ。消したら・足したら空に）
  const [picks, setPicks] = useState<QuickAddPicks>({})
  const detailed = size === 'md'
  const change = (v: string) => {
    setValue(v)
    if (!v.trim()) setPicks({})
  }

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const commit = (): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false
    const { selectedListId, lists } = useTaskStore.getState()
    const defaultListId = defaultListFor(selectedListId, lists)
    addTaskFromQuickText(trimmed, { defaultListId, currentListId: defaultListId, defaultDate: dateKey, picks })
    change('')
    return true
  }

  // Enter は足して続けて書ける（空なら閉じる）。Esc は閉じる。外したら書いた分を足して閉じる。
  // 入力中だけ、大きい欄は足したら付く値のチップ（押して選べる）、マスの小さい欄は読み取った締切・予定を 1 行で（セルの日を既定のやる日として読む）
  const blurOut = () => {
    commit()
    onDone()
  }
  return (
    <div
      ref={boxRef}
      className="min-w-0"
      // 大きい欄: チップの中（時刻の欄など）へ移ったときは閉じない。外へ出たら足して閉じる
      onBlur={
        detailed
          ? (e) => {
              if (!boxRef.current?.contains(e.relatedTarget as Node | null)) blurOut()
            }
          : undefined
      }
    >
      <InlineAddInput
        ref={ref}
        size={detailed ? 'md' : 'sm'}
        value={value}
        onValueChange={change}
        onSubmit={() => {
          if (!commit()) onDone()
        }}
        onCancel={onDone}
        onBlurSubmit={detailed ? undefined : blurOut}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder={t('calendar.addTaskPlaceholder')}
      />
      {detailed ? (
        <QuickAddDetails
          text={value}
          defaultDate={dateKey}
          defaultListId={defaultListFor(useTaskStore.getState().selectedListId, useTaskStore.getState().lists)}
          picks={picks}
          onPicksChange={setPicks}
          onPicked={() => ref.current?.focus()}
          className="mt-2 px-1"
        />
      ) : (
        <QuickAddReading text={value} defaultDate={dateKey} className="mt-0.5 px-1" />
      )}
    </div>
  )
}
