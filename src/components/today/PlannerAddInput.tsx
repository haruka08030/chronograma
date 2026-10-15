import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID, useTaskStore } from '../../store/taskStore'
import { taskPlacementDate } from '../../lib/taskTimeRange'
import { addTaskFromQuickText, type QuickAddPicks } from '../../lib/quickAddTask'
import { useQuickAddTarget } from '../../lib/quickAddFocus'
import { useIsCoarsePointer, useIsDesktop } from '../../hooks/useMediaQuery'
import { flyIntoTimeline, nudgeTimelineTab } from '../../lib/onboardingMotion'
import { InlineAddInput } from '../ui/InlineAddInput'
import { chipClass } from '../ui/chipClass'
import { QuickAddDetails } from '../QuickAddDetails'

/** はじめの案内の間、追加欄の薄い文字の例を入れ替える間隔 */
export const GUIDE_PLACEHOLDER_MS = 2600

/**
 * 今日の計画の追加欄（並んだ行の下。見出しのすぐ下に空の欄を置かない）。
 * 足したものの「やる日」は見ている日で、その日の行の最後に入る（欄の上に見える）。書き方の解釈は To-Do 画面と同じ。C / ⌘N でここにフォーカスする。
 * 何も無い日は書き方の例を薄く出す。
 * はじめの案内の間でまだ何も無いとき（`guide`）は、ここが入口: PC は開いたときに欄にカーソルを置き（スマホはキーボードが開くので置かない）、
 * 薄い文字の例を入れ替え、欄が空の間は下に例のボタン（押すと欄に入る。足す前に読み取りのチップが見える）。1 件入れたら普段の欄に戻る。
 * 案内の間（`onboarding`）に時刻つきで足すと、PC は枠がタイムラインのその時間へ移る動き、スマホは「タイムライン」のタブが弾む
 */
export function PlannerAddInput({
  dateKey,
  showExample,
  guide = false,
  onboarding = false,
}: {
  dateKey: string
  showExample: boolean
  guide?: boolean
  onboarding?: boolean
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  useQuickAddTarget(inputRef)
  const isCoarse = useIsCoarsePointer()
  const isDesktop = useIsDesktop()
  const [draft, setDraft] = useState('')
  // 下のチップで選んだ値（消したら・足したら空に）
  const [picks, setPicks] = useState<QuickAddPicks>({})
  const change = (v: string) => {
    setDraft(v)
    if (!v.trim()) setPicks({})
  }

  const submit = () => {
    if (!draft.trim()) return
    const id = addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey, picks, last: true })
    change('')
    if (!onboarding || !id) return
    const added = useTaskStore.getState().tasks.find((t) => t.id === id)
    if (!added?.startTime || !added.endTime || taskPlacementDate(added) !== dateKey) return
    if (isDesktop) {
      if (inputRef.current) flyIntoTimeline(inputRef.current, id)
    } else nudgeTimelineTab()
  }

  // 1 件でもあれば置かない（↓ や 1 文字のショートカットを邪魔しない）
  useEffect(() => {
    if (guide && !isCoarse) inputRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const placeholders = t('onboarding.placeholders', { returnObjects: true }) as string[]
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const rotating = guide && draft === ''
  useEffect(() => {
    if (!rotating) return
    const timer = window.setInterval(() => setPlaceholderIndex((i) => i + 1), GUIDE_PLACEHOLDER_MS)
    return () => window.clearInterval(timer)
  }, [rotating])

  const placeholder = guide
    ? t('onboarding.placeholder', { example: placeholders[placeholderIndex % placeholders.length] })
    : showExample
      ? t('planner.addPlaceholderExample')
      : t('planner.addPlaceholder')
  // 押すと欄に入る例（時間の決まったバイトと、締切のあるレポート）
  const examples = [t('onboarding.example'), t('onboarding.example2')]

  return (
    <div className="mt-1 px-3">
      <InlineAddInput
        ref={inputRef}
        underline
        data-quickadd
        value={draft}
        onValueChange={change}
        onSubmit={submit}
        placeholder={placeholder}
      />
      {guide && draft === '' && (
        <div className="ml-11 mt-2 flex flex-wrap items-center gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                change(example)
                inputRef.current?.focus()
              }}
              aria-label={t('onboarding.useExample', { text: example })}
              className={chipClass({ variant: 'outline', size: 'md' }, 'pointer-coarse:min-h-9')}
            >
              {example}
            </button>
          ))}
        </div>
      )}
      {/* 入力中だけ、足したら付く値のチップ（見ている日が既定のやる日）。押して選べる */}
      <QuickAddDetails
        text={draft}
        defaultDate={dateKey}
        defaultListId={INBOX_LIST_ID}
        picks={picks}
        onPicksChange={setPicks}
        onPicked={() => inputRef.current?.focus()}
        className="mt-2"
      />
    </div>
  )
}
