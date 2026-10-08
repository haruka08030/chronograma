import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { searchTasks } from '../lib/searchTasks'
import { openTaskDetail, openTaskMenu } from '../lib/overlays'
import { canPickTime, openTimeSlotUnderRow, timeSlotDateKey, TIME_SLOT_MENU_WIDTH } from '../lib/timeSlotTarget'
import { canStartTimerFor, startTimerForTask } from '../lib/timerDrop'
import { displayListName } from '../lib/displayListName'
import { taskPlacementDate } from '../lib/taskTimeRange'
import { isImeKeyEvent, isSubmitEnter, matchesHotkey, shortcutLabel } from '../lib/keyboard'
import { SHORTCUTS } from '../lib/shortcuts'
import { useTodayToggle } from '../hooks/useTodayToggle'
import { useDateFormat } from '../hooks/useDateFormat'
import { isLogTask, type Task } from '../types/task'
import type { TaskList } from '../types/list'
import { Modal } from './ui/Modal'
import { MENU_ROW_ACTIVE, MENU_ROW_HOVER } from './ui/surface'
import { HINT_TEXT, META_TEXT } from './ui/textClass'
import { CalendarArrowIcon, ClockIcon, OpenPanelIcon, PlayIcon, SearchIcon } from './icons'

/** 一度に出す結果の数（パレットは「探してすぐ選ぶ」所。全部見るなら To-Do の検索欄） */
const MAX_RESULTS = 30
const ICON = 'h-3.5 w-3.5 flex-shrink-0'

type PaletteAction = 'today' | 'time' | 'timer'

/** 結果の To-Do にその場でできること（行のメニュー `TaskContextMenu` の短いシートと同じ条件） */
function availableActions(task: Task, lists: readonly TaskList[]): Record<PaletteAction, boolean> {
  const plannable = (lists.find((l) => l.id === task.listId)?.kind ?? 'tasks') === 'tasks' && !isLogTask(task)
  return {
    today: plannable && !task.completed,
    time: canPickTime(task, lists),
    timer: plannable && canStartTimerFor(task),
  }
}

