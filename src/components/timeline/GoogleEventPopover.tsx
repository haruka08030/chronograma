import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { anchoredCardStyle, isAnchoredSheet, memoHeightEstimate, type AnchorRect } from './anchoredCard'
import { CardTimeRange } from './CardTimeRange'
import { googleEventTiming, movedGoogleEventTiming, requestGoogleWriteAccess } from '../../lib/googleCalendar'
import {
  canEditGoogleEvent,
  canSetMyEventTime,
  removeGoogleEvent,
  renameGoogleEvent,
  setMyGoogleEventTime,
} from '../../lib/googleEventEdit'
import { appTimeZone, wallInZone } from '../../lib/timeZone'
import { useDismiss } from '../../hooks/useDismiss'
import { useHotkey } from '../../hooks/useHotkey'
import { nudgeBlockByKey } from '../../lib/timelineBlockEdit'
import { anchoredCardClass } from '../ui/surface'
import { iconButtonClass } from '../ui/iconButtonClass'
import { ChevronDownIcon, CloseIcon, OpenPanelIcon, TrashIcon } from '../icons'
import { ColorPalette } from '../labels/ColorPalette'
import { useLabeledSwatches } from '../../hooks/useLabeledSwatches'
import { isSubmitEnter } from '../../lib/keyboard'
import { DateField } from '../DateField'
import { shortcutTip, tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SHORTCUTS } from '../../lib/shortcuts'
import { fieldClass } from '../ui/fieldClass'
import { HINT_TEXT, META_TEXT, SUBTLE_TEXT } from '../ui/textClass'
import { colorVars, logLabelFromTask } from '../../lib/logCategoryColors'
import { CardActions } from './CardActions'
import { useNow } from '../../hooks/useAppClock'
import { googleRecordPromptId } from '../../hooks/useCompleteWithLog'
import { htmlToPlainText } from '../../lib/linkify'
import { MemoPreview } from '../ui/MemoPreview'
import { openTaskDetail } from '../../lib/overlays'
import { CourseAssignments } from './CourseAssignments'
import { ClassAttendance } from './ClassAttendance'
import { useExitGhost } from '../../hooks/useExitGhost'
import { skippedEventById } from '../../hooks/useShownCalendarEvents'
import { SKIPPED_EVENT_CLASS } from '../ui/rowStateClass'

const WIDTH = 320

/**
 * Google の予定を押したときのカード。書き込みを許可していれば、タイトルの変更と削除が Google に反映される（繰り返し予定はこの回だけ）。
 * 時刻つきの予定の日付・時刻は、Google を変えずに自分の時間にする（#625）。自分の時間のときは開催時間と「開催時間に戻す」を出す。
 * 色は題名の左の色の四角を押して色の一覧から付け直す（#639。アプリだけの色で Google には送らない。書き込めない予定にも付けられる。
 * 繰り返し予定はすべての回に付く）。付けた色は似たタイトルの色なし予定にも広がる。
 * やらなかった予定（#528、時間が過ぎてから消した予定）は、そう書いて削除だけできる（予定していなかったものを消す）。
 */
