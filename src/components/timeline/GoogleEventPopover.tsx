import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { ColorPalette } from '../labels/ColorPalette'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'
import { TimeInput } from '../TimeInput'
import { addClockMinutes } from '../../lib/clockTime'
import { googleEventTiming, requestGoogleWriteAccess } from '../../lib/googleCalendar'
import { canEditGoogleEvent, moveGoogleEvent, removeGoogleEvent, renameGoogleEvent } from '../../lib/googleEventEdit'
import { useDismiss } from '../../hooks/useDismiss'
import { useHotkey } from '../../hooks/useHotkey'
import { anchoredCardClass } from '../ui/surface'
import { iconButtonClass } from '../ui/iconButtonClass'
import { PillToggle } from '../ui/PillToggle'
import { CloseIcon, OpenPanelIcon, TrashIcon } from '../icons'
import { isSubmitEnter } from '../../lib/keyboard'
import { DateField } from '../DateField'
import { shortcutTip, tip } from '../../lib/tooltip'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SHORTCUTS } from '../../lib/shortcuts'
import { fieldClass } from '../ui/fieldClass'

const WIDTH = 320

/**
 * Google の予定を押したときのカード。書き込みを許可していれば、タイトル・日付・時刻の変更と削除が Google に反映される
 * （繰り返し予定はこの回だけ）。色はアプリで付け直せる（API に出ない新しい色の代わり）。
 * 繰り返し予定は Google と同じく「この予定 / すべての繰り返し」を選べる。付けた色は似たタイトルの色なし予定にも広がる。
 */
export function GoogleEventPopover({ eventId, anchor, onClose }: { eventId: string; anchor: AnchorRect; onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
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
  const layer = useDismiss({ open: true, onClose, inside: [ref] })

  // タイトル入力中の Esc もカードを閉じる（タイトルは閉じるときに保存される）。
  // 入力欄の外の Esc は層の仕組みが閉じる。欄が自分で使った Esc（時刻の取り消し）では閉じない
  useHotkey('Escape', () => onClose(), { scope: layer, allowInInputs: true })
  useHotkey(SHORTCUTS.delete.hotkeys, () => {
    const ev = useTaskStore.getState().calendarEvents.find((x) => x.id === eventId)
    if (!ev || !canEditGoogleEvent(ev, useTaskStore.getState().googleCanWrite)) return false
    removeGoogleEvent(ev)
    onClose()
  }, { scope: layer })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!event) return null
  const recurring = !!event.recurringEventId
  const effectiveScope = recurring ? scope : 'event'
  const hex = event.color ?? DEFAULT_GOOGLE_EVENT_HEX
  const dateText = df.monthDayWeekdayLong(event.date)
  const editable = canEditGoogleEvent(event, googleCanWrite)
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, (recurring ? 330 : 290) + (editable ? 40 : 0))
  const smallField = fieldClass({ size: 'sm' })

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
      const end = fromDateKey(next.date)
      end.setDate(end.getDate() + span)
      void moveGoogleEvent(event, { date: next.date, endDate: span > 0 ? toDateKey(end) : null, startTime: null, endTime: null })
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
      className={anchoredCardClass(sheet)}
      style={style}
    >
      <div className="flex justify-end gap-0.5 px-2 pt-2">
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noreferrer" className={iconButtonClass()} aria-label={t('googleEdit.openInGoogle')} {...tip(t('googleEdit.openInGoogle'))}>
            <OpenPanelIcon className="h-4 w-4" strokeWidth={1.75} />
          </a>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => {
              removeGoogleEvent(event)
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
      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-3">
        <span className="mt-1.5 h-3.5 w-3.5 rounded" style={{ backgroundColor: hex }} aria-hidden />
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
            <p className="break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100">{event.summary}</p>
          )}
          {editable ? (
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
                <div className="flex w-full items-center gap-1.5">
                  <TimeInput value={event.startTime} onChange={(v) => v && commitTiming({ startTime: v })} className={`w-[5.5rem] ${smallField}`} />
                  <span className="text-zinc-400">–</span>
                  <TimeInput value={event.endTime} onChange={(v) => v && commitTiming({ endTime: v })} className={`w-[5.5rem] ${smallField}`} />
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
          <PillToggle
            ariaLabel={t('eventCard.colorScope')}
            options={[
              { value: 'event', label: t('eventCard.scopeEvent') },
              { value: 'series', label: t('eventCard.scopeSeries') },
            ]}
            value={scope}
            onChange={setScope}
          />
        )}
        <ColorPalette
          selectedHex={hex}
          onChoose={(h) => setGoogleEventColor(event, h, effectiveScope)}
          onDefault={() => setGoogleEventColor(event, null, effectiveScope)}
          defaultLabel={t('eventCard.googleColor')}
          defaultHex={event.baseColor ?? DEFAULT_GOOGLE_EVENT_HEX}
          columns={6}
        />
      </div>
    </div>
  )
}
