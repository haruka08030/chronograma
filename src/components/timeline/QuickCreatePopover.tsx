import { useEffect, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/useDismiss'
import { anchoredCardClass } from '../ui/surface'
import { useTranslation } from 'react-i18next'
import { useTaskStore, INBOX_LIST_ID } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'
import { unplannedListIds } from '../../lib/listKind'
import { colorVars } from '../../lib/logCategoryColors'
import { anchoredCardStyle, isAnchoredSheet, type AnchorRect } from './anchoredCard'
import { TimeLogTagField } from '../TimeLogTagField'
import { LogTitleInput } from '../LogTitleInput'
import { useLogDraft } from '../../hooks/useLogDraft'
import { addGoogleEvent } from '../../lib/googleEventEdit'
import { DEFAULT_GOOGLE_EVENT_HEX } from '../../lib/googleColors'
import { appTimeZone, gmtLabel, zoneCityName, zoneLongName, zoneOptionLabel } from '../../lib/timeZone'
import { timesPatchFromZone } from '../../lib/taskTimeZone'
import { TimeZonePicker } from '../TimeZonePicker'
import { ClockIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { PillToggle } from '../ui/PillToggle'
import { isCancelEscape, isSubmitEnter } from '../../lib/keyboard'
import { tip } from '../../lib/tooltip'
import { addTaskFromQuickText } from '../../lib/quickAddTask'
import { useDateFormat } from '../../hooks/useDateFormat'
import { endKeepingLength, minutesToTime, toMinutes } from '../../lib/clockTime'
import { CardTimeRange } from './CardTimeRange'
import { TITLE_MAX_LENGTH } from '../../lib/textLimits'
import { compareByOrder } from '../../lib/orderCompare'
import { pickTodoForSlot } from '../../lib/slotFitTodo'
import { formatDuration } from '../../lib/timeGrid'
import { menuDateHint } from '../../lib/menuDateHint'
import { toastTitle } from '../../lib/undoWindow'
import { MENU_ROW_HOVER, MENU_ROW_PRESS } from '../ui/surface'
import { RecentLogChips } from '../RecentLogChips'
import { useExitGhost } from '../../hooks/useExitGhost'

const WIDTH = 340
let lastListId: string = INBOX_LIST_ID
/** リストの欄で「Google カレンダー」を選んだとき（予定だけ。Google の予定として作る） */
const GOOGLE_TARGET = '__google__'
/** 「◯◯を置く」の文の中で題名の入る所の目印 */
const FIT_TITLE = '\u0001'

/** 作るもの（Google カレンダーのクイック作成の「予定 / タスク」と同じ切り替え）と、予定を Google に作るか。端末に覚える */
type QuickCreateChoice = { kind: 'todo' | 'event'; eventToGoogle: boolean }
const CHOICE_KEY = 'chronograma-quick-create-v1'

function readChoice(): QuickCreateChoice {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(CHOICE_KEY) ?? 'null') as Partial<QuickCreateChoice> | null
    return { kind: raw?.kind === 'event' ? 'event' : 'todo', eventToGoogle: raw?.eventToGoogle === true }
  } catch {
    return { kind: 'todo', eventToGoogle: false }
  }
}

function saveChoice(choice: QuickCreateChoice) {
  try {
    globalThis.localStorage?.setItem(CHOICE_KEY, JSON.stringify(choice))
  } catch {
    /* 覚えられなくても今回の作成はできる */
  }
}

const TITLE_INPUT =
  'w-full border-b-2 border-zinc-200 bg-transparent pb-1.5 text-lg text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-accent-500 dark:border-zinc-600 dark:text-zinc-100'

