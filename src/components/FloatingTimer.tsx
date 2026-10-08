import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { appTimeZone, instantFromWall, toAppWall } from '../lib/timeZone'
import { buttonClass } from './ui/buttonClass'
import { tip } from '../lib/tooltip'
import { clockOf, toMinutes } from '../lib/clockTime'
import { toDateKey } from '../lib/dateKey'
import { useDateFormat } from '../hooks/useDateFormat'
import { DateField } from './DateField'
import { TimeInput } from './TimeInput'
import { ClockIcon, CloseIcon, StopIcon } from './icons'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { frequentLogLabels } from '../lib/timeLogTags'
import { chipClass } from './ui/chipClass'
import { fieldClass } from './ui/fieldClass'
import { HINT_TEXT } from './ui/textClass'
import { endsAfter, planEndFor, TIMER_LENGTH_CHOICES } from '../lib/timerLength'
import { primeTimerChime } from '../lib/timerEndAlert'

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
const MOBILE_FLOAT_BOTTOM = 'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'

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

/** 止めた直後の「ラベルは？」に並べるラベルの数（1〜2 行に収まる数） */
const LABEL_PROMPT_CHIPS = 5

/** タブの題名に出す経過（`0:42`）。分単位 */
function elapsedForTitle(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`
}

export function FloatingTimer() {
  const { t } = useTranslation()
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const stopTimer = useTaskStore((s) => s.stopTimer)
  const setTimerEnd = useTaskStore((s) => s.setTimerEnd)
  const [elapsed, setElapsed] = useState(0)
  // 「あと何分」を選ぶ並び（#290）。開いたときの予定の終わり（予定から ▶ したときだけ）も覚える
  const [lengthMenu, setLengthMenu] = useState<{ planEnd: string | null } | null>(null)

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

  // 「あと何分」の残り（終わりが無ければ null、過ぎたら負）。経過と同じ 1 秒ごとの刻みで数える
  const startMs = activeTimer ? Date.parse(activeTimer.startedAt) : 0
  const endMs = activeTimer?.endsAt ? Date.parse(activeTimer.endsAt) : null
  const remaining = endMs === null ? null : endMs - startMs - elapsed
  // 別のタイマーになった・止めたら選ぶ並びを閉じる
  const timerStartedAt = activeTimer?.startedAt
  useEffect(() => {
    queueMicrotask(() => setLengthMenu(null))
  }, [timerStartedAt])

  // 記録中はタブの題名に経過（終わりがあれば残り）を出す（PWA ではライブアクティビティを作れない代わり）。止めたら元の題名に戻す
  const elapsedMinutes = Math.floor(elapsed / 60_000)
  // 残りは分を切り上げる（残り 30 秒で「0:00」と出さない）。過ぎたら経過に戻す
  const remainingMinutes = remaining !== null && remaining > 0 ? Math.ceil(remaining / 60_000) : null
  const timerTitle = activeTimer?.taskTitle
  useEffect(() => {
    if (!timerTitle) return
    const base = document.title
    document.title =
      remainingMinutes !== null
        ? `▶ ${t('floatingTimer.tabRemaining', { time: elapsedForTitle(remainingMinutes * 60_000) })} ${timerTitle}`
        : `▶ ${elapsedForTitle(elapsedMinutes * 60_000)} ${timerTitle}`
    return () => {
      document.title = base
    }
  }, [timerTitle, elapsedMinutes, remainingMinutes, t])

  if (!activeTimer) {
    return (
      <>
        <CompletePrompt />
        <LabelPrompt />
      </>
    )
  }

  // 止め忘れ（タブを閉じたまま日付が変わった等）。走り続けた時間を記録に混ぜない
  if (elapsed > STALE_TIMER_MS) {
    return <StaleTimerPrompt startedAt={activeTimer.startedAt} taskTitle={activeTimer.taskTitle} />
  }

  const chooseLength = (endsAt: string | null) => {
    // 選んだ操作の中で音を出せるようにしておく（時間になったときに鳴らせるように）
    if (endsAt) primeTimerChime()
    setTimerEnd(endsAt)
    setLengthMenu(null)
  }
  const openLengthMenu = () => {
    const s = useTaskStore.getState()
    setLengthMenu({ planEnd: s.activeTimer ? planEndFor(s.activeTimer, s.tasks) : null })
  }
  const timeUp = remaining !== null && remaining <= 0

  return (
    <div
      className={`fixed left-1/2 z-50 animate-toast-in w-[min(100vw-1.5rem,22rem)] -translate-x-1/2
                    rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-2xl
                    dark:border-zinc-700 dark:bg-zinc-800
                    md:min-w-[280px] md:w-auto md:px-5
                    ${MOBILE_FLOAT_BOTTOM}`}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-breathe flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{activeTimer.taskTitle}</p>
          {activeTimer.tags?.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {activeTimer.tags.map((tag) => (
                <span key={tag} className={chipClass({ variant: 'fill' })}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {/* 「あと何分」（#290）。選ばなければ今までどおり数え上げ。目立たせず、押したときだけ長さを並べる */}
          {remaining === null && !lengthMenu && (
            <button
              type="button"
              onClick={openLengthMenu}
              className="-mx-1 mt-0.5 inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 md:min-h-0"
            >
              <ClockIcon className="h-3.5 w-3.5" />
              {t('floatingTimer.setLength')}
            </button>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {remaining === null ? formatElapsed(elapsed) : timeUp ? `+${formatElapsed(-remaining)}` : formatElapsed(remaining + 999)}
          </span>
          {remaining !== null && activeTimer.endsAt && (
            // 残り・時間です。押すと終わりの時間を選び直す・外す
            <button
              type="button"
              onClick={() => (lengthMenu ? setLengthMenu(null) : openLengthMenu())}
              aria-expanded={lengthMenu !== null}
              {...tip(t('floatingTimer.changeLength'))}
              className={`-mr-1 rounded px-1 text-[11px] leading-4 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 ${
                timeUp ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {timeUp
                ? t('floatingTimer.timeUp')
                : `${t('floatingTimer.remaining')} · ${t('floatingTimer.until', { time: clockOf(toAppWall(activeTimer.endsAt)) })}`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={stopTimer}
          className="rounded-xl bg-red-500 p-2.5 text-white transition-colors touch-manipulation hover:bg-red-600 md:p-2"
          {...tip(t('floatingTimer.stopTitle'), { name: true })}
        >
          <StopIcon className="w-4 h-4" />
        </button>
      </div>
      {lengthMenu && (
        <div role="group" aria-label={t('floatingTimer.lengthGroup')} className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {lengthMenu.planEnd && (
            <button
              type="button"
              onClick={() => chooseLength(lengthMenu.planEnd)}
              className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 md:min-h-7')}
            >
              {t('floatingTimer.untilPlanEnd', { time: clockOf(toAppWall(lengthMenu.planEnd)) })}
            </button>
          )}
          {TIMER_LENGTH_CHOICES.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => chooseLength(endsAfter(min))}
              className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 md:min-h-7')}
            >
              {t('floatingTimer.lengthMinutes', { count: min })}
            </button>
          ))}
          {remaining !== null && (
            <button
              type="button"
              onClick={() => chooseLength(null)}
              className={buttonClass({ variant: 'ghost', size: 'sm' }, 'min-h-9 md:min-h-7')}
            >
              {t('floatingTimer.noLength')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setLengthMenu(null)}
            aria-label={t('common.close')}
            className="ml-auto -m-1 shrink-0 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/** タスクから始めた記録を止めた直後に、そのタスクを完了にするか聞く（放置すると数秒で消える） */
function CompletePrompt() {
  const { t } = useTranslation()
  const taskId = useTaskStore((s) => s.completePromptTaskId)
  const task = useTaskStore((s) => (taskId ? (s.tasks.find((x) => x.id === taskId) ?? null) : null))
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
      className={`fixed left-1/2 z-50 animate-toast-in w-[min(100vw-1.5rem,24rem)] -translate-x-1/2
                  rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-2xl
                  dark:border-zinc-700 dark:bg-zinc-800 flex items-center gap-3
                  ${MOBILE_FLOAT_BOTTOM}`}
    >
      <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">{t('floatingTimer.completePrompt', { title: task.title })}</p>
      <button type="button" onClick={dismiss} className={buttonClass({ variant: 'ghost', size: 'sm' }, 'shrink-0')}>
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
 * ラベルなしで止めた記録に、その場でラベルを付ける（放置すると数秒で消え、ラベルなしのまま残る）。
 * 「完了にしますか？」と同じ位置。止めるの 2 度押しでラベルが付かないよう、出てすぐの押下は受けない
 */
const NO_TASKS: Task[] = []

function LabelPrompt() {
  const { t } = useTranslation()
  const logId = useTaskStore((s) => s.labelPromptLogId)
  const log = useTaskStore((s) => (logId ? (s.tasks.find((x) => x.id === logId) ?? null) : null))
  // 出していない間はタスクの変更で描き直さない（#266）
  const tasks = useTaskStore((s) => (logId ? s.tasks : NO_TASKS))
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const updateTask = useTaskStore((s) => s.updateTask)
  const dismiss = useTaskStore((s) => s.dismissLabelPrompt)
  const shownAt = useRef(0)
  const labels = useMemo(() => (logId ? frequentLogLabels(presets, tasks, LABEL_PROMPT_CHIPS) : []), [logId, presets, tasks])

  useEffect(() => {
    if (!logId) return
    shownAt.current = Date.now()
    const id = setTimeout(dismiss, 8_000)
    return () => clearTimeout(id)
  }, [logId, dismiss])

  if (!log || log.category || log.color || labels.length === 0) return null

  return (
    <div
      role="status"
      className={`fixed left-1/2 z-50 animate-toast-in w-[min(100vw-1.5rem,24rem)] -translate-x-1/2
                  rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-2xl
                  dark:border-zinc-700 dark:bg-zinc-800 ${MOBILE_FLOAT_BOTTOM}`}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-200">
          {t('floatingTimer.labelPrompt', { title: log.title })}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('common.close')}
          className="-m-1 shrink-0 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {labels.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              if (Date.now() - shownAt.current < COMPLETE_PROMPT_ARM_MS) return
              updateTask(log.id, { category: name })
              dismiss()
            }}
            className={chipClass({ variant: 'outline', size: 'md' }, 'min-h-9 md:min-h-7')}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="gc-dot h-1.5 w-1.5 rounded-full" style={colorVars(categoryHex(name, colors))} aria-hidden />
              {name}
            </span>
          </button>
        ))}
      </div>
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
  const df = useDateFormat()
  // 入力と表示はアプリのタイムゾーンの壁時計（`toAppWall`）。保存するときに本当の瞬間に戻す
  const started = toAppWall(startedAt)
  const [endDate, setEndDate] = useState(() => toDateKey(started))
  const [endTime, setEndTime] = useState(() => clockOf(started))
  const [editing, setEditing] = useState(false)
  // 止めた時刻の本当の瞬間（壁時計の文字列から直接。端末の夏時間で存在しない時刻でずれないように）
  const endAt = toMinutes(endTime) === null ? null : instantFromWall(endDate, endTime, appTimeZone())

  return (
    <div
      role="alertdialog"
      aria-label={t('staleTimer.title')}
      className={`fixed left-1/2 z-50 animate-toast-in w-[min(100vw-1.5rem,26rem)] -translate-x-1/2
                  rounded-2xl border border-amber-300 bg-white p-4 shadow-2xl
                  dark:border-amber-500/40 dark:bg-zinc-800 ${MOBILE_FLOAT_BOTTOM}`}
    >
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('staleTimer.title')}</p>
      <p className={`mt-1 ${HINT_TEXT}`}>{t('staleTimer.body', { title: taskTitle, since: df.monthDayTime(started) })}</p>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* 日付が切れない幅を保つ。スマホ幅では記録ボタンが次の行に回る */}
          <div className="min-w-[10rem] flex-1">
            <DateField
              value={endDate}
              min={toDateKey(started)}
              onChange={setEndDate}
              ariaLabel={t('staleTimer.endDate')}
              className={fieldClass({ size: 'sm' })}
            />
          </div>
          <div className="w-[5.5rem] shrink-0">
            <TimeInput
              value={endTime}
              onChange={setEndTime}
              pickerDefault={endTime}
              ariaLabel={t('staleTimer.endTime')}
              className={fieldClass({ size: 'sm' }, 'w-full')}
            />
          </div>
          <button
            type="button"
            onClick={() => endAt !== null && resolveStaleTimer(new Date(endAt).toISOString())}
            disabled={endAt === null || endAt <= Date.parse(startedAt)}
            className={buttonClass({ variant: 'primary', size: 'sm' }, 'ml-auto shrink-0')}
          >
            {t('staleTimer.saveAt')}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => stopTimer()} className={buttonClass({ variant: 'primary', size: 'sm' })}>
            {t('staleTimer.stopNow')}
          </button>
          <button type="button" onClick={() => setEditing(true)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            {t('staleTimer.chooseEnd')}
          </button>
          <button type="button" onClick={discardActiveTimer} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            {t('staleTimer.discard')}
          </button>
        </div>
      )}
    </div>
  )
}
