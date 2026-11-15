import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INBOX_LIST_ID, useTaskStore } from '../../store/taskStore'
import { taskPlacementDate } from '../../lib/taskTimeRange'
import { addTaskFromQuickText, type QuickAddPicks } from '../../lib/quickAddTask'
import { useQuickAddTarget } from '../../lib/quickAddFocus'
import { useIsCoarsePointer, useIsDesktop } from '../../hooks/useMediaQuery'
import { flyIntoTimeline } from '../../lib/onboardingMotion'
import { InlineAddInput } from '../ui/InlineAddInput'
import { ExampleChips } from '../ui/ExampleChips'
import { QuickAddDetails } from '../QuickAddDetails'
import { openTaskDetail } from '../../lib/overlays'
import { habitsMatchingTitle } from '../../lib/habitSuggest'
import { buildHabitRecordIndex } from '../../lib/habitTiming'
import { isHabitDueOnDate } from '../../lib/habitSchedule'
import { placeHabitAt } from '../../lib/timelineBlockEdit'
import { courseKey } from '../../lib/courseLinks'
import { fromDateKey } from '../../lib/dateKey'
import { colorVars } from '../../lib/logCategoryColors'
import { notify } from '../../lib/notify'
import { isLogTask } from '../../types/task'
import { MENU_ROW_HOVER, MENU_ROW_PRESS } from '../ui/surface'

/** はじめの案内の間、追加欄の薄い文字の例を入れ替える間隔 */
export const GUIDE_PLACEHOLDER_MS = 2600

/**
 * 今日の計画の追加欄（並んだ行の下。見出しのすぐ下に空の欄を置かない）。
 * 足したものの「やる日」は見ている日で、その日の行の最後に入る（欄の上に見える）。書き方の解釈は To-Do 画面と同じ。C / ⌘N でここにフォーカスする。
 * 何も無い日は書き方の例を薄く出す。
 * はじめの案内の間でまだ何も無いとき（`guide`）は、ここが入口: PC は開いたときに欄にカーソルを置き（スマホはキーボードが開くので置かない）、
 * 薄い文字の例を入れ替え、欄が空の間は下に例のボタン（押すと欄に入る。足す前に読み取りのチップが見える）。1 件入れたら普段の欄に戻る。
 * 案内の間（`onboarding`）に時刻つきで足すと、PC は枠がタイムラインのその時間へ移る動き（スマホは今日やる行に時刻つきで並ぶので動かさない）
 */
export function PlannerAddInput({
  dateKey,
  showExample,
  guide = false,
  onboarding = false,
  onAdded,
}: {
  dateKey: string
  showExample: boolean
  guide?: boolean
  onboarding?: boolean
  /** 足した To-Do（今日の行で、書いた締切が伝わったと分かるように出す） */
  onAdded?: (id: string) => void
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

  /** 足す。`details` なら続けて詳細を開く */
  const submit = (details = false) => {
    if (!draft.trim()) return
    const id = addTaskFromQuickText(draft, { defaultListId: INBOX_LIST_ID, defaultDate: dateKey, picks, last: true })
    change('')
    if (id) onAdded?.(id)
    if (details && id) {
      openTaskDetail(id)
      return
    }
    // 案内の間に時刻つきで足したら、タイムラインへ飛ぶ動き（PC だけ。スマホは今日やる行に時刻つきで並ぶ）
    if (!onboarding || !id || !isDesktop || !inputRef.current) return
    const added = useTaskStore.getState().tasks.find((t) => t.id === id)
    if (!added?.startTime || !added.endTime || taskPlacementDate(added) !== dateKey) return
    flyIntoTimeline(inputRef.current, id)
  }

  // 打った名前と同じ名前の習慣（To-Do で作ると習慣と 2 つ並び、持ち越しにも数えられる・#711）。
  // その日がもともと習慣の日ならそのまま（To-Do を作らない）、そうでなければ習慣の時刻でその日もやる日にする
  const habits = useTaskStore((s) => s.habits)
  const tasks = useTaskStore((s) => s.tasks)
  const habitMatch = useMemo(() => {
    const q = courseKey(draft)
    if (!q) return null
    const records = buildHabitRecordIndex(tasks.filter(isLogTask))
    const h = habitsMatchingTitle(habits, draft, dateKey, records).find((x) => courseKey(x.title) === q)
    if (!h) return null
    const due = isHabitDueOnDate(h, fromDateKey(dateKey), records)
    // 習慣の日でなく時刻も無ければ、その日に置けないので出さない
    return due || (h.startTime && h.endTime) ? { habit: h, due } : null
  }, [draft, habits, tasks, dateKey])
  const useHabit = () => {
    if (!habitMatch) return
    const { habit, due } = habitMatch
    if (due) notify(t('planner.habitAlreadyOnDay', { title: habit.title }))
    else placeHabitAt(habit.id, dateKey, habit.startTime!, habit.endTime!)
    change('')
    inputRef.current?.focus()
  }
  const habitText = t('planner.useHabit', { title: '\u0000' }).split('\u0000')

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
        onSubmit={() => submit()}
        onExpand={() => submit(true)}
        placeholder={placeholder}
      />
      {guide && draft === '' && (
        <ExampleChips
          examples={examples}
          onPick={(example) => {
            change(example)
            inputRef.current?.focus()
          }}
          className="ml-11 mt-2"
        />
      )}
      {habitMatch && (
        <button
          type="button"
          onClick={useHabit}
          className={`ml-9 mt-1.5 flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-zinc-600 transition-colors dark:text-zinc-300 ${MENU_ROW_HOVER} ${MENU_ROW_PRESS}`}
        >
          <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(habitMatch.habit.color)} aria-hidden />
          <span className="flex min-w-0 items-center">
            <span className="shrink-0 whitespace-pre">{habitText[0]}</span>
            <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-100">{habitMatch.habit.title}</span>
            <span className="shrink-0 whitespace-pre">{habitText[1]}</span>
          </span>
        </button>
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
