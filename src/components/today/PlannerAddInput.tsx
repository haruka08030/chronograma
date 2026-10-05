import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID } from '../../store/taskStore'
import { addTaskFromQuickText } from '../../lib/quickAddTask'
import { useQuickAddTarget } from '../../lib/quickAddFocus'
import { InlineAddInput } from '../ui/InlineAddInput'

/**
 * 今日の計画の追加欄（並んだ行の下。見出しのすぐ下に空の欄を置かない）。
 * 足したものの「やる日」は見ている日。書き方の解釈は To-Do 画面と同じ。C / ⌘N でここにフォーカスする。
 * 書きかけ（`draft`）は親が持つ（はじめの案内の例を入れられるように）。何も無い日は書き方の例を薄く出す（はじめの案内を出している間は案内の方に）
 */
export function PlannerAddInput({
  dateKey,
  draft,
  onDraftChange,
  showExample,
}: {
  dateKey: string
  draft: string
  onDraftChange: (value: string) => void
  showExample: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  useQuickAddTarget(inputRef)

  const submit = () => {
    if (!draft.trim()) return
    addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey })
    onDraftChange('')
  }

  return (
    <div className="mt-1 px-3">
      <InlineAddInput
        ref={inputRef}
        underline
        data-quickadd
        value={draft}
        onValueChange={onDraftChange}
        onSubmit={submit}
        placeholder={showExample ? t('planner.addPlaceholderExample') : t('planner.addPlaceholder')}
      />
    </div>
  )
}
