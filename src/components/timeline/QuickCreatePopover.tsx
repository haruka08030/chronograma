import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore, INBOX_LIST_ID } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { unplannedListIds } from '../../lib/listKind'
import { colorVars } from '../../lib/logCategoryColors'
import { anchoredCardStyle, type AnchorRect } from './anchoredCard'
import { TimeLogTagField } from '../TimeLogTagField'
import { addGoogleEvent } from '../../lib/googleEventEdit'
import { appTimeZone, gmtLabel, zoneCityName, zoneLongName, zoneOptionLabel } from '../../lib/timeZone'
import { timesPatchFromZone } from '../../lib/taskTimeZone'
import { TimeZonePicker } from '../TimeZonePicker'

const WIDTH = 340
let lastListId: string = INBOX_LIST_ID
/** 作成先（Google カレンダーのクイック作成の「予定 / タスク」と同じ切り替え）。前回の選択を覚える */
let lastDestination: 'todo' | 'google' = 'todo'

/**
 * 空き時間をクリック / ドラッグしたときの作成カード（Google カレンダーのクイック作成相当）。
 * タイトルとリストだけ決めて保存。細かい設定は「その他のオプション」で作ってから詳細を開く。
 * 外側クリック・Esc は破棄（Google と同じ）。
 * `asLog`（「今日」の記録の列）では、リストの代わりに分類を選んで記録として保存する。
 */
export function QuickCreatePopover({
  anchor,
  dateKey,
  startTime,
  endTime,
  asLog = false,
  onClose,
  onCreated,
}: {
  anchor: AnchorRect
  dateKey: string
  startTime: string
  endTime: string
  asLog?: boolean
  onClose: () => void
  /** 作成後。`openDetail` が true なら詳細を開く */
  onCreated: (taskId: string, openDetail: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  const [title, setTitle] = useState('')
  const googleWritable = useTaskStore((s) => s.googleConnected && s.googleCanWrite)
  const [destination, setDestination] = useState<'todo' | 'google'>(lastDestination)
  const toGoogle = !asLog && googleWritable && destination === 'google'
  const [category, setCategory] = useState('')
  /** 別のタイムゾーンで作る（Google と同じく、時刻の数字はそのままでそのタイムゾーンの時刻になる）。記録はいつも手元の時刻 */
  const [zone, setZone] = useState<string | null>(null)
  const plannable = useMemo(() => {
    const excluded = unplannedListIds(lists)
    return [...lists].filter((l) => !excluded.has(l.id)).sort((a, b) => a.order - b.order)
  }, [lists])
  const [listId, setListId] = useState(() => (plannable.some((l) => l.id === lastListId) ? lastListId : INBOX_LIST_ID))
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [onClose])

  const save = (openDetail: boolean) => {
    if (asLog) {
      // 空欄なら分類名で記録（記録の入力はどこでも同じ規則）
      const name = title.trim() || category.trim() || t('quickCreate.untitled')
      addTimeLog(name, dateKey, startTime, endTime, category.trim() ? [category.trim()] : [])
      onClose()
      return
    }
    const name = title.trim() || t('quickCreate.untitled')
    if (toGoogle) {
      lastDestination = 'google'
      void addGoogleEvent(name, { date: dateKey, startTime, endTime, timeZone: zone })
      onClose()
      return
    }
    if (googleWritable) lastDestination = 'todo'
    const id = addTask(name, listId)
    if (!id) return
    const times = { scheduledDate: dateKey, startTime, endTime }
    updateTask(
      id,
      zone
        ? { ...timesPatchFromZone({ ...times, isTimeLog: false, dueDate: null, dueTime: null, endDate: null }, {}, zone), timeZone: zone }
        : times,
    )
    lastListId = listId
    onCreated(id, openDetail)
  }

  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, googleWritable && !asLog ? 270 : 230)
  const listColor = plannable.find((l) => l.id === listId)?.color ?? '#7986CB'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={asLog ? t('quickCreate.logAria') : t('quickCreate.aria')}
      className={`fixed z-[60] border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-800 ${
        sheet ? 'animate-sheet-in rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]' : 'animate-pop-in rounded-2xl'
      }`}
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {googleWritable && !asLog && (
        <div role="tablist" aria-label={t('googleEdit.destination')} className="mb-3 flex gap-1 text-xs">
          {(['todo', 'google'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={destination === d}
              onClick={() => {
                setDestination(d)
                inputRef.current?.focus()
              }}
              className={`rounded-full px-3 py-1 transition-colors ${
                destination === d
                  ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {t(d === 'todo' ? 'googleEdit.destTodo' : 'googleEdit.destGoogle')}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.nativeEvent.isComposing) {
            e.preventDefault()
            save(false)
          }
        }}
        placeholder={asLog ? t('quickCreate.logPlaceholder') : t('quickCreate.titlePlaceholder')}
        className="w-full border-b-2 border-zinc-200 bg-transparent pb-1.5 text-lg text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-accent-500 dark:border-zinc-600 dark:text-zinc-100"
      />
      <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="min-w-0">
          {format(parseISO(`${dateKey}T12:00:00`), t('eventCard.dateFormat'), { locale: dateLocale })} · {startTime} – {endTime}
        </span>
        {!asLog && (
          <TimeZonePicker
            ariaLabel={t('timeZone.field')}
            value={zone}
            nullOption={t('timeZone.useApp', { zone: zoneLongName(appTimeZone(), i18n.resolvedLanguage) })}
            onChange={(tz) => setZone(tz && tz !== appTimeZone() ? tz : null)}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t('timeZone.field')}
                title={zone ? zoneOptionLabel(zone, i18n.resolvedLanguage) : t('timeZone.field')}
                onClick={toggle}
                className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                  zone ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
                }`}
              >
                {zone ? `${zoneCityName(zone)} (${gmtLabel(zone)})` : gmtLabel(appTimeZone())}
              </button>
            )}
          />
        )}
      </div>
      {asLog ? (
        <div className="mt-3">
          <TimeLogTagField value={category} onChange={setCategory} compact />
        </div>
      ) : toGoogle ? null : (
      <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(listColor)} aria-hidden />
        <span className="sr-only">{t('quickCreate.list')}</span>
        <select
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="min-w-0 flex-1 rounded-md bg-transparent py-1 outline-none hover:bg-zinc-50 dark:hover:bg-zinc-700"
        >
          {plannable.map((l) => (
            <option key={l.id} value={l.id}>
              {displayListName(l.id, l.name)}
            </option>
          ))}
        </select>
      </label>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        {!asLog && !toGoogle && (
        <button
          type="button"
          onClick={() => save(true)}
          className="rounded-full px-3 py-1.5 text-sm text-accent-700 transition-colors hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
        >
          {t('quickCreate.more')}
        </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          className="rounded-full bg-accent-600 px-4 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-700"
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}
