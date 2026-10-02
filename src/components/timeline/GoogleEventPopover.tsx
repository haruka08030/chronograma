import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { ColorPalette } from '../labels/ColorPalette'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'

const WIDTH = 320

/**
 * Google の予定を押したときのカード。色をアプリで付け直せる（API に出ない新しい色の代わり）。
 * 繰り返し予定は Google と同じく「この予定 / すべての繰り返し」を選べる。付けた色は似たタイトルの色なし予定にも広がる。
 */
export function GoogleEventPopover({ eventId, anchor, onClose }: { eventId: string; anchor: AnchorRect; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const event = useTaskStore((s) => s.calendarEvents.find((e) => e.id === eventId) ?? null)
  const setGoogleEventColor = useTaskStore((s) => s.setGoogleEventColor)
  const [scope, setScope] = useState<'event' | 'series'>('series')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
  }, [onClose])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  if (!event) return null
  const recurring = !!event.recurringEventId
  const effectiveScope = recurring ? scope : 'event'
  const hex = event.color ?? DEFAULT_GOOGLE_EVENT_HEX
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const dateText = format(parseISO(`${event.date}T12:00:00`), t('eventCard.dateFormat'), { locale: dateLocale })
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, recurring ? 330 : 290)

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
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          title={`${t('common.close')} (Esc)`}
          className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-[20px_1fr] gap-x-3 gap-y-1 px-5 pb-3">
        <span className="mt-1.5 h-3.5 w-3.5 rounded" style={{ backgroundColor: hex }} aria-hidden />
        <div className="min-w-0">
          <p className="break-words text-lg leading-snug text-zinc-900 dark:text-zinc-100">{event.summary}</p>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
            {dateText}
            {event.startTime && event.endTime && ` · ${event.startTime} – ${event.endTime}`}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('eventCard.google')}</p>
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
