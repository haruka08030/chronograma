import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore, selectLiveHabits } from '../../store/taskStore'
import type { HabitRecordIndex } from '../../lib/habitTiming'
import { isPlacedPointHabitOn, pointHabitsOn, untimedHabitsOn } from '../../lib/habitSlots'
import { colorVars } from '../../lib/logCategoryColors'
import { dateFnsLocale, fromDateKey, toDateKey } from '../../lib/dateKey'
import { appTodayKey } from '../../lib/timeZone'
import { tip } from '../../lib/tooltip'
import { CheckIcon } from '../icons'
import { DROP_HIGHLIGHT_CLASS, startTaskDrag } from '../../lib/taskDrag'
import { HabitDayPopover, type HabitDayItem } from './HabitDayPopover'
import { HabitDotMark as DotMark, type DotState } from './HabitDotMark'
import { habitDotState, habitStarted } from './habitDotState'

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
type Popover = { key: string; anchor: Element; highlightId: string | null }

/**
 * 終日の行の下の習慣の段。その日にやる習慣を 1 件 1 つの色の丸で詰めて横に並べ、段の高さを 1 行に保つ。
 * 丸の並びは週を通して習慣の並び（習慣の画面の順）に固定し、同じ習慣を横にたどれるようにする。丸の見た目は `HabitDotMark`。
 * 週・3 日は、その日のマス全体が 1 つのボタン。押すとその日の習慣の一覧（同じ並び）が開き、押した位置にいちばん近い丸の行を目立たせる。
 * 丸を右クリック（タッチは長押し）すると習慣のメニュー、丸以外ならその日の一覧。丸をその日の格子へドラッグすると、その日だけその時間の枠になる。
 * 1 日表示は 1 段。次の 1 件だけ丸＋時刻＋題名（丸が ✓ のボタンで始まっていれば 1 タップ、題名がカード）、残りは週と同じ丸（まだ→達成）。
 * 全部済んだ日は「✓ N」1 つ。
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
  const habits = useTaskStore(selectLiveHabits)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
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
        ...pointHabitsOn(habits, key, habitIndex).map(({ habit, slot, done }) => ({ habit, id: slot.id, time: slot.startTime, done })),
        ...untimedHabitsOn(habits, key, habitIndex).map(({ habit, id, done }) => ({ habit, id, time: null, done })),
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
  // 同じ丸をもう一度押したら閉じる。別の丸なら目立たせる行を替える
  const openList = (key: string, anchor: Element, highlightId: string | null) =>
    setPopover((p) => (p && p.key === key && p.highlightId === highlightId ? null : { key, anchor, highlightId }))
  const popDay = popover && byDay.find((d) => d.key === popover.key)
  const dayLabel = (key: string) =>
    t('weekCalendar.habitDayList', { date: format(fromDateKey(key), 'M/d', { locale: dateFnsLocale(i18n.resolvedLanguage) }) })
  return (
    <div className="flex flex-shrink-0 border-b border-zinc-200 px-2 dark:border-zinc-800">
      <div
        style={{ width: gutterWidth }}
        className={`flex-shrink-0 pr-2 text-right text-[10px] text-zinc-400 ${named ? 'pt-2.5' : 'pt-1.5'}`}
      >
        {t('weekCalendar.habitRow')}
      </div>
      <div ref={gridRef} className={`flex-1 grid ${gridColsClass}`}>
        {byDay.map(({ key, dots, named: namedItems }) => {
          const limit = logLimitMin(key)
          const stateOf = (item: Item): DotState => habitDotState(item, key, today, limit)
          const cellClass = `min-w-0 border-l border-zinc-200 transition-colors dark:border-zinc-700 ${dropKey === key ? DROP_HIGHLIGHT_CLASS : ''}`
          const listOpen = popover?.key === key
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
                      onCheck={() => toggleHabitDate(item.habit.id, key)}
                      openHabitCard={openHabitCard}
                      openHabitMenu={openHabitMenu}
                    />
                  )
                }}
                renderDots={(rest, width) => (
                  <DotsDay
                    className="shrink-0 rounded-md"
                    size="lg"
                    label={dayLabel(key)}
                    items={rest}
                    width={width}
                    open={listOpen}
                    stateOf={stateOf}
                    onOpen={(el, highlightId) => openList(key, el, highlightId)}
                    openHabitMenu={openHabitMenu}
                  />
                )}
                renderAllDone={() => (
                  <PillButton
                    label={t('weekCalendar.habitAllDone', { count: namedItems.length })}
                    open={listOpen}
                    onOpen={(el) => openList(key, el, null)}
                  >
                    <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    {namedItems.length}
                  </PillButton>
                )}
              />
            )
          return (
            <DotsDay
              key={key}
              className={cellClass}
              label={dayLabel(key)}
              isToday={key === today}
              items={dots}
              width={cellWidth}
              open={listOpen}
              stateOf={stateOf}
              onOpen={(el, highlightId) => openList(key, el, highlightId)}
              openHabitMenu={openHabitMenu}
            />
          )
        })}
      </div>
      {popover && popDay && popDay.dots.length > 0 && (
        <HabitDayPopover
          key={`${popover.key}-${popover.highlightId}`}
          anchor={popover.anchor}
          dateKey={popover.key}
          // 1 日表示は段と同じ並び（まだを時刻順→達成）
          items={named ? popDay.named : popDay.dots}
          highlightId={popover.highlightId}
          logLimitMin={logLimitMin}
          openHabitCard={openHabitCard}
          openHabitMenu={openHabitMenu}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

/**
 * 週・3 日の 1 日分のマス。マス全体が一覧を開くボタン（押した位置にいちばん近い丸の行を一覧で目立たせる）。
 * 丸は格子へドラッグでき（ブラウザのドラッグは少し動いてから始まる）、右クリック・長押しで習慣のメニュー
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
  onOpen: (el: Element, highlightId: string | null) => void
  openHabitMenu: (slotId: string, x: number, y: number) => boolean
}) {
  const { t } = useTranslation()
  const d = DOTS[size]
  // 入らない日は入るだけ並べて、残りを「+N」にする（幅が分からない間・テストの jsdom は全部）
  const inner = width - d.pad
  const fits = width <= 0 || items.length * d.minW <= inner
  const shown = fits ? items : items.slice(0, Math.max(0, Math.floor((inner - d.moreW) / d.minW)))
  // 1 件の幅: ゆとりがあれば決まった幅、混んだ日は入るまで詰める
  const slot = width <= 0 ? d.w : Math.max(d.minW, Math.min(d.w, (inner - (fits ? 0 : d.moreW)) / Math.max(1, shown.length)))
  const rest = items.length - shown.length
  /** 押した丸、無ければ押した位置にいちばん近い丸（「+N」がいちばん近ければ目立たせない） */
  const nearest = (e: MouseEvent<HTMLDivElement>): string | null => {
    const hit = (e.target as Element).closest('[data-dot]')
    if (hit) return hit.getAttribute('data-block-id')
    let best: Element | null = null
    let bestDist = Infinity
    for (const el of e.currentTarget.querySelectorAll('[data-dot], [data-more]')) {
      const r = el.getBoundingClientRect()
      const d = Math.abs(r.left + r.width / 2 - e.clientX)
      if (d < bestDist) {
        best = el
        bestDist = d
      }
    }
    return best?.getAttribute('data-block-id') ?? null
  }
  if (items.length === 0) return <div className={className} />
  return (
    <div
      role="button"
      tabIndex={0}
      data-habit-today={isToday || undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
      onClick={(e) => onOpen(e.currentTarget, nearest(e))}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        // eslint-disable-next-line no-restricted-syntax -- 入力欄でないマスのボタン（変換の Enter は来ない）
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onOpen(e.currentTarget, items[0]?.id ?? null)
      }}
      // 丸以外を右クリック・長押ししたら、その日の一覧
      onContextMenu={(e) => {
        e.preventDefault()
        onOpen(e.currentTarget, null)
      }}
      className={`${className} flex ${d.row} cursor-pointer items-center outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500 dark:hover:bg-zinc-800/60
        ${open ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
    >
      {shown.map((item) => (
        <span
          key={item.id}
          data-dot
          data-block-id={item.id}
          data-touch-menu
          // 予定の列に落とすとその日だけその時間の枠、記録の列ならその時間にやった記録（時間なしも同じ）
          draggable
          onDragStart={(e: DragEvent) => startTaskDrag(e, item.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            openHabitMenu(item.id, e.clientX, e.clientY)
          }}
          {...tip(item.time !== null ? `${item.time} ${item.habit.title}` : item.habit.title, { name: true })}
          className="flex h-full shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
          style={{ ...colorVars(item.habit.color), width: slot }}
        >
          <DotMark state={stateOf(item)} large={size === 'lg'} list={size === 'lg'} />
        </span>
      ))}
      {rest > 0 && (
        <span
          data-more
          {...tip(t('weekCalendar.habitRowMore', { count: rest }), { name: true })}
          className="shrink-0 text-center text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"
          style={{ width: d.moreW }}
        >
          +{rest}
        </span>
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
 * 残りは週と同じ丸を同じ行に並べる（まだ→達成の順。丸の並びは 1 つのボタンで、押すとその日の一覧）。題名は丸に場所を譲って省略する。
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
  const label = item.time !== null ? `${item.time} ${item.habit.title}` : item.habit.title
  const dot = <DotMark state={state} large list />
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
      </button>
    </div>
  )
}
