import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { quickAddDraft, type QuickAddOptions, type QuickAddPicks } from '../lib/quickAddTask'
import { useDateFormat } from '../hooks/useDateFormat'
import { displayListName } from '../lib/displayListName'
import { colorVars } from '../lib/logCategoryColors'
import { colorLabelText } from '../lib/todoColorLabels'
import { ESTIMATE_OPTIONS } from '../lib/estimate'
import { formatDuration } from '../lib/timeGrid'
import { endWithinDay, toMinutes } from '../lib/clockTime'
import { NEUTRAL_HEX } from '../lib/googleColors'
import { DatePickerBody } from './DatePickerBody'
import { TimeInput } from './TimeInput'
import { ColorPalette } from './labels/ColorPalette'
import { ArrowRightIcon, CalendarIcon, ClockIcon, FlagIcon, HourglassIcon } from './icons'
import { chipClass } from './ui/chipClass'
import { fieldClass } from './ui/fieldClass'
import { buttonClass } from './ui/buttonClass'
import { compareByOrder } from '../lib/orderCompare'

type Panel = 'date' | 'time' | 'estimate' | 'due' | 'list' | 'label'

const ICON = 'h-3 w-3 shrink-0'

/**
 * 追加欄の下の詳細のチップ（やる日・時間・見積もり・締切・リスト・ラベル）。入力中だけ出す。
 * チップには足したら付く値（書いた文・選んだ値・欄の既定を重ねた結果、`quickAddDraft`）を出し、押すと下に選ぶ面が開く。
 * 選んだ値（`picks`）は書いた文より勝つ。いつか・チェックリストに入るなら日付のチップは出さない
 */