/**
 * 空き時間をクリック / ドラッグしたときの作成カード（Google カレンダーのクイック作成相当）。
 * 上で To-Do（完了の丸つき）か予定（バイト・授業など。完了の丸なし）かを選び、タイトルとリストだけ決めて保存。
 * Google とつないで書き込めるときは、予定のリストの欄に「Google カレンダー」も並ぶ（Google の予定として作る）。
 * 選んだもの（To-Do / 予定、予定を Google に作るか）は次に開いたときも同じ。
 * 日時を押すと開始・終了の時刻欄になり、その場で分単位に直せる（Google と同じ。仮の枠も動く）。
 * 細かい設定は「その他のオプション」で作ってから詳細を開く。外側クリック・Esc は破棄（Google と同じ）。
 * `asLog`（「今日」の記録の列）では、リストの代わりに分類を選んで記録として保存する。
 */
export function QuickCreatePopover({
  anchor,
  dateKey,
  startTime,
  endTime,
  asLog = false,
  onTimesChange,
  onClose,
  onCreated,
}: {
  anchor: AnchorRect
  dateKey: string
  startTime: string
  endTime: string
  asLog?: boolean
  /** 時刻欄で直したとき（開始・終了の両方） */
  onTimesChange: (startTime: string, endTime: string) => void
  onClose: () => void
  /** 作成後。`openDetail` が true なら詳細を開く */
  onCreated: (taskId: string, openDetail: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const updateTask = useTaskStore((s) => s.updateTask)
  const addTimeLog = useTaskStore((s) => s.addTimeLog)
  // 記録の列では、名前を打つと推定したラベルを先に選び、過去の記録を候補に出す
  const { title, category, taskId, color, setTitle, setCategory, pick } = useLogDraft({ infer: asLog })
  const googleWritable = useTaskStore((s) => s.googleConnected && s.googleCanWrite)
  const [choice, setChoice] = useState<QuickCreateChoice>(readChoice)
  const asEvent = !asLog && choice.kind === 'event'
  const toGoogle = asEvent && googleWritable && choice.eventToGoogle
  const [editingTime, setEditingTime] = useState(false)
  /** 別のタイムゾーンで作る（Google と同じく、時刻の数字はそのままでそのタイムゾーンの時刻になる）。記録はいつも手元の時刻 */
  const [zone, setZone] = useState<string | null>(null)
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const plannable = useMemo(() => [...lists].filter((l) => !excludedListIds.has(l.id)).sort(compareByOrder), [lists, excludedListIds])
  const tasks = useTaskStore((s) => s.tasks)
  const slotStart = toMinutes(startTime) ?? 0
  const slotMinutes = (toMinutes(endTime) ?? 0) - slotStart
  // 枠に入る To-Do を 1 件だけ（記録の列では出さない。書き始めたら消す）
  const fit = useMemo(
    () => (asLog ? null : pickTodoForSlot(tasks, dateKey, slotMinutes, excludedListIds)),
    [asLog, tasks, dateKey, slotMinutes, excludedListIds],
  )
  const showFit = fit != null && title.trim() === ''
  const [listId, setListId] = useState(() => (plannable.some((l) => l.id === lastListId) ? lastListId : INBOX_LIST_ID))
  const ref = useRef<HTMLDivElement>(null)
  const exitRef = useExitGhost(ref)
  const inputRef = useRef<HTMLInputElement>(null)

  useDismiss({ open: true, onClose, inside: [ref], swallow: isAnchoredSheet })
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const save = (openDetail: boolean) => {
    if (asLog) {
      // 空欄なら分類名で記録（記録の入力はどこでも同じ規則）
      const name = title.trim() || category.trim() || t('quickCreate.untitled')
      addTimeLog(name, dateKey, startTime, endTime, category.trim() ? [category.trim()] : [], undefined, undefined, color, taskId)
      onClose()
      return
    }
    const name = title.trim() || t('quickCreate.untitled')
    saveChoice(choice)
    if (toGoogle) {
      void addGoogleEvent(name, { date: dateKey, startTime, endTime, timeZone: zone })
      onClose()
      return
    }
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
        kind: asEvent ? 'event' : undefined,
      })
      const created = useTaskStore.getState().tasks.find((x) => x.id === id)
      if (!id || !zone || !created?.scheduledDate || !created.startTime || !created.endTime) return
      // 別のタイムゾーンで作るときは、書いた（またはドラッグした）時刻をそのタイムゾーンの時刻として読む
      const times = { scheduledDate: created.scheduledDate, startTime: created.startTime, endTime: created.endTime }
      updateTask(id, {
        ...timesPatchFromZone({ ...times, kind: created.kind, dueDate: created.dueDate, dueTime: null, endDate: null }, {}, zone),
        timeZone: zone,
      })
    })
    if (!id) return
    lastListId = listId
    onCreated(id, openDetail)
  }

  const placeFit = () => {
    if (!fit?.estimateMinutes) return
    const end = minutesToTime(Math.min(slotStart + fit.estimateMinutes, 24 * 60))
    updateTask(
      fit.id,
      { scheduledDate: dateKey, startTime, endTime: end },
      t('undo.timeSet', { title: toastTitle(fit.title), time: `${startTime}–${end}` }),
    )
    onClose()
  }

  // 題名だけ切り詰めるので、文の前後（言語で語順が違う）を分けて出す
  const fitText =
    fit?.estimateMinutes != null
      ? t('quickCreate.fit', {
          title: FIT_TITLE,
          meta: fit.dueDate
            ? t('quickCreate.fitMetaDue', {
                length: formatDuration(fit.estimateMinutes),
                due: menuDateHint([{ date: fit.dueDate, time: fit.dueTime }], i18n.resolvedLanguage),
              })
            : formatDuration(fit.estimateMinutes),
        }).split(FIT_TITLE)
      : []

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSubmitEnter(e)) {
      e.preventDefault()
      save(false)
    }
  }

  const df = useDateFormat()
  const { style, sheet } = anchoredCardStyle(anchor, WIDTH, 270 + (editingTime ? 30 : 0) + (showFit ? 32 : 0))
  const listColor = toGoogle ? DEFAULT_GOOGLE_EVENT_HEX : (plannable.find((l) => l.id === listId)?.color ?? '#7986CB')

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- ダイアログの中のキー（Esc で閉じる）をまとめて受ける
    <div
      ref={exitRef}
      role="dialog"
      aria-label={asLog ? t('quickCreate.logAria') : t('quickCreate.aria')}
      className={`${anchoredCardClass(sheet)} p-4`}
      style={style}
      onKeyDown={(e) => {
        // 時刻欄が自分で使った Esc（打ちかけの取り消し）ではカードを閉じない
        if (isCancelEscape(e) && !e.defaultPrevented) onClose()
      }}
    >
      {!asLog && (
        // Google と同じく「予定 / To-Do」。予定には完了の丸が付かない
        <PillToggle
          ariaLabel={t('quickCreate.kind')}
          options={[
            { value: 'event', label: t('quickCreate.kindEvent') },
            { value: 'todo', label: t('quickCreate.kindTodo') },
          ]}
          value={choice.kind}
          onChange={(kind) => {
            setChoice((c) => ({ ...c, kind }))
            inputRef.current?.focus()
          }}
          className="mb-3"
        />
      )}
      {asLog ? (
        <LogTitleInput
          inputRef={inputRef}
          value={title}
          onChange={setTitle}
          onPick={pick}
          // 置いた枠に重なる予定と、その時間帯にいつもやっていることを、書く前から出す
          when={{ dateKey, start: startTime, end: endTime }}
          onKeyDown={onTitleKeyDown}
          placeholder={t('quickCreate.logPlaceholder')}
          className={TITLE_INPUT}
        />
      ) : (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX_LENGTH}
          onKeyDown={onTitleKeyDown}
          placeholder={t('quickCreate.titlePlaceholder')}
          className={TITLE_INPUT}
        />
      )}
      {asLog && title.trim() === '' && (
        // 書く前に、よく記録するものから 1 タップでこの時間を埋める（今日の画面の締めにあった記録の無い時間の埋め方）
        <RecentLogChips
          className="mt-2"
          ariaLabel={(name) => t('planner.gapRecordAs', { title: name, start: startTime, end: endTime })}
          onPick={(r) => {
            addTimeLog(r.title, dateKey, startTime, endTime, r.category ? [r.category] : [])
            onClose()
          }}
        />
      )}
      {showFit && fit.estimateMinutes != null && (
        // 既にある To-Do を枠の開始に見積もりの長さで置く（1 件だけ。選ぶ前に選択肢を並べない）
        <button
          type="button"
          onClick={placeFit}
          className={`-mx-1.5 mt-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-center rounded-md px-1.5 py-1 text-left text-sm text-zinc-600 transition-colors dark:text-zinc-300 ${MENU_ROW_HOVER} ${MENU_ROW_PRESS}`}
        >
          <span className="shrink-0 whitespace-pre">{fitText[0]}</span>
          <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-100">{fit.title || t('quickCreate.untitled')}</span>
          <span className="shrink-0 whitespace-pre">{fitText[1]}</span>
        </button>
      )}
      <div className={`mt-3 flex gap-2 text-sm text-zinc-600 dark:text-zinc-300 ${editingTime ? 'items-start' : 'items-center'}`}>
        <ClockIcon className={`h-4 w-4 shrink-0 text-zinc-400 ${editingTime ? 'mt-0.5' : ''}`} strokeWidth={1.75} />
        {editingTime ? (
          <div className="min-w-0">
            <p>{df.monthDayWeekdayLong(dateKey)}</p>
            <div className="mt-1.5">
              <CardTimeRange
                startTime={startTime}
                endTime={endTime}
                onStart={(v) => v !== startTime && onTimesChange(v, endKeepingLength(startTime, endTime, v))}
                // 終わりは開始より後だけ（この日の中の枠）
                onEnd={(v) => toMinutes(v)! > toMinutes(startTime)! && onTimesChange(startTime, v)}
                startLabel={t('common.start')}
                endLabel={t('common.end')}
              />
            </div>
          </div>
        ) : (
          // Google のクイック作成と同じく、日時を押すと時刻を直せる
          <button
            type="button"
            onClick={() => setEditingTime(true)}
            className="-mx-1.5 min-w-0 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
          >
            {df.monthDayWeekdayLong(dateKey)} · {startTime} – {endTime}
          </button>
        )}
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
      ) : (
        <label className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(listColor)} aria-hidden />
          <span className="sr-only">{t('quickCreate.list')}</span>
          <select
            value={toGoogle ? GOOGLE_TARGET : listId}
            onChange={(e) => {
              const v = e.target.value
              // Google の予定のカレンダー選びと同じく、予定の作成先はリストの欄で選ぶ（To-Do のリスト選びでは変えない）
              if (asEvent) setChoice((c) => ({ ...c, eventToGoogle: v === GOOGLE_TARGET }))
              if (v !== GOOGLE_TARGET) setListId(v)
            }}
            className="min-w-0 flex-1 rounded-md bg-transparent py-1 outline-none hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            {plannable.map((l) => (
              <option key={l.id} value={l.id}>
                {displayListName(l.id, l.name)}
              </option>
            ))}
            {asEvent && googleWritable && <option value={GOOGLE_TARGET}>{t('googleEdit.destGoogle')}</option>}
          </select>
        </label>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        {!asLog && !toGoogle && (
          <button type="button" onClick={() => save(true)} className={buttonClass({ variant: 'ghost', size: 'md' })}>
            {t('quickCreate.more')}
          </button>
        )}
        <button type="button" onClick={() => save(false)} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {/* 記録を作るボタンはどこでも「記録する」 */}
          {asLog ? t('records.save') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
