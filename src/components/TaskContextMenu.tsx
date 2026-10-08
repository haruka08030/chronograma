import { useTranslation } from 'react-i18next'
import { addDays, nextMonday } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { useShallow } from 'zustand/react/shallow'
import { IS_MAC, shortcutLabel } from '../lib/keyboard'
import { useBulkTaskActions } from '../hooks/useBulkTaskActions'
import { appToday } from '../lib/timeZone'
import { displayListName } from '../lib/displayListName'
import { PRIORITY_TEXT_CLASS } from '../lib/priorityColor'
import { isEventTask, isLogTask, type Priority } from '../types/task'
import { DatePickerBody } from './DatePickerBody'
import { ActionMenu, type ActionEntry, type ActionLeaf } from './ui/ActionMenu'
import {
  ArchiveIcon,
  ArrowRightIcon,
  CalendarArrowIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FlagIcon,
  OpenPanelIcon,
  PlayIcon,
  SectionIcon,
  TrashIcon,
} from './icons'
import { startTimerForTask } from '../lib/timerDrop'
import { openTaskMenu } from '../lib/overlays'
import { canPickTime, timeSlotDateKey } from '../lib/timeSlotTarget'
import { toDateKey } from '../lib/dateKey'
import { useScheduleWish } from '../hooks/useScheduleWish'
import { useDateFormat } from '../hooks/useDateFormat'
import { useScheduleEntry } from '../hooks/useScheduleEntry'
import { useTodayToggle } from '../hooks/useTodayToggle'
import { colorVars } from '../lib/logCategoryColors'
import { sourceLinkOf } from '../lib/sourceLink'
import { MemoPreview } from './ui/MemoPreview'
import { menuDateHint } from '../lib/menuDateHint'
import { categoryHex } from '../lib/logCategoryColors'
import { colorLabelText } from '../lib/todoColorLabels'
import { NEUTRAL_HEX } from '../lib/googleColors'
import { ColorDot } from './ui/FilterChips'
import { ColorPalette } from './labels/ColorPalette'
import { compareByOrder } from '../lib/orderCompare'

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
  quick = false,
}: {
  /** 指で行を押したときの短いシート（`openTaskMenu` の `quick`） */
  quick?: boolean
  x: number
  y: number
  /** true なら (x, y) の上に出す（スマホの「操作」ボタンから開くとき） */
  above?: boolean
  taskIds: string[]
  onClose: () => void
  /** 何か実行したあと（選択の解除など） */
  onDone?: () => void
  /** 詳細を開く */
  onOpenDetail: (taskId: string) => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const lists = useTaskStore((s) => s.lists)
  const sections = useTaskStore((s) => s.sections)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  const bulk = useBulkTaskActions()
  const scheduleWish = useScheduleWish()
  const uncheckTasks = useTaskStore((s) => s.uncheckTasks)

  const targets = useTaskStore(useShallow((s) => s.tasks.filter((x) => taskIds.includes(x.id))))
  /** 全部が同じ値ならその値（チェックを付ける） */
  const shared = <T,>(pick: (task: (typeof targets)[number]) => T): T | undefined => {
    const values = new Set(targets.map(pick))
    return values.size === 1 ? [...values][0] : undefined
  }
  const sharedDue = shared((x) => x.dueDate)
  const sharedPriority = shared((x) => x.priority)
  const sharedList = shared((x) => x.listId)
  const sharedSection = shared((x) => x.sectionId)
  const sharedColor = shared((x) => x.color?.toUpperCase() ?? null)
  // いつか・チェックリストのタスクには締切・優先度を出さない。いつかだけ・チェックリストだけなら専用の短いメニューにする
  const kindOf = (listId: string) => lists.find((l) => l.id === listId)?.kind ?? 'tasks'
  const plannable = targets.some((x) => kindOf(x.listId) === 'tasks')
  const allWishes = targets.length > 0 && targets.every((x) => kindOf(x.listId) === 'someday')
  const allChecklist = targets.length > 0 && targets.every((x) => kindOf(x.listId) === 'checklist')
  // 予定（完了の無いもの）だけなら、締切・優先度・完了は出さない
  const allEvents = targets.length > 0 && targets.every(isEventTask)
  const openWishes = targets.filter((x) => !x.completed).map((x) => x.id)
  const done = (fn: () => void) => () => {
    fn()
    onDone?.()
  }

  const today = appToday()
  const dayHint = (key: string) => df.shortDateWeekday(key)
  const dueLeaves: ActionLeaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ]
    // 日曜は「明日」と「来週」が同じ月曜になるので 1 つにする（予定日のメニューと同じ）
    .filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i)
    .map((o): ActionLeaf => ({
      id: `due-${o.key}`,
      label: o.label,
      hint: dayHint(o.key),
      checked: sharedDue === o.key,
      run: done(() => bulk.setDue(taskIds, o.key, o.label)),
    }))
    .concat(
      {
        id: 'due-none',
        label: t('dueDatePicker.clear'),
        checked: sharedDue === null,
        run: done(() => bulk.setDue(taskIds, null, '')),
      },
      // 日付と時刻を一度に選ぶ（メニューは選ぶと閉じるので、閉じたあとに開く）
      {
        id: 'due-datetime',
        label: t('taskMenu.dueDateTime'),
        run: () => queueMicrotask(() => openTaskMenu({ kind: 'dueDateTime', x, y, taskIds, onDone })),
      },
    )
  const scheduleLeaves: ActionLeaf[] = [
    { label: t('dueDatePicker.today'), key: toDateKey(today) },
    { label: t('dueDatePicker.tomorrow'), key: toDateKey(addDays(today, 1)) },
    { label: t('taskMenu.nextWeek'), key: toDateKey(nextMonday(today)) },
  ]
    // 締切と同じく、日曜に同じ月曜が 2 つ並ばないようにする
    .filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i)
    .map((o): ActionLeaf => ({
      id: `schedule-${o.key}`,
      label: o.label,
      hint: dayHint(o.key),
      run: done(() => scheduleWish(openWishes, o.key)),
    }))
  const priorityLeaves: ActionLeaf[] = PRIORITIES.map((p) => ({
    id: `priority-${p}`,
    label: t(`common.${p}`),
    icon: <FlagIcon className={`${ICON} ${PRIORITY_TEXT_CLASS[p]}`} />,
    checked: sharedPriority === p,
    run: done(() => bulk.setPriority(taskIds, p)),
  }))
  const listLeaves: ActionLeaf[] = [...lists].sort(compareByOrder).map((l) => ({
    id: `list-${l.id}`,
    label: displayListName(l.id, l.name),
    icon: <span className="gc-dot mx-[3px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={colorVars(l.color)} />,
    checked: sharedList === l.id,
    run: done(() => bulk.moveToList(taskIds, l.id)),
  }))
  // セクション: 全部が同じリストの親タスクで、そのリストにセクションがあるときだけ
  const sectionNone = t('taskDetail.sectionNone')
  const listSections =
    sharedList && targets.every((x) => !x.parentId) ? [...sections].filter((sec) => sec.listId === sharedList).sort(compareByOrder) : []
  const sectionLeaves: ActionLeaf[] =
    listSections.length === 0
      ? []
      : [
          {
            id: 'section-none',
            label: sectionNone,
            checked: sharedSection === null,
            run: done(() => bulk.moveToSection(taskIds, null, sectionNone)),
          },
          ...listSections.map((sec): ActionLeaf => ({
            id: `section-${sec.id}`,
            label: sec.name,
            checked: sharedSection === sec.id,
            run: done(() => bulk.moveToSection(taskIds, sec.id, sec.name)),
          })),
        ]

  // ラベル（色）: 名前を付けたラベル → 「ラベルなし」、下に 24 色（詳細の「色とラベル」と同じ色の一覧）。記録には出さない
  const labelNone = <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: NEUTRAL_HEX }} aria-hidden />
  const labelLeaves: ActionLeaf[] = [
    ...presets
      .map((name) => categoryHex(name, categoryColors))
      .filter((hex, i, arr) => arr.indexOf(hex) === i)
      .map((hex): ActionLeaf => ({
        id: `label-${hex}`,
        label: colorLabelText(hex, presets, categoryColors, t),
        icon: <ColorDot hex={hex} />,
        checked: sharedColor === hex,
        run: done(() => bulk.setLabel(taskIds, hex)),
      })),
    {
      id: 'label-none',
      label: t('labels.none'),
      icon: labelNone,
      checked: sharedColor === null,
      run: done(() => bulk.setLabel(taskIds, null)),
    },
  ]
  const labelEntry: ActionEntry[] = targets.some((x) => !isLogTask(x))
    ? [
        {
          kind: 'sub',
          id: 'label',
          label: t('taskMenu.label'),
          icon: sharedColor ? <ColorDot hex={sharedColor} /> : labelNone,
          // 今のラベル。選んだタスクで違えば出さない
          hint: sharedColor ? colorLabelText(sharedColor, presets, categoryColors, t) : undefined,
          leaves: labelLeaves,
          width: 'lg',
          extra: (close) => (
            <ColorPalette
              bare
              selectedHex={sharedColor ?? null}
              onChoose={(hex) => {
                done(() => bulk.setLabel(taskIds, hex))()
                close()
              }}
            />
          ),
        },
      ]
    : []

  const scheduleEntry = useScheduleEntry(taskIds, done, ICON)
  // いちばん使う日の付け替えは、サブメニューを開かずに先頭で押せるようにする（今日の行なら明日へ、それ以外は今日へ）
  const todayToggle = useTodayToggle()(targets.filter((x) => !x.completed).map((x) => x.id))
  const todayToggleEntry: ActionEntry[] = targets.some((x) => !x.completed)
    ? [
        {
          kind: 'leaf',
          id: 'today-toggle',
          label: todayToggle.label,
          icon: <CalendarArrowIcon className={ICON} />,
          keys: shortcutLabel(['Shift', 'T']),
          run: done(todayToggle.run),
        },
      ]
    : []
  // 予定日（いつやる）を先に、期限（締切）はその下。「明日やる」を期限で動かして締切を変えてしまわないように
  const plannedEntries: ActionEntry[] = [
    ...todayToggleEntry,
    scheduleEntry,
    {
      kind: 'sub',
      id: 'due',
      label: t('common.due'),
      icon: <CalendarIcon className={ICON} />,
      // 今の締切（時刻があれば時刻も）。選んだタスクで違えば出さない
      hint: menuDateHint(targets.map((x) => ({ date: x.dueDate, time: x.dueDate ? x.dueTime : null }))),
      leaves: dueLeaves,
      width: 'lg',
      extra: (close) => (
        <DatePickerBody
          footer={false}
          value={sharedDue ?? null}
          onPick={(key) => {
            done(() => bulk.setDue(taskIds, key, key ? df.shortDate(key) : ''))()
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
            done(() => scheduleWish(openWishes, key))()
            close()
          }}
        />
      ),
    },
  ]
  const deleteEntry: ActionEntry = {
    kind: 'leaf',
    id: 'delete',
    label: t('taskItem.deleteAria'),
    icon: <TrashIcon className={ICON} />,
    keys: IS_MAC ? '⌫' : 'Del',
    danger: true,
    run: done(() => bulk.remove(taskIds)),
  }
  // いつか: 予定する・かなえた・削除だけ（かなえたものは削除だけ）
  const somedayEntries: ActionEntry[] = [
    ...(openWishes.length > 0
      ? [
          ...wishEntries,
          {
            kind: 'leaf' as const,
            id: 'complete',
            label: t('someday.fulfill'),
            icon: <CheckIcon className={ICON} />,
            keys: shortcutLabel(['mod', '↵']),
            run: done(() => bulk.complete(openWishes)),
          },
        ]
      : []),
    { ...deleteEntry, divider: openWishes.length > 0 },
  ]
  // チェックリスト（買い物）: チェック（全部済みなら外す）・削除だけ
  const allChecked = targets.every((x) => x.completed)
  const checklistEntries: ActionEntry[] = [
    allChecked
      ? {
          kind: 'leaf',
          id: 'uncheck',
          label: t('checklist.uncheck'),
          icon: <CheckIcon className={ICON} />,
          run: done(() => uncheckTasks(taskIds)),
        }
      : {
          kind: 'leaf',
          id: 'complete',
          label: t('checklist.check'),
          icon: <CheckIcon className={ICON} />,
          keys: shortcutLabel(['mod', '↵']),
          run: done(() => bulk.complete(taskIds)),
        },
    { ...deleteEntry, divider: true },
  ]
  // 全部済みなら「未完了に戻す」（済んだものに「完了にする」を出しても何も起きない）
  const allDone = targets.length > 0 && targets.every((x) => x.completed)
  const completeEntry: ActionEntry = allDone
    ? {
        kind: 'leaf',
        id: 'uncomplete',
        label: t('taskList.markIncomplete'),
        icon: <CheckIcon className={ICON} />,
        run: done(() => bulk.uncomplete(taskIds)),
      }
    : {
        kind: 'leaf',
        id: 'complete',
        label: t('taskList.markComplete'),
        icon: <CheckIcon className={ICON} />,
        keys: shortcutLabel(['mod', '↵']),
        run: done(() => bulk.complete(taskIds)),
      }
  const entries: ActionEntry[] = allWishes
    ? somedayEntries
    : allChecklist
      ? checklistEntries
      : [
          ...(plannable ? (allEvents ? [...todayToggleEntry, scheduleEntry] : plannedEntries) : []),
          { kind: 'sub', id: 'list', label: t('taskMenu.moveTo'), icon: <ArrowRightIcon className={ICON} />, leaves: listLeaves },
          ...(sectionLeaves.length > 0
            ? [
                {
                  kind: 'sub' as const,
                  id: 'section',
                  label: t('taskMenu.moveToSection'),
                  icon: <SectionIcon className={ICON} />,
                  leaves: sectionLeaves,
                },
              ]
            : []),
          ...labelEntry,
          ...(allEvents ? [] : [{ ...completeEntry, divider: true }]),
          ...(taskIds.length === 1
            ? [
                {
                  kind: 'leaf' as const,
                  id: 'open',
                  label: t('taskMenu.open'),
                  icon: <OpenPanelIcon className={ICON} />,
                  keys: '↵',
                  run: done(() => onOpenDetail(taskIds[0])),
                },
              ]
            : []),
          {
            kind: 'leaf',
            id: 'archive',
            label: t('taskItem.archive'),
            icon: <ArchiveIcon className={ICON} />,
            run: done(() => bulk.archive(taskIds)),
          },
          deleteEntry,
        ]
  // 指で行を押したときの短いシート: よく使う操作（今日やる・明日へ / 記録開始 / 完了）、日付、詳細を開く。ほかは詳細から
  const openEntry: ActionEntry[] =
    taskIds.length === 1
      ? [
          {
            kind: 'leaf',
            id: 'open',
            divider: true,
            label: t('taskMenu.open'),
            icon: <OpenPanelIcon className={ICON} />,
            run: done(() => onOpenDetail(taskIds[0])),
          },
        ]
      : []
  const timerEntry: ActionEntry[] =
    taskIds.length === 1 && plannable && targets[0] && !targets[0].completed
      ? [
          {
            kind: 'leaf',
            id: 'timer',
            label: t('planner.startTimer'),
            icon: <PlayIcon className={ICON} />,
            run: done(() => startTimerForTask(taskIds[0])),
          },
        ]
      : []
  // 時間未定なら「時間を決める」（空き時間の候補）。メニューは選ぶと閉じるので、閉じたあとに開く
  const untimed = taskIds.length === 1 && targets[0] && canPickTime(targets[0], lists) ? targets[0] : null
  const setTimeEntry: ActionEntry[] = untimed
    ? [
        {
          kind: 'leaf',
          id: 'set-time',
          label: t('timeSlot.title'),
          icon: <ClockIcon className={ICON} />,
          run: done(() => {
            const dateKey = timeSlotDateKey(untimed)
            queueMicrotask(() => openTaskMenu({ kind: 'timeSlot', x, y, taskId: untimed.id, dateKey }))
          }),
        },
      ]
    : []
  const quickEntries: ActionEntry[] = allWishes
    ? [...somedayEntries.filter((e) => e.id !== 'delete'), ...openEntry]
    : allChecklist
      ? [...checklistEntries.filter((e) => e.id !== 'delete'), ...openEntry]
      : [
          ...setTimeEntry,
          ...todayToggleEntry,
          ...timerEntry,
          ...(allEvents ? [] : [{ ...completeEntry, keys: undefined } as ActionEntry]),
          ...(plannable
            ? plannedEntries
                .filter((e) => e.id === 'scheduled' || (e.id === 'due' && !allEvents))
                .map((e, i) => (i === 0 ? { ...e, divider: true } : e))
            : []),
          ...openEntry,
        ]

  // 指で行を押したときのシートには、メモがあれば題名の下に出す（リンクだけのメモは行の「開く」アイコンと同じなので出さない）
  const quickMemo = quick && targets.length === 1 && !sourceLinkOf(targets[0]!.description) ? targets[0]!.description : ''

  return (
    <ActionMenu
      x={x}
      y={y}
      above={above}
      header={taskIds.length > 1 ? t('taskMenu.count', { count: taskIds.length }) : targets[0]?.title || t('taskMenu.one')}
      note={
        quickMemo && (
          // 余白は外の箱に付ける（3 行で切る p に付けると、4 行目が余白の中に覗く）
          <div className="px-2 pb-1.5">
            <MemoPreview text={quickMemo} />
          </div>
        )
      }
      entries={quick ? quickEntries : entries}
      onClose={onClose}
      // いつか・チェックリスト・短いシートは項目が少ないので検索欄を出さない
      searchable={!quick && !allWishes && !allChecklist}
    />
  )
}
