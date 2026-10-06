import { useLayoutEffect, useMemo, useRef, useState } from 'react'
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

/** 長さの選択肢。設定の既定の長さが無ければ足す */
const DURATIONS = [30, 60, 120]
/** 先の日を見ているときは朝から探す */
const FUTURE_DAY_FROM = 9 * 60
const EDGE = 8
const WIDTH = 288

/**
 * 時間未定のタスクの「時間を決める」（今日の計画のホバーのボタン・スマホのシート）。
 * その日のタイムラインの空きから近い順に 3 つと長さを出し、選ぶとその時間に置く。「その他の時刻…」で自由に入れる。
 * PC は押した所の下に小さく、スマホは下からのシート
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
  const [duration, setDuration] = useState<number>(defaultBlockMinutes)
  const durations = useMemo(
    () => (DURATIONS.includes(defaultBlockMinutes) ? DURATIONS : [...DURATIONS, defaultBlockMinutes].sort((a, b) => a - b)),
    [defaultBlockMinutes],
  )
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useDismiss({ open: true, onClose, inside: [panelRef] })

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
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t('timeSlot.title')}
        data-popover-keep
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
            onChange={(v) => setDuration(Number(v))}
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
                <button type="button" className={row} onClick={() => place(s, s + duration)}>
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
          <button type="button" className={`${row} text-zinc-600 dark:text-zinc-300`} onClick={() => setCustom(true)}>
            {t('timeSlot.custom')}
          </button>
        )}
      </div>
    </>,
    document.body,
  )
}
