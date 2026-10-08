import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useDismiss } from '../hooks/useDismiss'
import { useIsCoarsePointer, useIsDesktop } from '../hooks/useMediaQuery'
import { busySpans, findFreeSlots } from '../lib/freeSlots'
import { minutesToTime, toMinutes } from '../lib/clockTime'
import { isAppToday, zonedNow } from '../lib/timeZone'
import { fromDateKey } from '../lib/dateKey'
import { toastTitle } from '../lib/undoWindow'
import { anchoredCardClass, MENU_ROW_HOVER, MENU_ROW_PRESS } from './ui/surface'
import { Segmented } from './ui/Segmented'
import { TimeInput } from './TimeInput'
import { buttonClass } from './ui/buttonClass'
import { MenuLabel } from './ui/Menu'
import { formatDuration } from '../lib/timeGrid'
import { isImeKeyEvent, isTypingTarget } from '../lib/keyboard'
import { TIME_SLOT_MENU_WIDTH } from '../lib/timeSlotTarget'

/** 長さの選択肢。見積もり・設定の既定の長さが無ければ足す */
const DURATIONS = [30, 60, 120]
/** 先の日を見ているときは朝から探す */
const FUTURE_DAY_FROM = 9 * 60
const EDGE = 8
const WIDTH = TIME_SLOT_MENU_WIDTH
/** ↑↓ で動く項目（空きの候補と「その他の時刻…」） */
const ITEM = '[data-slot-item]'

/**
 * 時間未定のタスクの「時間を決める」（今日の計画のホバーのボタン・スマホのシート）。
 * その日のタイムラインの空きから近い順に 3 つと長さを出し、選ぶとその時間に置く。「その他の時刻…」で自由に入れる。
 * PC は押した所の下に小さく、スマホは下からのシート。
 * キー（PC）: 開くと最初の候補にフォーカス、↑↓ で候補、←→・数字で長さ、Enter で置く、Esc で閉じて開く前の所（一覧の行）へ戻る
 */
