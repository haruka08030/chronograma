import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { addDays, format, nextMonday } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useDismiss } from '../hooks/useDismiss'
import { IS_MAC, shortcutLabel } from '../lib/keyboard'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { appToday } from '../lib/timeZone'
import { displayListName } from '../lib/displayListName'
import { PRIORITY_RING_CLASS } from '../lib/priorityColor'
import type { Priority } from '../types/task'
import { POPOVER_PANEL } from './ui/surface'
import { DatePickerBody } from './DatePickerBody'
import { MenuDivider, MenuItem, MenuLabel } from './ui/Menu'
import {
  ArchiveIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FlagIcon,
  OpenPanelIcon,
  SectionIcon,
  SearchIcon,
  TrashIcon,
} from './icons'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'

const PRIORITIES: Priority[] = ['high', 'medium', 'low', 'none']

/** 画面の端からはみ出さないための余白 */
const EDGE = 8
/** 項目に乗せてから中のメニューが開くまで（斜めに通り過ぎただけで切り替わらないように） */
const SUB_OPEN_DELAY_MS = 120

const ICON = 'h-4 w-4 flex-shrink-0'

type SubId = 'due' | 'priority' | 'list' | 'section'

/** 押すと実行する項目 */
type Leaf = {
  id: string
  label: string
  /** 検索結果で前に付ける「期限」「移動」など */
  group?: string
  icon?: ReactNode
  /** 右端に出す日付 */
  hint?: string
  /** 右端に出すショートカット（キーボードのある PC だけ） */
  keys?: string
  danger?: boolean
  checked?: boolean
  run: () => void
}

type MainItem = { kind: 'sub'; id: SubId; label: string; icon: ReactNode } | { kind: 'leaf'; leaf: Leaf }

function LeafRow({ leaf, active, onHover, withGroup = false }: { leaf: Leaf; active: boolean; onHover: () => void; withGroup?: boolean }) {
  return (
    <MenuItem icon={leaf.icon} hint={leaf.hint} keys={leaf.keys} checked={leaf.checked} danger={leaf.danger} active={active} onMouseEnter={onHover} onClick={leaf.run}>
      {withGroup && leaf.group && <span className="text-zinc-400 dark:text-zinc-500">{leaf.group} › </span>}
      {leaf.label}
    </MenuItem>
  )
}

/**
 * タスク行の右クリックメニュー（Notion のブロックメニューのように、検索・キー操作・横に開く中のメニュー）。
 * 選択中の行を右クリックしたときは選択中のタスクすべてに効く。
 * 開くと検索欄に入るので、そのまま打って絞り込める（「明日」「いつか」など中のメニューの項目も出る）。
 * ↑↓ で選ぶ、→ / Enter で中のメニュー、← で戻る、Esc で閉じる
 */