export function GoogleEventPopover({ eventId, anchor, onClose }: { eventId: string; anchor: AnchorRect; onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const liveEvent = useTaskStore((s) => s.calendarEvents.find((e) => e.id === eventId) ?? null)
  const skippedEntry = useTaskStore((s) => s.skippedEvents.find((e) => e.id === eventId && !e.removed) ?? null)
  const event = liveEvent ?? (skippedEntry ? skippedEventById(eventId) : null)
  const removeSkippedEvent = useTaskStore((s) => s.removeSkippedEvent)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const activeTimer = useTaskStore((s) => s.activeTimer)
  const now = useNow()
  const openRecordPrompt = useTaskStore((s) => s.openRecordPrompt)
  const setGoogleEventColor = useTaskStore((s) => s.setGoogleEventColor)
  const swatches = useLabeledSwatches(true)
  const [pickingColor, setPickingColor] = useState(false)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // 入力中に外側を押して閉じても、書いたタイトルは保存する
  const pendingTitleRef = useRef<string | null>(null)
  useEffect(() => {
    pendingTitleRef.current = titleDraft
  }, [titleDraft])
  useEffect(
    () => () => {
      const draft = pendingTitleRef.current
      const ev = useTaskStore.getState().calendarEvents.find((x) => x.id === eventId)
      if (draft !== null && ev) void renameGoogleEvent(ev, draft)
    },
    [eventId],
  )
  const ref = useRef<HTMLDivElement>(null)
  const exitRef = useExitGhost(ref)
  const layer = useDismiss({ open: true, onClose, inside: [ref], swallow: isAnchoredSheet })

  // タイトル入力中の Esc もカードを閉じる（タイトルは閉じるときに保存される）。
  // 入力欄の外の Esc は層の仕組みが閉じる。欄が自分で使った Esc（時刻の取り消し）では閉じない
  useHotkey('Escape', () => onClose(), { scope: layer, allowInInputs: true })
  useHotkey(
    SHORTCUTS.delete.hotkeys,
    () => {
      const ev = useTaskStore.getState().calendarEvents.find((x) => x.id === eventId)
      if (!ev && skippedEventById(eventId)) useTaskStore.getState().removeSkippedEvent(eventId)
      else if (!ev || !canEditGoogleEvent(ev, useTaskStore.getState().googleCanWrite)) return false
      else removeGoogleEvent(ev)
      onClose()
    },
    { scope: layer },
  )

  // 書き換えられる予定は、カードを開いたまま Alt+↑↓ で 15 分ずつ動かし、Alt+Shift+↑↓ で終わりを伸び縮み（日をまたぐ予定はドラッグと同じく動かさない）
  useHotkey([...SHORTCUTS.nudgeBlock.hotkeys, ...SHORTCUTS.resizeBlock.hotkeys], (e) => void nudgeBlockByKey(`event-${eventId}`, e), {
    scope: layer,
  })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!event) return null
  const recurring = !!event.recurringEventId
  const skipped = event.skipped === true
  const hex = event.color ?? DEFAULT_GOOGLE_EVENT_HEX
  const colorScope = recurring ? 'series' : 'event'
  // 色の四角のヒントは色の一覧の丸と同じ「ラベル名（色名）」
  const colorName = swatches.find((sw) => sw.hex.toUpperCase() === hex.toUpperCase())?.name ?? null
  const colorButtonLabel = colorName ? t('common.withNote', { title: t('labels.changeColor'), note: colorName }) : t('labels.changeColor')
  const dateText = df.monthDayWeekdayLong(event.date)
  const editable = canEditGoogleEvent(event, googleCanWrite)
  const timeEditable = canSetMyEventTime(event)
  const held = event.held ? heldText(event.held, event.date, df.shortDate) : null
  // Google の説明は HTML のことがあるので、メモと同じテキストに直して出す
  const memo = event.description ? htmlToPlainText(event.description) : ''
  const { style, sheet } = anchoredCardStyle(
    anchor,
    WIDTH,
    (recurring ? 210 : 190) + (timeEditable ? 40 : 0) + (pickingColor ? 200 : 0) + (held ? 24 : 0) + 44 + memoHeightEstimate(memo),
  )
  const smallField = fieldClass({ size: 'sm' })
  const nowMs = now.getTime()
  const started = new Date(event.start).getTime() <= nowMs
  const recordEvent = () => {
    openRecordPrompt(googleRecordPromptId(event.id))
    onClose()
  }
  const startEvent = () => {
    const { timeLogTagPresets, logCategoryColors, startTimer } = useTaskStore.getState()
    const label = logLabelFromTask(event, timeLogTagPresets, logCategoryColors)
    startTimer(event.summary, label.tags, null, label.color)
    onClose()
  }

  const commitTitle = () => {
    if (titleDraft !== null) void renameGoogleEvent(event, titleDraft)
    pendingTitleRef.current = null
    setTitleDraft(null)
  }
  /**
   * 日付・時刻の変更（自分の時間にする。Google の予定は変えない）。日付・開始を動かしたら長さを保って終わりもずらす（日をまたぐ予定は終わりの日も）
   */
  const commitTiming = (next: { date?: string; startTime?: string; endTime?: string }) => {
    const cur = googleEventTiming(event)
    if (next.endTime) {
      if (next.endTime === cur.endTime) return
      // 終わりの時刻だけ変えた: 丸 1 日以上続く予定は終わりの日を保つ。それより短ければ、終わりが始まり以前なら翌日
      const long = new Date(event.end).getTime() - new Date(event.start).getTime() >= 86_400_000
      if (!long && next.endTime === cur.startTime) return
      setMyGoogleEventTime(event, { date: cur.date, endDate: long ? cur.endDate : null, startTime: cur.startTime, endTime: next.endTime })
      return
    }
    const date = next.date ?? cur.date
    const startTime = next.startTime ?? cur.startTime
    if (date === cur.date && startTime === cur.startTime) return
    setMyGoogleEventTime(event, movedGoogleEventTiming(event, date, startTime))
  }

  return (
    <div
      ref={exitRef}
      role="dialog"
      aria-label={event.summary}
      tabIndex={-1}
      className={anchoredCardClass(sheet)}
      // メモが長いと背が伸びる。画面からはみ出す分はカードの中でスクロール（To-Do・記録のカードと同じ）。
      // 時刻の候補リストは開くと今の時刻の行が見えるところまでカードごとスクロールされる
      style={{ ...style, maxHeight: sheet ? '85vh' : `calc(100vh - ${Number(style.top ?? 0)}px - 12px)`, overflowY: 'auto' }}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            className={iconButtonClass()}
            aria-label={t('googleEdit.openInGoogle')}
            {...tip(t('googleEdit.openInGoogle'))}
          >
            <OpenPanelIcon className="h-4 w-4" strokeWidth={1.75} />
          </a>
        )}
        {(editable || skipped) && (
          <button
            type="button"
            onClick={() => {
              if (skipped) removeSkippedEvent(event.id)
              else removeGoogleEvent(event)
              onClose()
            }}
            className={iconButtonClass()}
            aria-label={t('common.delete')}
            {...shortcutTip(t('common.delete'), 'delete')}
          >
            <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          {...shortcutTip(t('common.close'), 'close')}
          className={iconButtonClass()}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-5 pb-3">
        {skipped ? (
          <span className="gc-dot mx-1.5 mt-1.5 h-3.5 w-3.5 rounded" style={colorVars(hex)} aria-hidden />
        ) : (
          // 押すと色の一覧。枠と ▾ でボタンと分かる形にする（ホバーしなくても押せると分かる）
          <button
            type="button"
            onClick={() => setPickingColor((v) => !v)}
            aria-expanded={pickingColor}
            aria-label={colorButtonLabel}
            {...tip(colorName ?? t('labels.changeColor'))}
            className="mt-0.5 flex h-7 items-center gap-0.5 self-start rounded-md border border-zinc-200 px-1 text-zinc-500 transition-colors touch-manipulation hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <span className="gc-dot h-3.5 w-3.5 rounded" style={colorVars(hex)} aria-hidden />
            <ChevronDownIcon className="h-3 w-3" strokeWidth={2} aria-hidden />
          </button>
        )}
        <div className="min-w-0">
          {editable ? (
            <input
              value={titleDraft ?? event.summary}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (isSubmitEnter(e)) {
                  e.preventDefault()
                  commitTitle()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              aria-label={t('googleEdit.title')}
              className="-mx-1 w-full rounded-md border border-transparent bg-transparent px-1 text-lg leading-snug text-zinc-900 outline-none transition-colors hover:border-zinc-200 focus:border-accent-400 dark:text-zinc-100 dark:hover:border-zinc-600"
            />
          ) : (
            <p className={`break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100 ${skipped ? SKIPPED_EVENT_CLASS : ''}`}>
              {event.summary}
            </p>
          )}
          {pickingColor && (
            <div className="-mx-1 mt-1.5">
              <ColorPalette
                bare
                fill
                selectedHex={hex}
                onChoose={(h) => {
                  setGoogleEventColor(event, h, colorScope)
                  setPickingColor(false)
                }}
                onDefault={() => {
                  setGoogleEventColor(event, null, colorScope)
                  setPickingColor(false)
                }}
                defaultLabel={t('eventCard.googleColor')}
                defaultHex={event.baseColor ?? DEFAULT_GOOGLE_EVENT_HEX}
              />
            </div>
          )}
          {timeEditable ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <div className="w-48">
                <DateField
                  value={event.date}
                  onChange={(v) => commitTiming({ date: v })}
                  ariaLabel={t('googleEdit.date')}
                  className={smallField}
                />
              </div>
              {event.startTime && event.endTime && (
                <CardTimeRange
                  startTime={event.startTime}
                  endTime={event.endTime}
                  onStart={(v) => commitTiming({ startTime: v })}
                  onEnd={(v) => commitTiming({ endTime: v })}
                  startLabel={t('common.start')}
                  endLabel={t('common.end')}
                />
              )}
            </div>
          ) : (
            <p className={`mt-0.5 ${SUBTLE_TEXT}`}>
              {dateText}
              {event.startTime && event.endTime && ` · ${event.startTime} – ${event.endTime}`}
            </p>
          )}
          {/* 自分の時間にしているときだけ、Google にある開催時間と、開催時間に戻すボタン */}
          {held && (
            <p className={`mt-1 ${META_TEXT}`}>
              {t('googleEdit.heldTime', { time: held })}
              <button
                type="button"
                onClick={() => useTaskStore.getState().clearMyEventTime(event.id)}
                className="ml-1.5 rounded px-1 font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
              >
                {t('googleEdit.useHeldTime')}
              </button>
            </p>
          )}
          {/* 操作は題名・時刻のすぐ下（アプリの予定のカードと同じ行）。始まった予定は記録にし、▶ で今から記録を始められる（終わった予定も） */}
          {!skipped && (
            <CardActions
              record={started && !event.isAllDay ? { label: t('eventCard.toRecord'), onClick: recordEvent } : undefined}
              onStart={startEvent}
              startDisabled={!!activeTimer && !activeTimer.taskId && activeTimer.taskTitle === event.summary}
            />
          )}
          <p className={`mt-1 ${META_TEXT}`}>
            {skipped ? `${t('googleEdit.skipped')} · ${t('eventCard.google')}` : t('eventCard.google')}
            {editable && recurring && ` · ${t('googleEdit.thisEventOnly')}`}
          </p>
          {skipped && <p className={`mt-1 ${HINT_TEXT}`}>{t('googleEdit.skippedHint')}</p>}
          {!googleCanWrite && !skipped && (
            <p className={`mt-1 ${HINT_TEXT}`}>
              {t('googleEdit.reconnectHint')}
              <button
                type="button"
                onClick={() => requestGoogleWriteAccess()}
                className="ml-1.5 rounded px-1 font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
              >
                {t('googleEdit.reconnect')}
              </button>
            </p>
          )}
          {googleCanWrite && !editable && !skipped && !event.id.startsWith('pending-') && (
            <p className={`mt-1 ${HINT_TEXT}`}>{t('googleEdit.notEditable')}</p>
          )}
        </div>
        {memo && (
          <>
            <span />
            <MemoPreview text={memo} />
          </>
        )}
      </div>
      {/* 欠席の一覧にある名前の授業: 欠席の数と「欠席にする」（#503） */}
      <ClassAttendance title={event.summary} date={event.date} />
      {/* 授業の予定（時刻のある予定）: その科目の未完了の課題（#309） */}
      {!event.isAllDay && (
        <CourseAssignments
          title={event.summary}
          onOpenTask={(taskId) => {
            onClose()
            openTaskDetail(taskId)
          }}
        />
      )}
    </div>
  )
}

/** 開催時間の文（「13:00–15:00」。自分の時間と日が違えば日付も） */
function heldText(held: { start: string; end: string }, myDate: string, shortDate: (key: string) => string): string {
  const tz = appTimeZone()
  const start = wallInZone(Date.parse(held.start), tz)
  const end = wallInZone(Date.parse(held.end), tz)
  const range = `${start.time}–${end.time}`
  return start.date === myDate ? range : `${shortDate(start.date)} ${range}`
}