export function TimeSlotMenu({
  x,
  y,
  taskId,
  dateKey,
  onClose,
}: {
  x: number
  y: number
  taskId: string
  dateKey: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const coarse = useIsCoarsePointer()
  const desktop = useIsDesktop()
  const sheet = coarse && !desktop
  const task = useTaskStore((s) => s.tasks.find((x) => x.id === taskId))
  const tasks = useTaskStore((s) => s.tasks)
  const events = useTaskStore((s) => s.calendarEvents)
  const updateTask = useTaskStore((s) => s.updateTask)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  // 見積もりがあればその長さから（無ければ設定の既定の予定の長さ）
  const initialDuration = task?.estimateMinutes ?? defaultBlockMinutes
  const [duration, setDuration] = useState<number>(initialDuration)
  const durations = useMemo(
    () => (DURATIONS.includes(initialDuration) ? DURATIONS : [...DURATIONS, initialDuration].sort((a, b) => a - b)),
    [initialDuration],
  )
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useDismiss({ open: true, onClose, inside: [panelRef] })

  // 閉じたら、開いたときのフォーカス（S で開いた一覧の箱・押したボタン）へ戻す。中で別の所へ移したあと（クリックで他を押した）は動かさない
  const [returnFocus] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  useLayoutEffect(() => {
    const panel = panelRef.current
    return () => {
      const active = document.activeElement
      const lost = !active || active === document.body || (panel?.contains(active) ?? false)
      if (lost && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [returnFocus])

  const slots = useMemo(() => {
    const now = zonedNow()
    const from = isAppToday(fromDateKey(dateKey)) ? now.getHours() * 60 + now.getMinutes() : FUTURE_DAY_FROM
    return findFreeSlots(busySpans(tasks, events, dateKey, taskId), { from, duration })
  }, [tasks, events, dateKey, taskId, duration])

  // PC: 画面からはみ出さないよう、押した所の下（入らなければ上）に置く
  useLayoutEffect(() => {
    if (sheet || !panelRef.current) return
    const r = panelRef.current.getBoundingClientRect()
    const left = Math.min(Math.max(EDGE, x), window.innerWidth - r.width - EDGE)
    const top = y + r.height + EDGE > window.innerHeight ? Math.max(EDGE, y - r.height - 8) : y
    setPos({ left, top })
  }, [sheet, x, y, custom])

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
  // PC は開いたら最初の候補（無ければ「その他の時刻…」）にフォーカス。スマホのシートでは動かさない（キーボードが出る・ずれる）
  useEffect(() => {
    if (sheet) return
    items()[0]?.focus({ preventScroll: true })
    // 開いたときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 長さを変えると候補が並び直すので、変える前と同じ位置の候補へフォーカスを戻す
  const refocusIndexRef = useRef<number | null>(null)
  useEffect(() => {
    const i = refocusIndexRef.current
    if (i == null) return
    refocusIndexRef.current = null
    const list = items()
    list[Math.min(i, list.length - 1)]?.focus({ preventScroll: true })
  }, [slots])
  // 「その他の時刻…」を開いたら開始の欄へ（押したボタンが消えてフォーカスが外へ落ちないように）
  useEffect(() => {
    if (custom && !sheet) panelRef.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [custom, sheet])

  const changeDuration = (d: number) => {
    if (d === duration) return
    const i = items().indexOf(document.activeElement as HTMLElement)
    refocusIndexRef.current = i >= 0 ? i : null
    setDuration(d)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 時刻の入力中・変換中はその欄のキー
    if (e.defaultPrevented || isImeKeyEvent(e.nativeEvent) || isTypingTarget(e.target)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = items()
      if (list.length === 0) return
      e.preventDefault()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next =
        i < 0 ? (e.key === 'ArrowDown' ? 0 : list.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
      list[next].focus()
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const i = durations.indexOf(duration)
      const next = durations[Math.min(durations.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))]
      if (next != null) changeDuration(next)
      return
    }
    // 1・2・3…: 長さを左から選ぶ
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0
    if (n > 0 && n <= durations.length) {
      e.preventDefault()
      changeDuration(durations[n - 1])
    }
  }

  if (!task) return null

  const place = (s: number, e: number) => {
    const startTime = minutesToTime(s)
    const endTime = minutesToTime(Math.min(e, 24 * 60))
    updateTask(
      taskId,
      { scheduledDate: dateKey, startTime, endTime },
      t('undo.timeSet', { title: toastTitle(task.title), time: `${startTime}–${endTime}` }),
    )
    onClose()
  }
  const customStart = toMinutes(start)
  const customEnd = toMinutes(end)
  const customOk = customStart != null && customEnd != null && customEnd > customStart

  const row = `flex w-full items-center rounded-lg px-3 py-2 text-left text-sm tabular-nums text-zinc-800 transition-colors dark:text-zinc-100 ${MENU_ROW_HOVER} ${MENU_ROW_PRESS} pointer-coarse:min-h-11`

  return createPortal(
    <>
      {sheet && <div className="fixed inset-0 z-[59] animate-fade-in bg-black/30" aria-hidden onClick={onClose} />}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 中の候補・長さのボタンの矢印キーをまとめて受ける */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('timeSlot.title')}
        data-popover-keep
        onKeyDown={onKeyDown}
        className={`${anchoredCardClass(sheet)} p-2 ${sheet ? 'inset-x-0 bottom-0' : ''}`}
        style={sheet ? undefined : { left: pos.left, top: pos.top, width: WIDTH }}
      >
        {sheet && <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />}
        <MenuLabel>{task.title}</MenuLabel>
        <div className="px-2 pb-2 pt-1">
          <Segmented
            size="sm"
            fullWidth
            ariaLabel={t('timeSlot.duration')}
            value={String(duration)}
            onChange={(v) => changeDuration(Number(v))}
            options={durations.map((d) => ({
              value: String(d),
              label:
                d % 60 !== 0 && d > 60
                  ? formatDuration(d)
                  : t(d < 60 ? 'timeSlot.minutes' : 'timeSlot.hours', { count: d < 60 ? d : d / 60 }),
            }))}
          />
        </div>
        {slots.length > 0 ? (
          <ul>
            {slots.map((s) => (
              <li key={s}>
                <button type="button" data-slot-item className={row} onClick={() => place(s, s + duration)}>
                  {minutesToTime(s)} – {minutesToTime(Math.min(s + duration, 24 * 60))}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">{t('timeSlot.none')}</p>
        )}
        <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
        {custom ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            <TimeInput value={start} onChange={setStart} ariaLabel={t('timeSlot.start')} className="w-[5.5rem]" />
            <span aria-hidden>–</span>
            <TimeInput value={end} onChange={setEnd} ariaLabel={t('timeSlot.end')} className="w-[5.5rem]" />
            <button
              type="button"
              disabled={!customOk}
              onClick={() => customOk && place(customStart, customEnd)}
              className={buttonClass({ variant: 'primary', size: 'sm' }, 'ml-auto')}
            >
              {t('timeSlot.place')}
            </button>
          </div>
        ) : (
          <button type="button" data-slot-item className={`${row} text-zinc-600 dark:text-zinc-300`} onClick={() => setCustom(true)}>
            {t('timeSlot.custom')}
          </button>
        )}
      </div>
    </>,
    document.body,
  )
}