export function TaskContextMenu({
  x,
  y,
  taskIds,
  onClose,
  onDone,
  onOpenDetail,
  above = false,
}: {
  x: number
  y: number
  /** true なら (x, y) の上に出す（スマホの「操作」ボタンから開くとき） */
  above?: boolean
  taskIds: string[]
  onClose: () => void
  /** 何か実行したあと（選択の解除など） */
  onDone?: () => void
  /** 詳細を開く（無い所では「詳細を開く」を出さない） */
  onOpenDetail?: (taskId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const lists = useTaskStore((s) => s.lists)
  const sections = useTaskStore((s) => s.sections)
  const allTasks = useTaskStore((s) => s.tasks)
  const bulk = useBulkTaskActions()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [sub, setSub] = useState<SubId | null>(null)
  /** 中のメニューで選んでいる項目。-1 は外側のメニューを操作中 */
  const [subActive, setSubActive] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const subTimer = useRef(0)
  useDismiss({ open: true, onClose, inside: [menuRef, subRef] })

  const targets = useMemo(() => allTasks.filter((x) => taskIds.includes(x.id)), [allTasks, taskIds])
  /** 全部が同じ値ならその値（チェックを付ける） */
  const shared = <T,>(pick: (task: (typeof targets)[number]) => T): T | undefined => {
    const values = new Set(targets.map(pick))
    return values.size === 1 ? [...values][0] : undefined
  }
  const sharedDue = shared((x) => x.dueDate ?? null)
  const sharedPriority = shared((x) => x.priority)
  const sharedList = shared((x) => x.listId)
  const sharedSection = shared((x) => x.sectionId ?? null)

  const run = (fn: () => void) => {
    fn()
    onDone?.()
    onClose()
  }

  const today = appToday()
  const dayHint = (key: string) => format(fromDateKey(key), 'M/d (EEE)', { locale: dateLocale })
  const dueLeaves: Leaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ]
    .map((o): Leaf => ({
      id: `due-${o.key}`,
      label: o.label,
      group: t('common.due'),
      hint: dayHint(o.key),
      checked: sharedDue === o.key,
      run: () => run(() => bulk.setDue(taskIds, o.key, o.label)),
    }))
    .concat({
      id: 'due-none',
      label: t('dueDatePicker.clear'),
      group: t('common.due'),
      checked: sharedDue === null,
      run: () => run(() => bulk.setDue(taskIds, null, '')),
    })
  const priorityLeaves: Leaf[] = PRIORITIES.map((p) => ({
    id: `priority-${p}`,
    label: t(`common.${p}`),
    group: t('common.priority'),
    icon: <FlagIcon className={`${ICON} ${p === 'none' ? 'text-zinc-400' : PRIORITY_RING_CLASS[p]}`} />,
    checked: sharedPriority === p,
    run: () => run(() => bulk.setPriority(taskIds, p)),
  }))
  const listLeaves: Leaf[] = [...lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      id: `list-${l.id}`,
      label: displayListName(l.id, l.name),
      group: t('taskMenu.moveTo'),
      icon: <span className="mx-[3px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: l.color }} />,
      checked: sharedList === l.id,
      run: () => run(() => bulk.moveToList(taskIds, l.id)),
    }))
  // セクション: 全部が同じリストの親タスクで、そのリストにセクションがあるときだけ
  const sectionNone = t('taskDetail.sectionNone')
  const sectionLeaves: Leaf[] =
    sharedList && targets.every((x) => !x.parentId)
      ? [...sections]
          .filter((sec) => sec.listId === sharedList)
          .sort((a, b) => a.order - b.order)
          .map((sec): Leaf => ({
            id: `section-${sec.id}`,
            label: sec.name,
            group: t('taskDetail.section'),
            checked: sharedSection === sec.id,
            run: () => run(() => bulk.moveToSection(taskIds, sec.id, sec.name)),
          }))
      : []
  if (sectionLeaves.length > 0) {
    sectionLeaves.unshift({
      id: 'section-none',
      label: sectionNone,
      group: t('taskDetail.section'),
      checked: sharedSection === null,
      run: () => run(() => bulk.moveToSection(taskIds, null, sectionNone)),
    })
  }
  const actionLeaves: Leaf[] = [
    {
      id: 'complete',
      label: t('taskList.markComplete'),
      icon: <CheckIcon className={ICON} />,
      keys: shortcutLabel(['mod', '↵']),
      run: () => run(() => bulk.complete(taskIds)),
    },
    ...(taskIds.length === 1 && onOpenDetail
      ? [{
          id: 'open',
          label: t('taskMenu.open'),
          icon: <OpenPanelIcon className={ICON} />,
          keys: '↵',
          run: () => run(() => onOpenDetail(taskIds[0])),
        }]
      : []),
    { id: 'archive', label: t('taskItem.archive'), icon: <ArchiveIcon className={ICON} />, run: () => run(() => bulk.archive(taskIds)) },
    {
      id: 'delete',
      label: t('taskItem.deleteAria'),
      icon: <TrashIcon className={ICON} />,
      keys: IS_MAC ? '⌫' : 'Del',
      danger: true,
      run: () => run(() => bulk.remove(taskIds)),
    },
  ]
  const subLeaves: Record<SubId, Leaf[]> = { due: dueLeaves, priority: priorityLeaves, list: listLeaves, section: sectionLeaves }

  const mainItems: MainItem[] = [
    { kind: 'sub', id: 'due', label: t('common.due'), icon: <CalendarIcon className={ICON} /> },
    { kind: 'sub', id: 'priority', label: t('common.priority'), icon: <FlagIcon className={ICON} /> },
    { kind: 'sub', id: 'list', label: t('taskMenu.moveTo'), icon: <ArrowRightIcon className={ICON} /> },
    ...(sectionLeaves.length > 0
      ? [{ kind: 'sub' as const, id: 'section' as const, label: t('taskMenu.moveToSection'), icon: <SectionIcon className={ICON} /> }]
      : []),
    ...actionLeaves.map((leaf): MainItem => ({ kind: 'leaf', leaf })),
  ]
  const q = query.trim().toLowerCase()
  const results = q
    ? [...actionLeaves, ...dueLeaves, ...priorityLeaves, ...listLeaves, ...sectionLeaves].filter((l) =>
        `${l.group ?? ''} ${l.label}`.toLowerCase().includes(q),
      )
    : []
  const visibleCount = q ? results.length : mainItems.length
  const activeIndex = Math.min(active, Math.max(0, visibleCount - 1))

  const openSub = (id: SubId, focusInside: boolean) => {
    window.clearTimeout(subTimer.current)
    setSub(id)
    setSubActive(focusInside ? 0 : -1)
  }
  const closeSub = () => {
    window.clearTimeout(subTimer.current)
    setSub(null)
    setSubActive(-1)
  }

  // 項目に乗せたら少し待って中のメニューを開く・閉じる
  const hoverSub = (i: number, id: SubId) => {
    setActive(i)
    window.clearTimeout(subTimer.current)
    subTimer.current = window.setTimeout(() => openSub(id, false), SUB_OPEN_DELAY_MS)
  }
  const hoverLeaf = (i: number) => {
    setActive(i)
    window.clearTimeout(subTimer.current)
    subTimer.current = window.setTimeout(closeSub, SUB_OPEN_DELAY_MS)
  }
  const keepSub = () => window.clearTimeout(subTimer.current)

  // 押した所に出し、右・下にはみ出すなら内側へ寄せる（拡大アニメーション中でも本来の大きさで測る）
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    el.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - el.offsetWidth - EDGE))}px`
    const top = above ? y - el.offsetHeight - EDGE : y
    el.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - el.offsetHeight - EDGE))}px`
  }, [x, y, q, above])

  // 中のメニューは開いた項目の横に。右に入らなければ左に出す
  useLayoutEffect(() => {
    const el = subRef.current
    const menu = menuRef.current
    const item = sub ? menu?.querySelector(`[data-sub="${sub}"]`) : null
    if (!sub || !el || !menu || !item) return
    const m = menu.getBoundingClientRect()
    const r = item.getBoundingClientRect()
    const right = m.right - 4
    const left = right + el.offsetWidth + EDGE <= window.innerWidth ? right : m.left - el.offsetWidth + 4
    el.style.left = `${Math.max(EDGE, left)}px`
    el.style.top = `${Math.max(EDGE, Math.min(r.top - 5, window.innerHeight - el.offsetHeight - EDGE))}px`
  })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    const inSub = sub !== null && subActive >= 0
    const step = (n: number, len: number, cur: number) => (len === 0 ? 0 : (cur + n + len) % len)
    const current = q ? undefined : mainItems[activeIndex]
    let handled = true
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const n = e.key === 'ArrowDown' ? 1 : -1
      if (inSub) setSubActive((i) => step(n, subLeaves[sub].length, i))
      else {
        setActive(step(n, visibleCount, activeIndex))
        closeSub()
      }
    } else if (e.key === 'ArrowRight' && !inSub && current?.kind === 'sub') {
      openSub(current.id, true)
    } else if (e.key === 'ArrowLeft' && inSub) {
      closeSub()
    } else if (e.key === 'Enter') {
      if (inSub) subLeaves[sub][subActive]?.run()
      else if (q) results[activeIndex]?.run()
      else if (current?.kind === 'sub') openSub(current.id, true)
      else if (current?.kind === 'leaf') current.leaf.run()
    } else if (e.key === 'Escape') {
      if (query) setQuery('')
      else if (sub) closeSub()
      else onClose()
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        data-popover-keep
        className={`fixed z-[70] w-64 p-1 animate-pop-in ${POPOVER_PANEL}`}
        style={{ left: x, top: y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-100 px-2 pb-1.5 pt-1 dark:border-zinc-700">
          <SearchIcon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
          <input
            // タップの端末で開いたときはキーボードを出さない（検索は打ちたいときに欄を押す）
            autoFocus={!above}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              closeSub()
            }}
            onKeyDown={onKeyDown}
            placeholder={t('taskMenu.search')}
            aria-label={t('taskMenu.search')}
            className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
        </div>
        <MenuLabel>
          {taskIds.length > 1 ? t('taskMenu.count', { count: taskIds.length }) : (targets[0]?.title || t('taskMenu.one'))}
        </MenuLabel>
        {q ? (
          results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {results.map((leaf, i) => <LeafRow key={leaf.id} leaf={leaf} active={i === activeIndex} onHover={() => setActive(i)} withGroup />)}
            </div>
          ) : (
            <div className="px-2 py-2 text-sm text-zinc-400">{t('taskMenu.noResults')}</div>
          )
        ) : (
          mainItems.map((item, i) =>
            item.kind === 'sub' ? (
              <MenuItem
                key={item.id}
                data-sub={item.id}
                aria-haspopup="menu"
                aria-expanded={sub === item.id}
                icon={item.icon}
                active={i === activeIndex || sub === item.id}
                trailing={<ChevronRightIcon className="h-3.5 w-3.5 text-zinc-400" />}
                onMouseEnter={() => hoverSub(i, item.id)}
                onClick={() => openSub(item.id, false)}
              >
                {item.label}
              </MenuItem>
            ) : (
              <div key={item.leaf.id}>
                {item.leaf.id === 'complete' && <MenuDivider />}
                <LeafRow leaf={item.leaf} active={i === activeIndex} onHover={() => hoverLeaf(i)} />
              </div>
            ),
          )
        )}
      </div>
      {sub && !q && (
        <div
          ref={subRef}
          role="menu"
          data-popover-keep
          className={`fixed z-[71] p-1 ${sub === 'due' ? 'w-[272px]' : 'w-56'} ${POPOVER_PANEL}`}
          style={{ left: -9999, top: 0 }}
          onMouseEnter={keepSub}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className={sub === 'list' || sub === 'section' ? 'max-h-72 overflow-y-auto' : ''}>
            {subLeaves[sub].map((leaf, j) => <LeafRow key={leaf.id} leaf={leaf} active={j === subActive} onHover={() => setSubActive(j)} />)}
          </div>
          {sub === 'due' && (
            <div className="mt-1 border-t border-zinc-100 px-2 pt-2 dark:border-zinc-700">
              <DatePickerBody
                footer={false}
                value={sharedDue ?? null}
                onPick={(key) =>
                  run(() => bulk.setDue(taskIds, key, key ? format(fromDateKey(key), 'M/d', { locale: dateLocale }) : ''))
                }
              />
            </div>
          )}
        </div>
      )}
    </>,
    document.body,
  )
}