export function QuickAddDetails({
  text,
  defaultDate,
  defaultListId,
  color,
  picks,
  onPicksChange,
  onPicked,
  className = '',
}: {
  text: string
  picks: QuickAddPicks
  onPicksChange: (picks: QuickAddPicks) => void
  /** 選び終えたとき（入力欄にフォーカスを戻して、Enter で足せるように） */
  onPicked: () => void
  className?: string
} & Pick<QuickAddOptions, 'defaultDate' | 'defaultListId' | 'color'>) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const lists = useTaskStore((s) => s.lists)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  // 選択中のリストが変わったら読み直す
  useTaskStore((s) => s.selectedListId)
  const [panel, setPanel] = useState<Panel | null>(null)

  if (!text.trim()) return null
  const draft = quickAddDraft(text, { defaultDate, defaultListId, color, picks })

  const pick = (patch: QuickAddPicks, close = true) => {
    onPicksChange({ ...picks, ...patch })
    if (close) {
      setPanel(null)
      onPicked()
    }
  }
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  const list = lists.find((l) => l.id === draft.listId)
  const timeText = draft.startTime ? (draft.endTime ? `${draft.startTime}–${draft.endTime}` : draft.startTime) : null
  const dueText = draft.dueDate ? `${df.shortDateWeekday(draft.dueDate)}${draft.dueTime ? ` ${draft.dueTime}` : ''}` : null

  const chip = (id: Panel, icon: ReactNode, value: string | null, empty: string, extraLabel?: string) => (
    <button
      key={id}
      type="button"
      aria-expanded={panel === id}
      aria-label={value ? `${extraLabel ?? empty}: ${value}` : empty}
      onClick={() => toggle(id)}
      className={chipClass(
        { variant: 'outline', size: 'sm' },
        `${value ? '' : 'text-zinc-400 dark:text-zinc-500'} ${panel === id ? 'ring-2 ring-accent-500/30' : ''}`,
      )}
    >
      {icon}
      <span className="max-w-[10rem] truncate">{extraLabel && value ? `${extraLabel} ${value}` : (value ?? empty)}</span>
    </button>
  )

  const chips: ReactNode[] = []
  if (draft.dated) {
    chips.push(
      chip(
        'date',
        <CalendarIcon className={ICON} />,
        draft.scheduledDate ? df.shortDateWeekday(draft.scheduledDate) : null,
        t('quickAdd.chip.date'),
      ),
      chip('time', <ClockIcon className={ICON} />, timeText, t('quickAdd.chip.time')),
      chip(
        'estimate',
        <HourglassIcon className={ICON} />,
        draft.estimateMinutes ? formatDuration(draft.estimateMinutes) : null,
        t('quickAdd.chip.estimate'),
        t('quickAdd.chip.estimate'),
      ),
      chip('due', <FlagIcon className={ICON} />, dueText, t('quickAdd.chip.due'), t('quickAdd.chip.due')),
    )
  }
  chips.push(
    chip(
      'list',
      list ? <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(list.color)} /> : <ArrowRightIcon className={ICON} />,
      list ? displayListName(list.id, list.name) : null,
      t('quickAdd.chip.list'),
    ),
    chip(
      'label',
      <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(draft.color ?? NEUTRAL_HEX)} />,
      draft.color ? colorLabelText(draft.color, presets, colors, t) : null,
      t('quickAdd.chip.label'),
    ),
  )

  const clear = (patch: QuickAddPicks) => (
    <button type="button" onClick={() => pick(patch)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
      {t('quickAdd.chip.clear')}
    </button>
  )

  const optionChip = (key: string, label: ReactNode, selected: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={chipClass(
        { variant: 'outline', size: 'md' },
        selected ? 'border-accent-400 bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300' : '',
      )}
    >
      {label}
    </button>
  )

  let body: ReactNode = null
  if (panel === 'date' || panel === 'due') {
    const isDue = panel === 'due'
    body = (
      <div className="w-[272px] max-w-full">
        <DatePickerBody
          kind={isDue ? 'due' : 'scheduled'}
          value={isDue ? draft.dueDate : draft.scheduledDate}
          onPick={(key) =>
            isDue ? pick({ due: key ? { date: key, time: draft.dueTime } : null }, !key || !draft.dueTime) : pick({ date: key })
          }
        />
        {isDue && draft.dueDate && (
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{t('taskDetail.deadlineTime')}</span>
            <TimeInput
              value={draft.dueTime ?? ''}
              onChange={(v) => pick({ due: { date: draft.dueDate!, time: v || null } }, false)}
              className={fieldClass({ size: 'sm' }, 'w-[6rem]')}
            />
          </div>
        )}
      </div>
    )
  } else if (panel === 'time') {
    const length = draft.estimateMinutes ?? defaultBlockMinutes
    const setTime = (startTime: string, endTime: string) => {
      const s = toMinutes(startTime)
      const e = toMinutes(endTime)
      if (s == null) return
      // 打った終わりが開始より後（または翌 0:00）ならそのまま。無ければ開始＋長さで、
      // 日をまたぐ分はその日の終わりで止める（翌朝の時刻にするとタイムラインに出ない）
      const typedEnd = e != null && (e > s || (e === 0 && s > 0))
      pick({ time: { startTime, endTime: typedEnd ? endTime : endWithinDay(startTime, length) } }, false)
    }
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <TimeInput
          ariaLabel={t('quickAdd.chip.start')}
          value={draft.startTime ?? ''}
          onChange={(v) => (v ? setTime(v, '') : pick({ time: null }, false))}
          className={fieldClass({ size: 'sm' }, 'w-[6rem]')}
        />
        <span className="text-sm text-zinc-400">{t('common.timeRangeSeparator')}</span>
        <TimeInput
          ariaLabel={t('quickAdd.chip.end')}
          value={draft.endTime ?? ''}
          disabled={!draft.startTime}
          pickerDefault={draft.startTime ? endWithinDay(draft.startTime, length) : undefined}
          onChange={(v) => draft.startTime && v && setTime(draft.startTime, v)}
          className={fieldClass({ size: 'sm' }, 'w-[6rem]')}
        />
        <button
          type="button"
          onClick={() => {
            setPanel(null)
            onPicked()
          }}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          {t('quickAdd.chip.done')}
        </button>
        {draft.startTime && clear({ time: null })}
      </div>
    )
  } else if (panel === 'estimate') {
    body = (
      <div className="flex flex-wrap gap-1.5">
        {optionChip('none', t('taskDetail.estimateNone'), draft.estimateMinutes == null, () => pick({ estimateMinutes: null }))}
        {ESTIMATE_OPTIONS.map((m) =>
          optionChip(String(m), formatDuration(m), draft.estimateMinutes === m, () => pick({ estimateMinutes: m })),
        )}
      </div>
    )
  } else if (panel === 'list') {
    body = (
      <div className="flex flex-wrap gap-1.5">
        {[...lists].sort(compareByOrder).map((l) =>
          optionChip(
            l.id,
            <>
              <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(l.color)} />
              {displayListName(l.id, l.name)}
            </>,
            l.id === draft.listId,
            () => pick({ listId: l.id }),
          ),
        )}
      </div>
    )
  } else if (panel === 'label') {
    body = (
      <ColorPalette
        bare
        selectedHex={draft.color}
        onChoose={(hex) => pick({ color: hex })}
        onDefault={() => pick({ color: null })}
        defaultLabel={t('labels.none')}
        defaultHex={NEUTRAL_HEX}
      />
    )
  }

  return (
    // 中を押しても外側（カレンダーのマスなど）に伝えない。文字を書く欄以外を押しても入力欄のフォーカスを外さない（Enter でそのまま足せる）
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- 外へ伝えない・フォーカスを保つためだけ（押して何かする部品ではない）
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('input, select, textarea')) e.preventDefault()
      }}
    >
      <div className="flex flex-wrap gap-1.5">{chips}</div>
      {body && <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">{body}</div>}
    </div>
  )
}
