import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID } from '../../store/taskStore'
import { addTaskFromQuickText } from '../../lib/quickAddTask'
import { useQuickAddTarget } from '../../lib/quickAddFocus'
import { InlineAddInput } from '../ui/InlineAddInput'

/**
 * 今日の計画の追加欄（並んだ行の下。見出しのすぐ下に空の欄を置かない）。
 * 足したものの「やる日」は見ている日。書き方の解釈は To-Do 画面と同じ。C / ⌘N でここにフォーカスする
 */
export function PlannerAddInput({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useQuickAddTarget(inputRef)

  const submit = () => {
    if (!draft.trim()) return
    addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey })
    setDraft('')
  }

  return (
    <div className="mt-1 px-3">
      <InlineAddInput
        ref={inputRef}
        underline
        data-quickadd
        value={draft}
        onValueChange={setDraft}
        onSubmit={submit}
        placeholder={t('planner.addPlaceholder')}
      />
    </div>
  )
}
