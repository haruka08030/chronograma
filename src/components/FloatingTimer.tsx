import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { fromAppWall, toAppWall } from '../lib/timeZone'
import { buttonClass } from './ui/buttonClass'
import { tip } from '../lib/tooltip'
import { pad2 } from '../lib/clockTime'
import { chipClass } from './ui/chipClass'
import { fieldClass } from './ui/fieldClass'
import { HINT_TEXT } from './ui/textClass'

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** ボトムナビ + safe-area の上に載せる共通オフセット（md 以上は従来どおり） */
const MOBILE_FLOAT_BOTTOM =
  'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

/**
 * これを超えたら「止め忘れ」とみなして確認を出す。
 * 1 コマ 90 分・バイト 1 本を通しで測ることはあるので、8 時間は超えない想定。
 */
const STALE_TIMER_MS = 8 * 60 * 60 * 1000

/**
 * 「完了にしますか？」は止めるボタンと同じ位置に出て、「完了」がちょうど止めるの真上に来る。
 * 止めるの 2 度押し・ダブルタップで完了にならないよう、出てすぐの押下は受けない。
 */
const COMPLETE_PROMPT_ARM_MS = 700

export function FloatingTimer() {
  const { t } = useTranslation()
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!activeTimer) {
      queueMicrotask(() => setElapsed(0))
      return
    }
    const start = new Date(activeTimer.startedAt).getTime()
    const tick = () => setElapsed(Date.now() - start)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeTimer])
  // 浮くタイマーが出ている間、スクロールする面の下に余白を足す（`timer-safe`）
  const timerShown = activeTimer != null
  useEffect(() => {
    document.documentElement.toggleAttribute('data-timer-open', timerShown)
    return () => document.documentElement.removeAttribute('data-timer-open')
  }, [timerShown])

  if (!activeTimer) return <CompletePrompt />

  // 止め忘れ（タブを閉じたまま日付が変わった等）。走り続けた時間を記録に混ぜない
  if (elapsed > STALE_TIMER_MS) {
    return <StaleTimerPrompt startedAt={activeTimer.startedAt} taskTitle={activeTimer.taskTitle} />
  }

  return (
    <div
      className={`fixed left-1/2 z-50 w-[min(100vw-1.5rem,22rem)] -translate-x-1/2
                    rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-2xl
                    dark:border-zinc-700 dark:bg-zinc-800
                    flex items-center gap-3 md:min-w-[280px] md:w-auto md:gap-4 md:px-5
                    ${MOBILE_FLOAT_BOTTOM}`}
    >
      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {activeTimer.taskTitle}
        </p>
        {activeTimer.tags?.length > 0 && (
          <div className="flex gap-1 mt-0.5">
            {activeTimer.tags.map((tag) => (
              <span key={tag} className={chipClass({ variant: 'fill' })}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {formatElapsed(elapsed)}
      </span>
      <button
        onClick={stopTimer}
        className="rounded-xl bg-red-500 p-2.5 text-white transition-colors touch-manipulation hover:bg-red-600 md:p-2"
        {...tip(t('floatingTimer.stopTitle'))}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    </div>
  )
}

/** タスクから始めた記録を止めた直後に、そのタスクを完了にするか聞く（放置すると数秒で消える） */
function CompletePrompt() {
  const { t } = useTranslation()
  const taskId = useTaskStore((s) => s.completePromptTaskId)
  const task = useTaskStore((s) => (taskId ? s.tasks.find((x) => x.id === taskId) ?? null : null))
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const dismiss = useTaskStore((s) => s.dismissCompletePrompt)
  const shownAt = useRef(0)

  useEffect(() => {
    if (!taskId) return
    shownAt.current = Date.now()
    const id = setTimeout(dismiss, 12_000)
    return () => clearTimeout(id)
  }, [taskId, dismiss])

  if (!task || task.completed) return null

  return (
    <div
      role="status"
      className={`fixed left-1/2 z-50 w-[min(100vw-1.5rem,24rem)] -translate-x-1/2
                  rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-2xl
                  dark:border-zinc-700 dark:bg-zinc-800 flex items-center gap-3
                  ${MOBILE_FLOAT_BOTTOM}`}
    >
      <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
        {t('floatingTimer.completePrompt', { title: task.title })}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className={buttonClass({ variant: 'ghost', size: 'sm' }, 'shrink-0')}
      >
        {t('floatingTimer.notYet')}
      </button>
      <button
        type="button"
        onClick={() => {
          if (Date.now() - shownAt.current < COMPLETE_PROMPT_ARM_MS) return
          toggleTask(task.id)
          dismiss()
        }}
        className={buttonClass({ variant: 'primary', size: 'sm' }, 'shrink-0')}
      >
        {t('floatingTimer.markDone')}
      </button>
    </div>
  )
}

/**
 * 8 時間を超えて走っているタイマーの後始末。
 * 止め忘れたまま「今」まで記録すると、その日の記録が丸ごと歪むので、
 * 終了時刻を選べるようにする（原則 3: 閾値を超えたときだけ出す）。
 */
function StaleTimerPrompt({ startedAt, taskTitle }: { startedAt: string; taskTitle: string }) {
  const { t } = useTranslation()
  const resolveStaleTimer = useTaskStore((s) => s.resolveStaleTimer)
  const discardActiveTimer = useTaskStore((s) => s.discardActiveTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)
  // 入力と表示はアプリのタイムゾーンの壁時計（`toAppWall`）。保存するときに本当の瞬間に戻す
  const [endValue, setEndValue] = useState(() => toLocalInputValue(toAppWall(startedAt)))
  const [editing, setEditing] = useState(false)

  const started = toAppWall(startedAt)

  return (
    <div
      role="alertdialog"
      aria-label={t('staleTimer.title')}
      className={`fixed left-1/2 z-50 w-[min(100vw-1.5rem,26rem)] -translate-x-1/2
                  rounded-2xl border border-amber-300 bg-white p-4 shadow-2xl
                  dark:border-amber-500/40 dark:bg-zinc-800 ${MOBILE_FLOAT_BOTTOM}`}
    >
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {t('staleTimer.title')}
      </p>
      <p className={`mt-1 ${HINT_TEXT}`}>
        {t('staleTimer.body', { title: taskTitle, since: formatStarted(started) })}
      </p>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={endValue}
            min={toLocalInputValue(started)}
            onChange={(e) => setEndValue(e.target.value)}
            className={fieldClass({ size: 'sm' }, 'min-w-0 flex-1')}
          />
          <button
            type="button"
            onClick={() => resolveStaleTimer(fromAppWall(new Date(endValue)).toISOString())}
            disabled={!endValue || new Date(endValue) <= started}
            className={buttonClass({ variant: 'primary', size: 'sm' }, 'shrink-0')}
          >
            {t('staleTimer.saveAt')}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => stopTimer()}
            className={buttonClass({ variant: 'primary', size: 'sm' })}
          >
            {t('staleTimer.stopNow')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            {t('staleTimer.chooseEnd')}
          </button>
          <button
            type="button"
            onClick={discardActiveTimer}
            className={buttonClass({ variant: 'ghost', size: 'sm' })}
          >
            {t('staleTimer.discard')}
          </button>
        </div>
      )}
    </div>
  )
}

/** `datetime-local` が受け取るローカル時刻の文字列 */
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatStarted(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
