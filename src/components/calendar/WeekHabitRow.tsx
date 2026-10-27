import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore, selectHabitsByDay } from '../../store/taskStore'
import type { HabitRecordIndex } from '../../lib/habitTiming'
import { isPlacedPointHabitOn, pointHabitsOn, untimedHabitsOn } from '../../lib/habitSlots'
import { colorVars } from '../../lib/logCategoryColors'
import { dateFnsLocale, fromDateKey, toDateKey } from '../../lib/dateKey'
import { appTodayKey } from '../../lib/timeZone'
import { tip } from '../../lib/tooltip'
import { CheckIcon, ChevronDownIcon } from '../icons'
import { DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'
import { HabitDayPopover, type HabitDayItem } from './HabitDayPopover'
import { HabitDotMark as DotMark, type DotState } from './HabitDotMark'
import { HABIT_OFF_TIME_TEXT } from '../../lib/habitMark'
import { habitDotState, habitStarted } from './habitDotState'
import { useHabitToggle } from './useHabitToggle'

/**
 * 丸の並びの大きさ。sm は週・3 日のマス（見た目 12px・間 2px、混んだ日は間を 0 まで詰める）、
 * lg はスマホの 1 日表示の「次の 1 件」の後ろ（見た目 16px・間 4px）
 */
const DOTS = {
  sm: { w: 14, minW: 11.5, moreW: 18, pad: 3, row: 'h-7 px-px' },
  lg: { w: 20, minW: 20, moreW: 26, pad: 0, row: 'h-9' },
} as const
/** 1 日表示: 左右の余白・件の間・「次の 1 件」の最低の幅（丸 32px＋題名 6 文字ほど、時刻つきはその分も） */
const NAMED_PAD = 8
const NAMED_GAP = 4
const HEAD_MIN_W = 32 + 6 * 12 + 4
const HEAD_TIME_W = 34

type Item = HabitDayItem
type Popover = { key: string; anchor: Element }

/**
 * 終日の行の下の習慣の段。その日にやる習慣を 1 件 1 つの色の丸で詰めて横に並べ、段の高さを 1 行に保つ。
 * 丸の並びは週を通して習慣の並び（習慣の画面の順）に固定し、同じ習慣を横にたどれるようにする。丸の見た目は `HabitDotMark`（習慣画面と同じ `gc-mark*`。時間外は点線の輪）。
 * 丸はほかの画面（習慣の表・詳細・今日）と同じく、押すと ✓ / 取り消し（今日で始まっている分と過ぎた日。先の日・まだの時刻は押しても何もしない）。
 * 押し間違えは当たりを丸の間隔いっぱい×段の高さに広げ、✓ のたびに「元に戻す」のトーストを出して防ぐ。
 * 名前・カード・その日の一覧へは、左の「習慣 ▾」（今日、無ければ最初の日の一覧。一覧の ‹ › で日を替える）と「+N」（その日の一覧）から。PC は丸のヒントにも名前。
 * 丸を右クリック（タッチは長押し）すると習慣のメニュー、丸以外ならその日の一覧。丸をその日の格子へドラッグすると、その日だけその時間の枠になる。
 * 1 日表示は 1 段。次の 1 件だけ丸＋時刻＋題名（丸が ✓、題名がカード）、残りは週と同じ丸（押すと ✓）。
 * 全部済んだ日は「✓ N」1 つ（押すと一覧）。
 * その週に 1 つも無ければ出さない
 */
export function WeekHabitRow({
  gridDays,
  gutterWidth,
  gridColsClass,
  habitIndex,
  logLimitMin,
  openHabitCard,
  openHabitMenu,
  dropKey,
  keepEmpty,
}: {
  gridDays: Date[]
  gutterWidth: number
  gridColsClass: string
  habitIndex: HabitRecordIndex
  logLimitMin: (key: string) => number | null
  openHabitCard: (slotId: string, el?: Element | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
  /** 格子の枠を戻そうとしている日（その日のマスを落とし先の色にする） */
  dropKey: string | null
  /** 丸が無くても、格子に置いた日があれば段を残す（PC。ドラッグで戻す落とし先） */
  keepEmpty: boolean
}) {
  const { t, i18n } = useTranslation()
  const habits = useTaskStore(selectHabitsByDay)
  const toggle = useHabitToggle()
  const named = gridDays.length === 1
  const [popover, setPopover] = useState<Popover | null>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  // 段は出たり消えたりするので、要素が付いた・外れたときに測り直す
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    setGridWidth(el.clientWidth)
    roRef.current = new ResizeObserver(() => setGridWidth(el.clientWidth))
    roRef.current.observe(el)
  }, [])
  const byDay = useMemo(() => {
    const order = new Map(habits.map((h, i) => [h.id, i]))
    return gridDays.map((day) => {
      const key = toDateKey(day)
      // 時刻順（時刻ひとつの習慣、その後ろに時間を決めていない習慣）
      const byTime: Item[] = [
        ...pointHabitsOn(habits, key, habitIndex).map(({ habit, slot, done, offTime }) => ({
          habit,
          id: slot.id,
          time: slot.startTime,
          done,
          offTime,
        })),
        ...untimedHabitsOn(habits, key, habitIndex).map(({ habit, id, done, offTime }) => ({ habit, id, time: null, done, offTime })),
      ]
      // 丸と一覧は習慣の並びに固定（日によって入れ替わらない）
      const dots = [...byTime].sort((a, b) => order.get(a.habit.id)! - order.get(b.habit.id)!)
      // 1 日表示はまだの習慣を時刻の早い順に前、達成は後ろ
      const named = [...byTime.filter((i) => !i.done), ...byTime.filter((i) => i.done)]
      return { key, dots, named, placed: habits.some((h) => isPlacedPointHabitOn(h, key)) }
    })
  }, [gridDays, habits, habitIndex])
  // PC は全部の日を格子に置いても、戻す落とし先として段は残す（ドラッグ中に格子がずれないように）。スマホは空なら出さない
  if (!byDay.some((d) => d.dots.length > 0 || (keepEmpty && d.placed))) return null
  const cellWidth = gridWidth / gridDays.length
  const today = appTodayKey()
  // 開いたのと同じ所（「習慣 ▾」・「+N」）をもう一度押したら閉じる
  const openList = (key: string, anchor: Element) => setPopover((p) => (p && p.anchor === anchor ? null : { key, anchor }))
  const withDots = byDay.filter((d) => d.dots.length > 0)
  // 左の「習慣 ▾」: 今日（丸があれば）、無ければ丸のある最初の日
  const startKey = (withDots.find((d) => d.key === today) ?? withDots[0])?.key ?? null
  const popIndex = popover ? withDots.findIndex((d) => d.key === popover.key) : -1
  const popDay = popIndex >= 0 ? withDots[popIndex] : null
  const dayLabel = (key: string) =>
    t('weekCalendar.habitDayList', { date: format(fromDateKey(key), 'M/d', { locale: dateFnsLocale(i18n.resolvedLanguage) }) })
  const checkable = (item: Item, limit: number | null) => item.done || habitStarted(item.time, limit)
  return (
    <div className="flex flex-shrink-0 border-b border-zinc-200 px-2 dark:border-zinc-800">
      <div style={{ width: gutterWidth }} className={`flex flex-shrink-0 items-center justify-end pr-1 ${named ? 'h-9' : 'h-7'}`}>
        {startKey ? (
          <button
            type="button"
            data-habit-list-open
            aria-haspopup="dialog"
            aria-expanded={popover !== null}
            onClick={(e) => openList(startKey, e.currentTarget)}
            {...tip(t('weekCalendar.habitListOpen'))}
            className="group flex h-full items-center pl-1"
          >
            <span
              className={`flex h-5 items-center gap-px rounded-md border pl-1 pr-0.5 text-[10px] text-zinc-500 group-hover:bg-zinc-50 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-200
                ${popover ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-200 dark:border-zinc-700'}`}
            >
              {t('weekCalendar.habitRow')}
              <ChevronDownIcon className="h-3 w-3" />
            </span>
          </button>
        ) : (
          <span className="pr-1 text-[10px] text-zinc-400">{t('weekCalendar.habitRow')}</span>
        )}
      </div>
      <div ref={gridRef} className={`flex-1 grid ${gridColsClass}`}>
        {byDay.map(({ key, dots, named: namedItems }) => {
          const limit = logLimitMin(key)
          const stateOf = (item: Item): DotState => habitDotState(item, key, today, limit)
          const listOpen = popover?.key === key
          const cellClass = `min-w-0 border-l border-zinc-200 transition-colors dark:border-zinc-700 ${
            dropKey === key ? DROP_HIGHLIGHT_CLASS : listOpen && !named ? 'bg-zinc-100 dark:bg-zinc-800' : ''
          }`
          const dotsProps = {
            label: dayLabel(key),
            stateOf,
            canCheck: (item: Item) => checkable(item, limit),
            onCheck: (item: Item) => toggle(item.habit.id, key),
            open: listOpen,
            onOpen: (el: Element) => openList(key, el),
            openHabitMenu,
          }
          if (named)
            return (
              <NamedDay
                key={key}
                className={cellClass}
                items={namedItems}
                width={cellWidth}
                head={namedItems.find((i) => !i.done && habitStarted(i.time, limit)) ?? namedItems.find((i) => !i.done) ?? null}
                renderHead={(item) => {
                  const started = habitStarted(item.time, limit)
                  return (
                    <NamedHabit
                      key={item.id}
                      item={item}
                      state={stateOf(item)}
                      checkLabel={
                        started || item.done
                          ? item.done
                            ? t('weekCalendar.habitUndo')
                            : item.time === null
                              ? t('weekCalendar.habitMarkDone')
                              : t('weekCalendar.habitDoneAsPlanned')
                          : null
                      }
                      onCheck={() => toggle(item.habit.id, key)}
                      openHabitCard={openHabitCard}
                      openHabitMenu={openHabitMenu}
                    />
                  )
                }}
                renderDots={(rest, width) => <DotsDay className="shrink-0" size="lg" items={rest} width={width} {...dotsProps} />}
                renderAllDone={() => (
                  <PillButton
                    label={t('weekCalendar.habitAllDone', { count: namedItems.length })}
                    open={listOpen}
                    onOpen={(el) => openList(key, el)}
                  >
                    <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    {namedItems.length}
                  </PillButton>
                )}
              />
            )
          return <DotsDay key={key} className={cellClass} isToday={key === today} items={dots} width={cellWidth} {...dotsProps} />
        })}
      </div>
      {popover && popDay && (
        <HabitDayPopover
          anchor={popover.anchor}
          dateKey={popover.key}
          // 1 日表示は段と同じ並び（まだを時刻順→達成）
          items={named ? popDay.named : popDay.dots}
          highlightId={null}
          logLimitMin={logLimitMin}
          openHabitCard={openHabitCard}
          openHabitMenu={openHabitMenu}
          // 丸のある日だけを ‹ › でたどる（週・3 日）
          onStep={
            withDots.length > 1
              ? (dir) => {
                  const next = withDots[popIndex + dir]
                  if (next) setPopover({ key: next.key, anchor: popover.anchor })
                }
              : undefined
          }
          canPrev={popIndex > 0}
          canNext={popIndex < withDots.length - 1}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

/**
 * 週・3 日の 1 日分のマス（1 日表示は「次の 1 件」の後ろの丸）。丸 1 つ 1 つが ✓ のボタンで、当たりは丸の間隔いっぱい×段の高さ。
 * 入らない分は「+N」（押すとその日の一覧）。丸は格子へドラッグでき（ブラウザのドラッグは少し動いてから始まる）、右クリック・長押しで習慣のメニュー。
 * 丸の無い所を右クリック・長押しするとその日の一覧（近道）
 */
function DotsDay({
  className,
  label,
  isToday = false,
  size = 'sm',
  items,
  width,
  open,
  stateOf,
  canCheck,
  onCheck,
  onOpen,
  openHabitMenu,
}: {
  className: string
  label: string
  isToday?: boolean
  size?: keyof typeof DOTS
  items: Item[]
  width: number
  open: boolean
  stateOf: (item: Item) => DotState
  canCheck: (item: Item) => boolean
  onCheck: (item: Item) => void
  onOpen: (el: Element) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
}) {
  const { t } = useTranslation()
  const d = DOTS[size]
  // ヒント・読み上げは「21:00 読書」。時間外にやった日は「（時間外）」を添える（丸の下に文字を置く余白が無いので）
  const dotLabel = (item: Item) => {
    const name = item.time !== null ? `${item.time} ${item.habit.title}` : item.habit.title
    return item.offTime ? t('common.withNote', { title: name, note: t('planner.habitOffTime') }) : name
  }
  // 入らない日は入るだけ並べて、残りを「+N」にする（幅が分からない間・テストの jsdom は全部）
  const inner = width - d.pad
  const fits = width <= 0 || items.length * d.minW <= inner
  const shown = fits ? items : items.slice(0, Math.max(0, Math.floor((inner - d.moreW) / d.minW)))
  // 1 件の幅: ゆとりがあれば決まった幅、混んだ日は入るまで詰める
  const slot = width <= 0 ? d.w : Math.max(d.minW, Math.min(d.w, (inner - (fits ? 0 : d.moreW)) / Math.max(1, shown.length)))
  const rest = items.length - shown.length
  if (items.length === 0) return <div className={className} />
  return (
    <div
      role="group"
      aria-label={label}
      data-habit-today={isToday || undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        onOpen(e.currentTarget)
      }}
      className={`${className} flex ${d.row} items-center`}
    >
      {shown.map((item) => {
        const can = canCheck(item)
        const check = () => {
          if (can) onCheck(item)
        }
        return (
          <span
            key={item.id}
            role="button"
            tabIndex={0}
            data-dot
            data-block-id={item.id}
            data-touch-menu
            aria-pressed={can ? item.done : undefined}
            aria-disabled={!can || undefined}
            onClick={check}
            onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
              // eslint-disable-next-line no-restricted-syntax -- 入力欄でない丸のボタン（変換の Enter は来ない）
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              check()
            }}
            // 予定の列に落とすとその日だけその時間の枠、記録の列ならその時間にやった記録（時間なしも同じ）
            draggable
            onDragStart={(e: DragEvent) => startTaskDrag(e, item.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openHabitMenu(item.id, e.clientX, e.clientY)
            }}
            {...tip(dotLabel(item), { name: true })}
            className={`group flex h-full shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 ${
              can ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ ...colorVars(item.habit.color), width: slot }}
          >
            <span
              className={`grid shrink-0 place-items-center rounded-full ${size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} ${
                can ? 'group-hover:bg-zinc-200/70 dark:group-hover:bg-zinc-700' : ''
              }`}
            >
              <DotMark state={stateOf(item)} large={size === 'lg'} />
            </span>
          </span>
        )
      })}
      {rest > 0 && (
        <button
          type="button"
          data-more
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => onOpen(e.currentTarget)}
          {...tip(t('weekCalendar.habitRowMore', { count: rest }), { name: true })}
          className={`h-full shrink-0 rounded text-center text-[11px] tabular-nums text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 ${
            open ? 'bg-zinc-200/70 dark:bg-zinc-700' : ''
          }`}
          style={{ width: d.moreW }}
        >
          +{rest}
        </button>
      )}
    </div>
  )
}

/** 1 日表示の「+N」「✓ N」。見た目は高さ 28px の縁の札、当たりは 44px 四方。押すとその日の一覧 */
function PillButton({
  label,
  open,
  onOpen,
  children,
}: {
  label: string
  open: boolean
  onOpen: (el: Element) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-more
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(e.currentTarget)
      }}
      {...tip(label, { name: true })}
      className="group -my-1 flex h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-7 items-center gap-0.5 rounded-md border px-2 text-[11px] tabular-nums text-zinc-500 group-hover:bg-zinc-50 dark:text-zinc-400 dark:group-hover:bg-zinc-800
          ${open ? 'border-zinc-400 dark:border-zinc-500' : 'border-zinc-200 dark:border-zinc-700'}`}
      >
        {children}
      </span>
    </button>
  )
}

/**
 * 1 日表示の段（1 段）。「次の 1 件」（まだの習慣で始まっているものの時刻のいちばん早い件、無ければまだの先頭）だけ丸＋時刻＋題名で出し、
 * 残りは週と同じ丸を同じ行に並べる（まだ→達成の順。押すと ✓）。題名は丸に場所を譲って省略する。
 * 全部済んだ日は「✓ N」1 つにまとめる
 */
function NamedDay({
  className,
  items,
  width,
  head,
  renderHead,
  renderDots,
  renderAllDone,
}: {
  className: string
  items: Item[]
  width: number
  /** 「次の 1 件」。null は全部済んだ日 */
  head: Item | null
  renderHead: (item: Item) => ReactNode
  renderDots: (items: Item[], width: number) => ReactNode
  renderAllDone: () => ReactNode
}) {
  if (!head) return <div className={`${className} flex h-9 items-center px-1`}>{renderAllDone()}</div>
  const rest = items.filter((i) => i !== head)
  const headMin = HEAD_MIN_W + (head.time !== null ? HEAD_TIME_W : 0)
  // 丸の並びに使える幅（「次の 1 件」に題名 6 文字ほどの幅を残す。題名はそれより長ければ省略して丸に譲る）。幅が分からない間（テストの jsdom も）は 0（全部並べる）
  const dotsW = width > 0 && rest.length > 0 ? Math.max(0, Math.min(rest.length * DOTS.lg.w, width - NAMED_PAD - NAMED_GAP - headMin)) : 0
  return (
    <div className={`${className} flex h-9 items-center gap-x-1 px-1`}>
      {renderHead(head)}
      {rest.length > 0 && renderDots(rest, dotsW)}
    </div>
  )
}

/** 1 日表示の習慣 1 件（丸＋時刻＋題名）。丸は ✓ のボタン、題名はカード */
function NamedHabit({
  item,
  state,
  checkLabel,
  onCheck,
  openHabitCard,
  openHabitMenu,
}: {
  item: Item
  state: DotState
  /** ✓ のボタンの名前（null は先の時刻でまだ達成にできない） */
  checkLabel: string | null
  onCheck: () => void
  openHabitCard: (slotId: string, el?: Element | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
}) {
  const { t } = useTranslation()
  const label = item.time !== null ? `${item.time} ${item.habit.title}` : item.habit.title
  const dot = <DotMark state={state} large />
  return (
    <div
      data-block-id={item.id}
      data-touch-menu
      draggable
      onDragStart={(e) => startTaskDrag(e, item.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openHabitMenu(item.id, e.clientX, e.clientY)
      }}
      style={colorVars(item.habit.color)}
      className="flex h-9 min-w-0 cursor-grab items-center rounded active:cursor-grabbing"
    >
      {checkLabel ? (
        <button
          type="button"
          draggable={false}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onCheck()
          }}
          {...tip(checkLabel, { name: true })}
          aria-pressed={item.done}
          className="-my-1 flex h-11 w-8 shrink-0 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {dot}
        </button>
      ) : (
        <span className="flex h-9 w-8 shrink-0 items-center justify-center">{dot}</span>
      )}
      <button
        type="button"
        draggable={false}
        onClick={(e) => openHabitCard(item.id, e.currentTarget.parentElement)}
        aria-label={label}
        className={`flex h-9 min-w-0 items-center gap-1 pr-1.5 text-left text-xs ${
          state === 'today' || state === 'future' ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500'
        }`}
      >
        {item.time !== null && <span className="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">{item.time}</span>}
        <span className="truncate">{item.habit.title}</span>
        {item.offTime && <span className={`shrink-0 text-[10px] ${HABIT_OFF_TIME_TEXT}`}>{t('planner.habitOffTime')}</span>}
      </button>
    </div>
  )
}
