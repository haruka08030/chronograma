import { useEffect, useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { allOnboardingStepsDone, onboardingSteps } from '../../lib/onboarding'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { colorVars } from '../../lib/logCategoryColors'
import { tip } from '../../lib/tooltip'
import { useIsCoarsePointer } from '../../hooks/useMediaQuery'
import { CheckIcon, CloseIcon } from '../icons'
import { iconButtonClass } from '../ui/iconButtonClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { HINT_TEXT, PHRASE_WRAP } from '../ui/textClass'

/** 3 つ終えたあと「できました」を出しておく時間 */
export const ONBOARDING_DONE_MS = 4000

/**
 * はじめて使う人の 3 ステップ（今日の画面の追加欄の下）。① やることを入れる ② 時間に置く ③ ▶ で記録する。
 * やったステップは手元のデータから自動でチェックが付き、説明は次にやるステップだけに出す。
 * 3 つ終わると「できました」を少し出して消え、× でも消える。どちらも二度と出ない（`onboardingDone`）
 */
export function PlannerOnboarding({ onUseExample }: { onUseExample: (text: string) => void }) {
  const { t } = useTranslation()
  const headingId = useId()
  const tasks = useTaskStore((s) => s.tasks)
  const timerRunning = useTaskStore((s) => s.activeTimer !== null)
  const finishOnboarding = useTaskStore((s) => s.finishOnboarding)
  const isCoarse = useIsCoarsePointer()
  const steps = useMemo(() => onboardingSteps(tasks, timerRunning), [tasks, timerRunning])
  const allDone = allOnboardingStepsDone(steps)

  useEffect(() => {
    if (!allDone) return
    const timer = window.setTimeout(finishOnboarding, ONBOARDING_DONE_MS)
    return () => window.clearTimeout(timer)
  }, [allDone, finishOnboarding])

  if (allDone) {
    return (
      <p role="status" className="mx-6 mt-6 flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
        <StepMark done />
        <span className={PHRASE_WRAP}>{t('onboarding.done')}</span>
      </p>
    )
  }

  const example = t('onboarding.example')
  const items = [
    {
      key: 'add',
      done: steps.added,
      label: t('onboarding.add'),
      hint: (
        <>
          {t('onboarding.addHint')}{' '}
          <button
            type="button"
            onClick={() => onUseExample(example)}
            aria-label={t('onboarding.useExample', { text: example })}
            className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-700 transition-colors touch-manipulation hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {example}
          </button>
        </>
      ),
    },
    {
      key: 'place',
      done: steps.placed,
      label: t('onboarding.place'),
      hint: isCoarse ? t('onboarding.placeHintTouch') : t('onboarding.placeHint'),
    },
    {
      key: 'record',
      done: steps.recorded,
      label: t('onboarding.record'),
      hint: isCoarse ? t('onboarding.recordHintTouch') : t('onboarding.recordHint'),
    },
  ]
  // 説明は次にやるステップだけ（全部に出すとごちゃつく）
  const current = items.find((x) => !x.done)?.key

  return (
    <section aria-labelledby={headingId} className="mx-6 mt-6">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className={sectionLabelClass('section')}>
          {t('onboarding.heading')}
        </h3>
        <button
          type="button"
          onClick={finishOnboarding}
          {...tip(t('onboarding.close'), { name: true })}
          className={iconButtonClass('-mr-1.5 p-1.5')}
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="mt-1 space-y-3">
        {items.map((item, i) => (
          <li key={item.key} className="flex gap-2.5">
            <StepMark done={item.done} n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${item.done ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'}`}>
                {item.label}
                {item.done && <span className="sr-only"> ({t('onboarding.stepDone')})</span>}
              </p>
              {item.key === current && <p className={`mt-1 ${HINT_TEXT} ${PHRASE_WRAP}`}>{item.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** ステップの印: まだなら番号の細い丸、済んだら予定と同じ色の抜け感の塗り＋縁に ✓ */
function StepMark({ done, n }: { done: boolean; n?: number }) {
  if (done) {
    return (
      <span
        aria-hidden
        className="gc-dot mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={colorVars(DEFAULT_GOOGLE_EVENT_HEX)}
      >
        <CheckIcon className="h-3 w-3" strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-medium tabular-nums text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
    >
      {n}
    </span>
  )
}