/**
 * ⌘K の検索パレット。今の画面の上に小さく出し、画面は切り替えない（今日の計画を組みながら探せる）。
 * - 打つと題名・メモ・タグで絞る（To-Do の検索欄と同じ `searchTasks`）
 * - ↑↓ で選び、Enter で詳細。⌥T 今日やる / 明日へ回す・⌥S 時間を決める・⌥L 記録を始める（下の段のボタンでも）
 * - Esc・⌘K・背景で閉じ、開く前のフォーカスへ戻す（`Modal`）
 */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const todayToggle = useTodayToggle()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const results = useMemo(() => searchTasks(tasks, query).slice(0, MAX_RESULTS), [tasks, query])
  const current = results[Math.min(active, results.length - 1)] as Task | undefined
  const actions = current ? availableActions(current, lists) : null
  const optionId = (id: string) => `${listboxId}-${id}`

  const move = (delta: number) => {
    if (results.length === 0) return
    const next = (Math.min(active, results.length - 1) + delta + results.length) % results.length
    setActive(next)
    document.getElementById(optionId(results[next].id))?.scrollIntoView({ block: 'nearest' })
  }

  const openDetail = (task: Task) => {
    // 先に閉じる（フォーカスが元の場所へ戻ってから詳細が開くので、詳細を閉じるとそこへ戻る）
    onClose()
    openTaskDetail(task.id)
  }

  const run = (kind: PaletteAction, task: Task) => {
    if (!availableActions(task, lists)[kind]) return
    if (kind === 'today') {
      const toggle = todayToggle([task.id])
      onClose()
      toggle.run()
    } else if (kind === 'timer') {
      onClose()
      startTimerForTask(task.id)
    } else {
      // 今の画面にその行があればその下に、無ければパレットの行があった所に「時間を決める」を出す
      const r = document.getElementById(optionId(task.id))?.getBoundingClientRect()
      const dateKey = timeSlotDateKey(task)
      onClose()
      // 閉じてフォーカスが元の場所へ戻ってから開く（「時間を決める」は閉じたらその場所へ戻す）
      window.setTimeout(() => {
        if (document.querySelector(`[data-task-row="${CSS.escape(task.id)}"]`)) openTimeSlotUnderRow(task.id, dateKey)
        else
          openTaskMenu({ kind: 'timeSlot', x: r ? r.right - TIME_SLOT_MENU_WIDTH : 0, y: r ? r.bottom + 4 : 0, taskId: task.id, dateKey })
      }, 0)
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 変換中・変換を確定する Enter / 取り消す Esc は日本語入力のためのもの
    if (isImeKeyEvent(e.nativeEvent)) return
    const native = e.nativeEvent
    const hit = (keys: readonly string[]) => keys.some((k) => matchesHotkey(native, k))
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (isSubmitEnter(e) && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      if (current) openDetail(current)
    } else if (hit(SHORTCUTS.searchAnywhere.hotkeys)) {
      e.preventDefault()
      onClose()
    } else if (hit(SHORTCUTS.paletteToday.hotkeys) || hit(SHORTCUTS.palettePickTime.hotkeys) || hit(SHORTCUTS.paletteTimer.hotkeys)) {
      // 使えない操作でも、⌥ で打たれる記号（Mac の † など）は欄に入れない
      e.preventDefault()
      if (!current) return
      run(hit(SHORTCUTS.paletteToday.hotkeys) ? 'today' : hit(SHORTCUTS.palettePickTime.hotkeys) ? 'time' : 'timer', current)
    }
  }

  const keyHint = (display: readonly (readonly string[])[]) => shortcutLabel([...display[0]])

  return (
    <Modal
      onClose={onClose}
      label={t('palette.label')}
      width="lg"
      placement="top"
      initialFocus={inputRef}
      closeKeys={[...SHORTCUTS.searchAnywhere.hotkeys]}
      className="flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-zinc-700">
        <SearchIcon className="h-4 w-4 flex-shrink-0 text-zinc-400 dark:text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={t('palette.placeholder')}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(current.id) : undefined}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {query.trim() === '' ? (
        <p className={`px-4 py-3 ${HINT_TEXT}`}>{t('palette.hint')}</p>
      ) : results.length === 0 ? (
        <p className={`px-4 py-3 ${HINT_TEXT}`}>{t('search.empty')}</p>
      ) : (
        <div id={listboxId} role="listbox" aria-label={t('search.title')} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.map((task) => {
            const selected = task.id === current?.id
            const listName = lists.find((l) => l.id === task.listId)?.name
            const date = taskPlacementDate(task)
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- キーは入力欄の ↑↓・Enter（aria-activedescendant）で扱う
              <div
                key={task.id}
                id={optionId(task.id)}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onMouseMove={() => {
                  if (!selected) setActive(results.indexOf(task))
                }}
                onClick={() => openDetail(task)}
                className={`flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 ${selected ? MENU_ROW_ACTIVE : MENU_ROW_HOVER}`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    task.completed ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  {task.title}
                </span>
                <span className={`flex-shrink-0 truncate ${META_TEXT}`}>
                  {[listName !== undefined ? displayListName(task.listId, listName) : null, date ? df.shortDateWeekday(date) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {current && actions && (
        <div className="flex flex-wrap items-center gap-1 border-t border-zinc-100 px-2 py-1.5 dark:border-zinc-700">
          {actions.today && (
            <PaletteButton
              icon={<CalendarArrowIcon className={ICON} />}
              label={todayToggle([current.id]).label}
              keys={keyHint(SHORTCUTS.paletteToday.display)}
              onClick={() => run('today', current)}
            />
          )}
          {actions.time && (
            <PaletteButton
              icon={<ClockIcon className={ICON} />}
              label={t('timeSlot.title')}
              keys={keyHint(SHORTCUTS.palettePickTime.display)}
              onClick={() => run('time', current)}
            />
          )}
          {actions.timer && (
            <PaletteButton
              icon={<PlayIcon className={ICON} />}
              label={t('palette.startTimer')}
              keys={keyHint(SHORTCUTS.paletteTimer.display)}
              onClick={() => run('timer', current)}
            />
          )}
          <span className="flex-1" />
          <PaletteButton
            icon={<OpenPanelIcon className={ICON} />}
            label={t('palette.open')}
            keys="Enter"
            onClick={() => openDetail(current)}
          />
        </div>
      )}
    </Modal>
  )
}

/** 下の段の操作。キーはホバーできる画面（PC）だけ右に添える（`MenuItem` と同じ） */
function PaletteButton({ icon, label, keys, onClick }: { icon: ReactNode; label: string; keys: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-600 transition-colors dark:text-zinc-300 ${MENU_ROW_HOVER}`}
    >
      {icon}
      <span>{label}</span>
      <span className="hidden text-zinc-400 dark:text-zinc-500 [@media(hover:hover)]:inline">{keys}</span>
    </button>
  )
}
