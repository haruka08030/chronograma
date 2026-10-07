import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { addTaskFromQuickText, type QuickAddPicks } from '../lib/quickAddTask'
import { InlineAddInput } from './ui/InlineAddInput'
import { QuickAddDetails } from './QuickAddDetails'
import { useQuickAddTarget } from '../lib/quickAddFocus'
import { NO_LABEL } from '../lib/todoColorLabels'

/** 色ラベルで絞っているときに足すものに付ける色 */
function viewColor(): string | undefined {
  const { selectedView, filterColor } = useTaskStore.getState()
  return selectedView === 'all' && filterColor && filterColor !== NO_LABEL ? filterColor : undefined
}

/** To-Do 一覧の上の追加欄（今日画面と同じ形）。N キーなど「追加して」の合図でフォーカスする */
export function QuickAdd({ placeholder }: { placeholder?: string } = {}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  // 下のチップで選んだ値（消したら・足したら空に）
  const [picks, setPicks] = useState<QuickAddPicks>({})
  const change = (v: string) => {
    setValue(v)
    if (!v.trim()) setPicks({})
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const quickAddRequested = useTaskStore((s) => s.quickAddRequested)
  const clearQuickAddRequest = useTaskStore((s) => s.clearQuickAddRequest)
  // C / ⌘N で頼まれたらここにフォーカスする
  useQuickAddTarget(inputRef)

  useEffect(() => {
    if (!quickAddRequested) return
    clearQuickAddRequest()
    queueMicrotask(() => inputRef.current?.focus())
  }, [quickAddRequested, clearQuickAddRequest])

  const submit = () => {
    if (!value.trim()) return
    addTaskFromQuickText(value, { currentListId: useTaskStore.getState().selectedListId, color: viewColor(), picks })
    change('')
  }

  return (
    <div>
      <InlineAddInput
        ref={inputRef}
        data-quickadd
        value={value}
        onValueChange={change}
        onSubmit={submit}
        placeholder={placeholder ?? t('quickAdd.placeholder')}
      />
      {/* 入力中だけ、足したら付く日付・時間・見積もり・締切・リスト・ラベル。押して選べる */}
      <QuickAddDetails
        text={value}
        color={viewColor()}
        picks={picks}
        onPicksChange={setPicks}
        onPicked={() => inputRef.current?.focus()}
        className="mt-2 px-1"
      />
    </div>
  )
}
