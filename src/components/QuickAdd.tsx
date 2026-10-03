import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { InlineAddInput } from './ui/InlineAddInput'

/** To-Do 一覧の上の追加欄（今日画面と同じ形）。N キーなど「追加して」の合図でフォーカスする */
export function QuickAdd() {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const quickAddRequested = useTaskStore((s) => s.quickAddRequested)
  const clearQuickAddRequest = useTaskStore((s) => s.clearQuickAddRequest)

  useEffect(() => {
    if (!quickAddRequested) return
    clearQuickAddRequest()
    queueMicrotask(() => inputRef.current?.focus())
  }, [quickAddRequested, clearQuickAddRequest])

  const submit = () => {
    if (!value.trim()) return
    const { selectedListId, selectedView, filterColor } = useTaskStore.getState()
    addTaskFromQuickText(value, {
      currentListId: selectedListId,
      color: selectedView === 'all' && filterColor ? filterColor : undefined,
    })
    setValue('')
  }

  return (
    <InlineAddInput
      ref={inputRef}
      data-quickadd
      value={value}
      onValueChange={setValue}
      onSubmit={submit}
      placeholder={t('quickAdd.placeholder')}
    />
  )
}
