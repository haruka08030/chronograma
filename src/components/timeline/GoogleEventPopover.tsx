import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { ColorPalette } from '../labels/ColorPalette'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'
import { TimeInput } from '../TimeInput'
import { addClockMinutes } from '../../lib/clockTime'
import { googleEventTiming, requestGoogleWriteAccess } from '../../lib/googleCalendar'
import { canEditGoogleEvent, confirmRemoveGoogleEvent, moveGoogleEvent, renameGoogleEvent } from '../../lib/googleEventEdit'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { CloseIcon, TrashIcon } from '../icons'

const WIDTH = 320

/**
 * Google の予定を押したときのカード。書き込みを許可していれば、タイトル・日付・時刻の変更と削除が Google に反映される
 * （繰り返し予定はこの回だけ）。色はアプリで付け直せる（API に出ない新しい色の代わり）。
 * 繰り返し予定は Google と同じく「この予定 / すべての繰り返し」を選べる。付けた色は似たタイトルの色なし予定にも広がる。
 */
export function GoogleEventPopover({ eventId, anchor, onClose }: { eventId: string; anchor: AnchorRect; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const event = useTaskStore((s) => s.calendarEvents.find((e) => e.id === eventId) ?? null)
  const setGoogleEventColor = useTaskStore((s) => s.setGoogleEventColor)
  const googleCanWrite = useTaskStore((s) => s.googleCanWrite)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // 入力中に外側を押して閉じても、書いたタイトルは保存する
  const pendingTitleRef = useRef<string | null>(null)
  useEffect(() => {
    pendingTitleRef.current = titleDraft
  }, [titleDraft])
  useEffect(() => () => {
    const draft = pendingTitleRef.current
    const ev = useTaskStore.getState().calendarEvents.find((x) => x.id === eventId)
    if (draft !== null && ev) void renameGoogleEvent(ev, draft)
  }, [eventId])
  const [scope, setScope] = useState<'event' | 'series'>('series')
  const ref = useRef<HTMLDivElement>(null)
  useEscapeLayer(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // タイトル入力中の Esc もカードを閉じる（タイトルは閉じるときに保存される）
        if (e.key === 'Escape' && !e.isComposing) onClose()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ev = useTaskStore.getState().calendarEvents.find((x) => x.id === eventId)
        if (ev && canEditGoogleEvent(ev, useTaskStore.getState().googleCanWrite)) {
          e.preventDefault()
          if (confirmRemoveGoogleEvent(ev)) onClose()
        }
      }
    }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('[data-popover-keep]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, eventId])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!event) return null
  const recurring = !!event.recurringEventId
  const effectiveScope = recurring ? scope : 'event'
  const hex = event.color ?? DEFAULT_GOOGLE_EVENT_HEX
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const dateText = format(parseISO(`${event.date}T12:00:00`), t('eventCard.dateFormat'), { locale: dateLocale })
  const editable = canEditGoogleEvent(event, googleCanWrite)
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, (recurring ? 330 : 290) + (editable ? 40 : 0))
  const iconButton =
    'rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'
  const fieldClass =
    'rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-600 dark:text-zinc-100'

  const commitTitle = () => {
    if (titleDraft !== null) void renameGoogleEvent(event, titleDraft)
    pendingTitleRef.current = null
    setTitleDraft(null)
  }
  /** 日付・時刻の変更。開始を動かしたら長さを保って終わりもずらす（Google と同じ） */
  const commitTiming = (next: { date?: string; startTime?: string; endTime?: string }) => {
    const cur = googleEventTiming(event)
    if (event.isAllDay) {
      if (!next.date || next.date === cur.date) return
      const span = cur.endDate ? Math.round((parseISO(cur.endDate).getTime() - parseISO(cur.date).getTime()) / 86_400_000) : 0
      const end = new Date(`${next.date}T12:00:00`)
      end.setDate(end.getDate() + span)
      void moveGoogleEvent(event, { date: next.date, endDate: span > 0 ? format(end, 'yyyy-MM-dd') : null, startTime: null, endTime: null })
      return
    }
    let startTime = cur.startTime!
    let endTime = cur.endTime!
    if (next.startTime && next.startTime !== startTime) {
      const dur = (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000
      startTime = next.startTime
      endTime = addClockMinutes(startTime, Math.max(15, Math.round(dur)))
    }
    if (next.endTime) endTime = next.endTime
    const date = next.date ?? cur.date
    if (date === cur.date && startTime === cur.startTime && endTime === cur.endTime) return
    if (startTime === endTime) return
    void moveGoogleEvent(event, { date, startTime, endTime })
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={event.summary}
      tabIndex={-1}
      className={`fixed z-[60] border border-zinc-200 bg-white shadow-2xl outline-none dark:border-zinc-700 dark:bg-zinc-800 ${
        sheet ? 'animate-sheet-in rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'animate-pop-in rounded-2xl'
      }`}
      style={style}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noreferrer" className={iconButton} aria-label={t('googleEdit.openInGoogle')} title={t('googleEdit.openInGoogle')}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
          </a>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => {
              if (confirmRemoveGoogleEvent(event)) onClose()
            }}
            className={iconButton}
            aria-label={t('common.delete')}
            title={`${t('common.delete')} (Delete)`}
          >
            <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          title={`${t('common.close')} (Esc)`}
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-3">
        <span className="mt-1.5 h-3.5 w-3.5 rounded" style={{ backgroundColor: hex }} aria-hidden />
        <div className="min-w-0">
          {editable ? (
            <input
              value={titleDraft ?? event.summary}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  commitTitle()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              aria-label={t('googleEdit.title')}
              className="-mx-1 w-full rounded-md border border-transparent bg-transparent px-1 text-lg leading-snug text-zinc-900 outline-none transition-colors hover:border-zinc-200 focus:border-accent-400 dark:text-zinc-100 dark:hover:border-zinc-600"
            />
          ) : (
            <p className="break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100">{event.summary}</p>
          )}
          {editable ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={event.date}
                onChange={(e) => e.target.value && commitTiming({ date: e.target.value })}
                aria-label={t('googleEdit.date')}
                className={fieldClass}
              />
              {event.startTime && event.endTime && (
                <div className="flex w-full items-center gap-1.5">
                  <TimeInput value={event.startTime} onChange={(v) => v && commitTiming({ startTime: v })} className={`w-[5.5rem] ${fieldClass}`} />
                  <span className="text-zinc-400">–</span>
                  <TimeInput value={event.endTime} onChange={(v) => v && commitTiming({ endTime: v })} className={`w-[5.5rem] ${fieldClass}`} />
                </div>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
              {dateText}
              {event.startTime && event.endTime && ` · ${event.startTime} – ${event.endTime}`}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t('eventCard.google')}
            {editable && recurring && ` · ${t('googleEdit.thisEventOnly')}`}
          </p>
          {!googleCanWrite && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
          {googleCanWrite && !editable && !event.id.startsWith('pending-') && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t('googleEdit.notEditable')}</p>
          )}
        </div>
      </div>
      <div className="space-y-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
        {recurring && (
          <div role="radiogroup" aria-label={t('eventCard.colorScope')} className="flex gap-1 text-xs">
            {(['event', 'series'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={scope === v}
                onClick={() => setScope(v)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  scope === v
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {t(v === 'event' ? 'eventCard.scopeEvent' : 'eventCard.scopeSeries')}
              </button>
            ))}
          </div>
        )}
        <ColorPalette
          selectedHex={hex}
          onChoose={(h) => setGoogleEventColor(event, h, effectiveScope)}
          onDefault={() => setGoogleEventColor(event, null, effectiveScope)}
          defaultLabel={t('eventCard.googleColor')}
          defaultHex={event.baseColor ?? DEFAULT_GOOGLE_EVENT_HEX}
        />
      </div>
    </div>
  )
}
