import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { allOnboardingStepsDone, onboardingSteps } from '../../lib/onboarding'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { colorVars } from '../../lib/logCategoryColors'
import { tip } from '../../lib/tooltip'
import { useIsCoarsePointer } from '../../hooks/useMediaQuery'
import { CheckIcon, CloseIcon } from '../icons'
import { iconButtonClass } from '../ui/iconButtonClass'
import { PHRASE_WRAP } from '../ui/textClass'

/** 3 つ終えたあと「できました」を出しておく時間 */
export const ONBOARDING_DONE_MS = 4000

/**
 * はじめて使う人の案内（今日の画面の追加欄の下の 1 行）。進み具合の点 3 つと、いまやるステップの名前だけ
 * （① やることを入れる ② 時間に置く ③ ▶ で記録する。説明の段落は出さない。書き方の例は追加欄の方）。
 * 済んだかは手元のデータから決める。3 つ終わると「できました」を少し出して消え、× でも消える。どちらも二度と出ない（`onboardingDone`）
 */
export function PlannerOnboarding() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const timerRunning = useTaskStore((s) => s.activeTimer !== null)
  const finishOnboarding = useTaskStore((s) => s.finishOnboarding)
  const completeOnboarding = useTaskStore((s) => s.completeOnboarding)
  const isCoarse = useIsCoarsePointer()
  const steps = useMemo(() => onboardingSteps(tasks, timerRunning), [tasks, timerRunning])
  const allDone = allOnboardingStepsDone(steps)

  useEffect(() => {
    if (!allDone) return
    const timer = window.setTimeout(completeOnboarding, ONBOARDING_DONE_MS)
    return () => window.clearTimeout(timer)
  }, [allDone, completeOnboarding])

  const items = [
    { key: 'add', done: steps.added, label: t('onboarding.add') },
    { key: 'place', done: steps.placed, label: isCoarse ? t('onboarding.placeTouch') : t('onboarding.place') },
    { key: 'record', done: steps.recorded, label: isCoarse ? t('onboarding.recordTouch') : t('onboarding.record') },
  ]
  const currentIndex = items.findIndex((x) => !x.done)
  const current = items[currentIndex]

  return (
    <section aria-label={t('onboarding.heading')} className="mx-6 mt-5 flex items-center gap-2.5">
      <span aria-hidden className="flex shrink-0 items-center gap-1">
        {items.map((item, i) => (
          <StepDot key={item.key} state={item.done ? 'done' : i === currentIndex ? 'current' : 'todo'} />
        ))}
      </span>
      {current ? (
        // 名前が変わったらふわっと出し直す（次のステップに進んだのが分かる）
        <p key={current.key} className={`min-w-0 flex-1 animate-fade-in text-sm text-zinc-600 dark:text-zinc-300 ${PHRASE_WRAP}`}>
          <span className="sr-only">{t('onboarding.stepOf', { n: currentIndex + 1, total: items.length })} </span>
          {current.label}
        </p>
      ) : (
        <p role="status" className={`min-w-0 flex-1 animate-fade-in text-sm text-zinc-600 dark:text-zinc-300 ${PHRASE_WRAP}`}>
          {t('onboarding.done')}
        </p>
      )}
      {!allDone && (
        <button
          type="button"
          onClick={finishOnboarding}
          {...tip(t('onboarding.close'), { name: true })}
          className={iconButtonClass('-mr-1.5 shrink-0 p-1.5')}
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  )
}

/** 進み具合の点: 済んだら予定と同じ色の抜け感の塗り＋縁に ✓、いまのステップは濃い縁、まだ先は薄い縁 */
function StepDot({ state }: { state: 'done' | 'current' | 'todo' }) {
  if (state === 'done') {
    return (
      <span
        className="gc-dot flex h-3.5 w-3.5 animate-check-in items-center justify-center rounded-full"
        style={colorVars(DEFAULT_GOOGLE_EVENT_HEX)}
      >
        <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    )
  }
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border ${
        state === 'current' ? 'border-zinc-500 dark:border-zinc-400' : 'border-zinc-300 dark:border-zinc-600'
      }`}
    />
  )
}
