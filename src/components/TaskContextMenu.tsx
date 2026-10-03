import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, nextMonday } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { IS_MAC, shortcutLabel } from '../lib/keyboard'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { appToday } from '../lib/timeZone'
import { displayListName } from '../lib/displayListName'
import { PRIORITY_RING_CLASS } from '../lib/priorityColor'
import type { Priority } from '../types/task'
import { DatePickerBody } from './DatePickerBody'
import { ActionMenu, type ActionEntry, type ActionLeaf } from './ui/ActionMenu'
import { ArchiveIcon, ArrowRightIcon, CalendarIcon, CheckIcon, FlagIcon, OpenPanelIcon, SectionIcon, TrashIcon } from './icons'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { useScheduleWish } from '../hooks/useScheduleWish'

const PRIORITIES: Priority[] = ['high', 'medium', 'low', 'none']
const ICON = 'h-4 w-4 flex-shrink-0'

/**
 * タスク行の右クリックメニュー（To-Do 一覧・カレンダーの置き場・今日の計画・検索結果で共通。`ActionMenu` の上に作る）。
 * 選択中の行を右クリックしたときは選択中のタスクすべてに効く
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
  const scheduleWish = useScheduleWish()

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
  // いつか・チェックリストのタスクには締切・優先度を出さない。いつかだけなら代わりに「予定する」
  const kindOf = (listId: string) => lists.find((l) => l.id === listId)?.kind ?? 'tasks'
  const plannable = targets.some((x) => kindOf(x.listId) === 'tasks')
  const allWishes = targets.length > 0 && targets.every((x) => kindOf(x.listId) === 'someday')
  const done = (fn: () => void) => () => {
    fn()
    onDone?.()
  }

  const today = appToday()
  const dayHint = (key: string) => format(fromDateKey(key), 'M/d (EEE)', { locale: dateLocale })
  const dueLeaves: ActionLeaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ]
    .map((o): ActionLeaf => ({
      id: `due-${o.key}`,
      label: o.label,
      hint: dayHint(o.key),
      checked: sharedDue === o.key,
      run: done(() => bulk.setDue(taskIds, o.key, o.label)),
    }))
    .concat({ id: 'due-none', label: t('dueDatePicker.clear'), checked: sharedDue === null, run: done(() => bulk.setDue(taskIds, null, '')) })
  const scheduleLeaves: ActionLeaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ].map((o): ActionLeaf => ({
    id: `schedule-${o.key}`,
    label: o.label,
    hint: dayHint(o.key),
    run: done(() => scheduleWish(taskIds, o.key)),
  }))
  const priorityLeaves: ActionLeaf[] = PRIORITIES.map((p) => ({
    id: `priority-${p}`,
    label: t(`common.${p}`),
    icon: <FlagIcon className={`${ICON} ${p === 'none' ? 'text-zinc-400' : PRIORITY_RING_CLASS[p]}`} />,
    checked: sharedPriority === p,
    run: done(() => bulk.setPriority(taskIds, p)),
  }))
  const listLeaves: ActionLeaf[] = [...lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      id: `list-${l.id}`,
      label: displayListName(l.id, l.name),
      icon: <span className="mx-[3px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: l.color }} />,
      checked: sharedList === l.id,
      run: done(() => bulk.moveToList(taskIds, l.id)),
    }))
  // セクション: 全部が同じリストの親タスクで、そのリストにセクションがあるときだけ
  const sectionNone = t('taskDetail.sectionNone')
  const listSections =
    sharedList && targets.every((x) => !x.parentId)
      ? [...sections].filter((sec) => sec.listId === sharedList).sort((a, b) => a.order - b.order)
      : []
  const sectionLeaves: ActionLeaf[] =
    listSections.length === 0
      ? []
      : [
          { id: 'section-none', label: sectionNone, checked: sharedSection === null, run: done(() => bulk.moveToSection(taskIds, null, sectionNone)) },
          ...listSections.map((sec): ActionLeaf => ({
            id: `section-${sec.id}`,
            label: sec.name,
            checked: sharedSection === sec.id,
            run: done(() => bulk.moveToSection(taskIds, sec.id, sec.name)),
          })),
        ]

  const plannedEntries: ActionEntry[] = [
    {
      kind: 'sub',
      id: 'due',
      label: t('common.due'),
      icon: <CalendarIcon className={ICON} />,
      leaves: dueLeaves,
      width: 'lg',
      extra: (close) => (
        <DatePickerBody
          footer={false}
          value={sharedDue ?? null}
          onPick={(key) => {
            done(() => bulk.setDue(taskIds, key, key ? format(fromDateKey(key), 'M/d', { locale: dateLocale }) : ''))()
            close()
          }}
        />
      ),
    },
    { kind: 'sub', id: 'priority', label: t('common.priority'), icon: <FlagIcon className={ICON} />, leaves: priorityLeaves },
  ]
  const wishEntries: ActionEntry[] = [
    {
      kind: 'sub',
      id: 'schedule',
      label: t('someday.schedule'),
      icon: <CalendarIcon className={ICON} />,
      leaves: scheduleLeaves,
      width: 'lg',
      extra: (close) => (
        <DatePickerBody
          footer={false}
          kind="scheduled"
          value={null}
          onPick={(key) => {
            done(() => scheduleWish(taskIds, key))()
            close()
          }}
        />
      ),
    },
  ]
  const entries: ActionEntry[] = [
    ...(allWishes ? wishEntries : []),
    ...(plannable ? plannedEntries : []),
    { kind: 'sub', id: 'list', label: t('taskMenu.moveTo'), icon: <ArrowRightIcon className={ICON} />, leaves: listLeaves },
    ...(sectionLeaves.length > 0
      ? [{ kind: 'sub' as const, id: 'section', label: t('taskMenu.moveToSection'), icon: <SectionIcon className={ICON} />, leaves: sectionLeaves }]
      : []),
    {
      kind: 'leaf',
      id: 'complete',
      divider: true,
      label: allWishes ? t('someday.fulfill') : t('taskList.markComplete'),
      icon: <CheckIcon className={ICON} />,
      keys: shortcutLabel(['mod', '↵']),
      run: done(() => bulk.complete(taskIds)),
    },
    ...(taskIds.length === 1 && onOpenDetail
      ? [{ kind: 'leaf' as const, id: 'open', label: t('taskMenu.open'), icon: <OpenPanelIcon className={ICON} />, keys: '↵', run: done(() => onOpenDetail(taskIds[0])) }]
      : []),
    { kind: 'leaf', id: 'archive', label: t('taskItem.archive'), icon: <ArchiveIcon className={ICON} />, run: done(() => bulk.archive(taskIds)) },
    {
      kind: 'leaf',
      id: 'delete',
      label: t('taskItem.deleteAria'),
      icon: <TrashIcon className={ICON} />,
      keys: IS_MAC ? '⌫' : 'Del',
      danger: true,
      run: done(() => bulk.remove(taskIds)),
    },
  ]

  return (
    <ActionMenu
      x={x}
      y={y}
      above={above}
      header={taskIds.length > 1 ? t('taskMenu.count', { count: taskIds.length }) : targets[0]?.title || t('taskMenu.one')}
      entries={entries}
      onClose={onClose}
    />
  )
}
