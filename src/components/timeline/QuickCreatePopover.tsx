import { useEffect, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { anchoredCardClass } from '../ui/surface'
import { useTranslation } from 'react-i18next'
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
import { ClockIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { PillToggle } from '../ui/PillToggle'
import { isSubmitEnter } from '../../lib/keyboard'
import { tip } from '../../lib/tooltip'
import { addTaskFromQuickText } from '../../lib/quickAddTask'
import { useDateFormat } from '../../hooks/useDateFormat'

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

  useDismiss({ open: true, onClose, inside: [ref] })
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    // 題名はクイック追加と同じに読む。ドラッグした日・時間帯は「書かなかったときの既定値」で、
    // 「明日」「16時」のように書いたらそちらが勝つ（書いたのはドラッグのあとなので、より新しい意図）。
    // 「金曜まで」は締切だけ付き、予定はドラッグした枠のまま。`@リスト` は選んだリストより優先
    let id: string | undefined
    // 作成とタイムゾーンの書き直しは 1 回の取り消しで戻す
    useTaskStore.getState().asOneUndo(() => {
      id = addTaskFromQuickText(name, {
        defaultListId: listId,
        currentListId: listId,
        defaultDate: dateKey,
        defaultTime: { startTime, endTime },
      })
      const created = useTaskStore.getState().tasks.find((x) => x.id === id)
      if (!id || !zone || !created?.scheduledDate || !created.startTime || !created.endTime) return
      // 別のタイムゾーンで作るときは、書いた（またはドラッグした）時刻をそのタイムゾーンの時刻として読む
      const times = { scheduledDate: created.scheduledDate, startTime: created.startTime, endTime: created.endTime }
      updateTask(id, {
        ...timesPatchFromZone({ ...times, kind: 'todo', dueDate: created.dueDate, dueTime: null, endDate: null }, {}, zone),
        timeZone: zone,
      })
    })
    if (!id) return
    lastListId = listId
    onCreated(id, openDetail)
  }

  const df = useDateFormat()
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, googleWritable && !asLog ? 270 : 230)
  const listColor = plannable.find((l) => l.id === listId)?.color ?? '#7986CB'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={asLog ? t('quickCreate.logAria') : t('quickCreate.aria')}
      className={`${anchoredCardClass(sheet)} p-4`}
      style={style}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {googleWritable && !asLog && (
        <PillToggle
          ariaLabel={t('googleEdit.destination')}
          options={[
            { value: 'todo', label: t('googleEdit.destTodo') },
            { value: 'google', label: t('googleEdit.destGoogle') },
          ]}
          value={destination}
          onChange={(d) => {
            setDestination(d)
            inputRef.current?.focus()
          }}
          className="mb-3"
        />
      )}
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (isSubmitEnter(e)) {
            e.preventDefault()
            save(false)
          }
        }}
        placeholder={asLog ? t('quickCreate.logPlaceholder') : t('quickCreate.titlePlaceholder')}
        className="w-full border-b-2 border-zinc-200 bg-transparent pb-1.5 text-lg text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-accent-500 dark:border-zinc-600 dark:text-zinc-100"
      />
      <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <ClockIcon className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.75} />
        <span className="min-w-0">
          {df.monthDayWeekdayLong(dateKey)} · {startTime} – {endTime}
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
                {...tip(zone ? zoneOptionLabel(zone, i18n.resolvedLanguage) : t('timeZone.field'))}
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
          className={buttonClass({ variant: 'ghost', size: 'md' })}
        >
          {t('quickCreate.more')}
        </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          className={buttonClass({ variant: 'primary', size: 'md' })}
        >
          {/* 記録を作るボタンはどこでも「記録する」 */}
          {asLog ? t('records.save') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
