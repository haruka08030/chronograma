import { useCallback, useMemo, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { useDragEdgeScroll } from '../hooks/useDragEdgeScroll'
import { POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../store/taskStore'
import { LABEL_DROP_PREFIX, LIST_PREFIX } from '../lib/listDnD'
import { TASK_PREFIX } from './SortableTaskItem'
import { SmartViewRow } from './SmartViewRow'
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskList } from '../types/list'
import { CartIcon, CloseIcon, EllipsisIcon, PencilIcon, PlusIcon, StarIcon } from './icons'
import { ICON_PATHS } from '../lib/iconPaths'
import { unplannedListIds } from '../lib/listKind'
import { colorLabelText, NO_LABEL, todoColorLabels, unlabeledTodoCount, type TodoColorLabel } from '../lib/todoColorLabels'
import { labelDroppedTasks, moveDroppedTasks } from '../lib/navDrop'
import { readDraggedTaskIds, useTaskNativeDragActive } from '../lib/useTimelineDrop'
import { groupsBySection, sortModeOf } from '../lib/todoSurfaceView'
import { ColorSwatches } from './ui/ColorSwatches'
import { useTextEntry } from '../hooks/useTextEntry'
import { tip } from '../lib/tooltip'
import { acceptTaskDrag, isTaskDrag } from '../lib/taskDrag'
import { ListContextMenu } from './ListContextMenu'
import { SectionLabel } from './ui/SectionLabel'
import { META_TEXT } from './ui/textClass'
import { ColorLabelCard } from './labels/ColorLabelCard'
import { rectOf, type AnchorRect } from './timeline/anchoredCard'
import { colorVars } from '../lib/logCategoryColors'
import { NAME_MAX_LENGTH } from '../lib/textLimits'
import { compareByOrder } from '../lib/orderCompare'

const DUE_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'all', icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z' },
  {
    id: 'today',
    icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  },
  { id: 'upcoming', icon: ICON_PATHS.calendar },
  {
    id: 'overdue',
    icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  },
]

const BIN_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'completed', icon: ICON_PATHS.checkCircle },
  {
    id: 'archived',
    icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
  },
  { id: 'deleted', icon: ICON_PATHS.trash },
]

function SortableListItem({
  list,
  isSelected,
  onSelect,
  onStartEdit,
  onDelete,
  onColorPick,
  onContextMenu,
}: {
  list: TaskList
  isSelected: boolean
  onSelect: () => void
  onStartEdit: () => void
  onDelete: () => void
  onColorPick: () => void
  /** 右クリックのメニュー。スマホは行の ≡ から開く */
  onContextMenu: (at: { clientX: number; clientY: number }) => void
}) {
  const { t } = useTranslation()
  const taskDragHoverListId = useTaskStore((s) => s.taskDragHoverListId)
  const sortableId = `${LIST_PREFIX}${list.id}`
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: sortableId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop::${list.id}` })
  // 並べ替え中の行はネイティブ D&D でつかむので、dnd-kit とは別に受ける
  const [isOverNative, setIsOverNative] = useState(false)
  const dropHighlight = isOver || isOverNative || taskDragHoverListId === list.id
  // ここに並ぶのはいつか・買い物のリストだけ。色の丸の代わりに ☆ / カート（リストの色）。押すと色を変える
  const kindIcon =
    list.kind === 'someday' ? (
      <StarIcon className="h-full w-full" strokeWidth={2} label={t('listKind.someday')} />
    ) : (
      <CartIcon className="h-full w-full" strokeWidth={2} label={t('listKind.checklist')} />
    )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 行全体を押せる範囲にするマウス・指の近道。キーでは中の名前のボタンで開く
    <div
      ref={(node) => {
        setSortableRef(node)
        setDropRef(node)
      }}
      style={style}
      className={`group flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg cursor-pointer transition-colors text-sm border-l-[3px] border-l-transparent
        ${
          dropHighlight
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
            : isSelected
              ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e)
      }}
      onDragOver={(e) => {
        if (acceptTaskDrag(e)) setIsOverNative(true)
      }}
      onDragLeave={() => setIsOverNative(false)}
      onDrop={(e) => {
        setIsOverNative(false)
        if (!isTaskDrag(e)) return
        e.preventDefault()
        moveDroppedTasks(readDraggedTaskIds(e.dataTransfer), list.id)
      }}
    >
      <button
        type="button"
        // 開いている色の一覧の「内側」扱い（押すと閉じて開き直さず、そのまま閉じる）
        data-popover-keep
        onClick={(e) => {
          e.stopPropagation()
          onColorPick()
        }}
        className="flex h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 items-center justify-center touch-manipulation md:-mx-px md:h-3.5 md:w-3.5 md:min-h-[14px] md:min-w-[14px]"
        style={{ color: list.color }}
        aria-label={t('sidebar.changeListColor')}
        tabIndex={-1}
      >
        {kindIcon}
      </button>

      {/* キーではこのボタンで開く（押すと行の onClick まで届く）。行全体はマウス・指で押しやすくするための広い範囲 */}
      <button
        type="button"
        aria-current={isSelected ? 'page' : undefined}
        className="min-w-0 flex-1 truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-400/50"
      >
        {list.name}
      </button>

      {/* PC: カーソルがあるとき（キーボードで中にいるとき）だけ出す。ふだんは場所を取らず、名前を詰めない。
          スマホはつまみと ≡（To-Do の行と同じメニュー）。✎・× を並べると、名前を押すつもりで消してしまう */}
      <div className="flex shrink-0 items-center md:hidden md:group-hover:flex md:group-focus-within:flex">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="touch-none shrink-0 cursor-grab rounded p-1.5 active:cursor-grabbing md:p-0.5"
          tabIndex={-1}
          {...tip(t('sidebar.reorderList'), { name: true })}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-4 w-4 text-zinc-400 md:h-3 md:w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <circle cx="7" cy="4" r="1.5" />
            <circle cx="13" cy="4" r="1.5" />
            <circle cx="7" cy="10" r="1.5" />
            <circle cx="13" cy="10" r="1.5" />
            <circle cx="7" cy="16" r="1.5" />
            <circle cx="13" cy="16" r="1.5" />
          </svg>
        </button>
        {/* スマホ: ≡ でメニュー（名前の変更もここから）。PC はダブルクリックか、ホバーで出る鉛筆で名前を変える */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            onContextMenu({ clientX: r.left, clientY: r.bottom + 4 })
          }}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 touch-manipulation hover:bg-zinc-200 md:hidden dark:hover:bg-zinc-700"
          aria-haspopup="menu"
          aria-label={t('sidebar.listMenuAria')}
        >
          <EllipsisIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStartEdit()
          }}
          className="hidden shrink-0 rounded p-0.5 hover:bg-zinc-200 md:block dark:hover:bg-zinc-700"
          aria-label={t('sidebar.renameList')}
        >
          <PencilIcon className="h-4 w-4 text-zinc-400" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="hidden shrink-0 rounded p-0.5 hover:bg-zinc-200 md:block dark:hover:bg-zinc-700"
          aria-label={t('sidebar.deleteList')}
        >
          <CloseIcon className="h-4 w-4 text-zinc-400 md:h-3.5 md:w-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * 色ラベルの行。押すとその色で絞り、タスクを落とすとその色を付ける。丸を押すと名前と色を変えるカード（`ColorLabelCard`）。
 * 手動並びは ⋮⋮（dnd-kit）、並べ替え中は行ごとのネイティブ D&D でつかむので、両方を受ける
 */
function ColorLabelRow({
  label,
  name,
  isSelected,
  isEditing,
  onSelect,
  onEdit,
}: {
  label: TodoColorLabel
  name: string
  isSelected: boolean
  /** この色のカードを開いている */
  isEditing: boolean
  onSelect: () => void
  /** 行の要素（カードの出る位置） */
  onEdit: (row: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, isOver: isOverDndKit } = useDroppable({ id: `${LABEL_DROP_PREFIX}${label.hex}` })
  const [isOverNative, setIsOverNative] = useState(false)
  const isOver = isOverDndKit || isOverNative
  return (
    <div
      ref={setNodeRef}
      onDragOver={(e) => {
        if (acceptTaskDrag(e)) setIsOverNative(true)
      }}
      onDragLeave={() => setIsOverNative(false)}
      onDrop={(e) => {
        setIsOverNative(false)
        if (!isTaskDrag(e)) return
        e.preventDefault()
        labelDroppedTasks(readDraggedTaskIds(e.dataTransfer), label.hex)
      }}
      className={`flex w-full items-center rounded-lg text-sm transition-colors
        ${
          isOver
            ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            : isSelected
              ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        }`}
    >
      <button
        type="button"
        // 開いているカードの丸は「内側」（押しても閉じて開き直さない）
        data-popover-keep={isEditing || undefined}
        // カードは行の横に出す（丸の横だと名前に重なる）
        onClick={(e) => onEdit(e.currentTarget.parentElement ?? e.currentTarget)}
        aria-expanded={isEditing}
        {...tip(t('labels.editOne'), { name: true })}
        className="gc-dot ml-3 h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded-full touch-manipulation
          md:h-3 md:w-3 md:min-h-[12px] md:min-w-[12px]"
        style={colorVars(label.hex)}
      />
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 pr-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {label.count > 0 && <span className={`shrink-0 tabular-nums ${META_TEXT}`}>{label.count}</span>}
      </button>
    </div>
  )
}

/** 「ラベルなし」の行。ラベルの行と同じ形で、丸は点線の空の丸（色が無い） */
function NoLabelRow({ count, isSelected, onSelect }: { count: number; isSelected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg py-2 pl-3 pr-3 text-left text-sm transition-colors
        ${
          isSelected
            ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        }`}
    >
      <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-dashed border-zinc-400 md:h-3 md:w-3 dark:border-zinc-500" />
      <span className="min-w-0 flex-1 truncate">{t('labels.none')}</span>
      <span className={`shrink-0 tabular-nums ${META_TEXT}`}>{count}</span>
    </button>
  )
}

/** リストの下に字下げして並べる行（セクション） */
function SubNavRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'page' : undefined}
      className={`ml-5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors
        ${
          selected
            ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
            : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function ColorPicker({ current, onChange, onClose }: { current: string; onChange: (c: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ open: true, onClose, inside: [ref] })
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない）
    <div
      ref={ref}
      className={`absolute left-0 top-full z-[100] mt-1.5 origin-top-left w-max max-w-[calc(100vw-2rem)] p-2 ${POPOVER_PANEL}`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={t('sidebar.listColorDialog')}
    >
      {/* 記録のラベルと同じ Google カレンダーの 24 色（色選びはどこでも同じ部品） */}
      <ColorSwatches
        ariaLabel={t('sidebar.listColorDialog')}
        columns={6}
        selectedHex={current}
        onChoose={(hex) => {
          onChange(hex)
          onClose()
        }}
      />
    </div>
  )
}

/**
 * To‑Do のサブナビ本体（期限別ビュー / 色ラベル / いつか・チェックリストのリスト / 完了済み・アーカイブ・ゴミ箱）。
 * md 以上は `TodoNavPanel` として独立パネルに、md 未満はサイドバードロワー内に描画する。
 * リスト行は DnD id を持つため、同時に二箇所へマウントしないこと。
 */
export function TodoNavContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const sections = useTaskStore((s) => s.sections)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const selectedView = useTaskStore((s) => s.selectedView)
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)
  const sortByKey = useTaskStore((s) => s.sortByKey)
  const sectionGrouping = useTaskStore((s) => s.sectionGrouping)
  const selectList = useTaskStore((s) => s.selectList)
  const selectView = useTaskStore((s) => s.selectView)
  const selectListSection = useTaskStore((s) => s.selectListSection)
  const addList = useTaskStore((s) => s.addList)
  const renameList = useTaskStore((s) => s.renameList)
  const updateListColor = useTaskStore((s) => s.updateListColor)
  const deleteList = useTaskStore((s) => s.deleteList)
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  const filterColor = useTaskStore((s) => s.filterColor)
  const selectColor = useTaskStore((s) => s.selectColor)
  // タスクをドラッグしている間は、まだ使っていないラベルもドロップ先として出す
  const { active } = useDndContext()
  const nativeDragActive = useTaskNativeDragActive()
  const draggingTask = (active != null && String(active.id).startsWith(TASK_PREFIX)) || nativeDragActive
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])
  const colorLabels = useMemo(
    () => todoColorLabels(tasks, excludedListIds, presets, categoryColors, draggingTask, filterColor),
    [tasks, excludedListIds, presets, categoryColors, draggingTask, filterColor],
  )
  const unlabeledCount = useMemo(() => unlabeledTodoCount(tasks, excludedListIds), [tasks, excludedListIds])

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'someday' | 'checklist'>('checklist')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [colorPickId, setColorPickId] = useState<string | null>(null)
  const [listMenu, setListMenu] = useState<{ x: number; y: number; listId: string } | null>(null)
  const [labelCard, setLabelCard] = useState<{ hex: string; anchor: AnchorRect } | null>(null)

  // To-Do はリストで分けない（ラベルで分ける）。リストはいつか・チェックリストだけ
  const sorted = lists.filter((l) => l.kind === 'someday' || l.kind === 'checklist').sort(compareByOrder)
  const sortedIds = sorted.map((l) => `${LIST_PREFIX}${l.id}`)
  const sectionsByList = new Map<string, typeof sections>()
  for (const s of sections) {
    const arr = sectionsByList.get(s.listId)
    if (arr) arr.push(s)
    else sectionsByList.set(s.listId, [s])
  }
  for (const arr of sectionsByList.values()) arr.sort(compareByOrder)

  const handleNav = (cb: () => void) => {
    cb()
    onNavigate?.()
  }

  const submitNew = () => {
    const trimmed = newName.trim()
    if (trimmed) addList(trimmed, newKind)
    setNewName('')
    setAdding(false)
  }

  const submitRename = (id: string) => {
    const trimmed = editName.trim()
    if (trimmed) renameList(id, trimmed)
    setEditingId(null)
  }
  const renameEntry = useTextEntry({ onSubmit: () => editingId && submitRename(editingId), onCancel: () => setEditingId(null) })
  const newListEntry = useTextEntry({
    onSubmit: submitNew,
    onCancel: () => {
      setNewName('')
      setAdding(false)
    },
  })

  return (
    <>
      {DUE_VIEWS.map((v) => (
        <SmartViewRow
          key={v.id}
          view={v.id}
          icon={v.icon}
          // 色ラベルを開いている間は「すべて」ではなくラベルの行を選択中にする
          isSelected={selectedView === v.id && !(v.id === 'all' && filterColor)}
          onSelect={() => handleNav(() => selectView(v.id))}
        />
      ))}

      <div className="mx-2 my-2 border-t border-zinc-200 dark:border-zinc-800" />

      {/* タスクに色（ラベル）を付けたときだけ出す。付け方は詳細の「ラベル」か、タスクをここへドラッグ */}
      {colorLabels.length > 0 && (
        <>
          <SectionLabel as="div" className="px-3 pb-1 pt-1">
            {t('labels.title')}
          </SectionLabel>
          {colorLabels.map((label) => (
            <ColorLabelRow
              key={label.hex}
              label={label}
              name={colorLabelText(label.hex, presets, categoryColors, t)}
              isSelected={selectedView === 'all' && filterColor === label.hex}
              isEditing={labelCard?.hex === label.hex}
              onSelect={() => handleNav(() => selectColor(label.hex))}
              onEdit={(row) => {
                const anchor = rectOf(row)
                if (anchor) setLabelCard({ hex: label.hex, anchor })
              }}
            />
          ))}
          {/* まだラベルを付けていない To-Do（振り分けの残り）。全部がラベルなしのうちは「すべて」と同じなので出さない */}
          {unlabeledCount > 0 && (
            <NoLabelRow
              count={unlabeledCount}
              isSelected={selectedView === 'all' && filterColor === NO_LABEL}
              onSelect={() => handleNav(() => selectColor(NO_LABEL))}
            />
          )}
          <div className="mx-2 my-2 border-t border-zinc-200 dark:border-zinc-800" />
        </>
      )}

      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        {sorted.map((list) => {
          const isSelected = selectedListId === list.id && selectedView === null
          // 「セクションで分ける」がオフのリストは一覧に見出しが無いので、下のセクション行も出さない
          const listSections = groupsBySection(sortModeOf(sortByKey, list.id), sectionGrouping, { listId: list.id })
            ? (sectionsByList.get(list.id) ?? [])
            : []

          if (editingId === list.id) {
            return (
              <input
                key={list.id}
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={NAME_MAX_LENGTH}
                {...renameEntry}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 rounded-lg outline-none
                           ring-2 ring-accent-500/40 text-zinc-900 dark:text-zinc-100"
              />
            )
          }

          return (
            <div key={list.id} className="relative">
              <SortableListItem
                list={list}
                isSelected={isSelected && !quickAddSectionId}
                onSelect={() => handleNav(() => selectList(list.id))}
                onStartEdit={() => {
                  setEditingId(list.id)
                  setEditName(list.name)
                }}
                onDelete={() => deleteList(list.id)}
                onColorPick={() => setColorPickId(colorPickId === list.id ? null : list.id)}
                onContextMenu={(e) => setListMenu({ x: e.clientX, y: e.clientY, listId: list.id })}
              />
              {listSections.map((sec) => (
                <SubNavRow
                  key={sec.id}
                  label={sec.name}
                  selected={isSelected && quickAddSectionId === sec.id}
                  onClick={() => handleNav(() => selectListSection(list.id, sec.id))}
                />
              ))}
              {colorPickId === list.id && (
                <ColorPicker current={list.color} onChange={(c) => updateListColor(list.id, c)} onClose={() => setColorPickId(null)} />
              )}
            </div>
          )
        })}
      </SortableContext>

      <div className="px-2 pb-2 pt-2">
        {adding ? (
          <div className="space-y-1.5">
            {/* 作れるのはいつか・チェックリストだけ（To-Do はラベルで分ける） */}
            <div role="radiogroup" aria-label={t('listKind.label')} className="flex gap-1">
              {(['checklist', 'someday'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={newKind === k}
                  // 押しても名前の欄から外れない（外れると追加をやめたことになる）
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setNewKind(k)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                    newKind === k
                      ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
                      : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  {k === 'someday' ? (
                    <StarIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <CartIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                  {t(`listKind.${k}`)}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              {...newListEntry}
              placeholder={t('sidebar.listPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 rounded-lg outline-none
                         ring-2 ring-accent-500/40 text-zinc-900 dark:text-zinc-100
                         placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500
                       hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80
                       rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t('sidebar.addList')}
          </button>
        )}
      </div>

      <div className="mx-2 my-2 border-t border-zinc-200 dark:border-zinc-800" />

      {BIN_VIEWS.map((v) => (
        <SmartViewRow
          key={v.id}
          view={v.id}
          icon={v.icon}
          isSelected={selectedView === v.id}
          onSelect={() => handleNav(() => selectView(v.id))}
        />
      ))}
      {labelCard && <ColorLabelCard key={labelCard.hex} {...labelCard} onClose={() => setLabelCard(null)} />}
      {listMenu && (
        <ListContextMenu
          {...listMenu}
          onClose={() => setListMenu(null)}
          onRename={() => {
            const l = sorted.find((x) => x.id === listMenu.listId)
            setEditingId(listMenu.listId)
            setEditName(l?.name ?? '')
          }}
        />
      )}
    </>
  )
}

/** md 以上でサイドバーの右に常設する細い To‑Do パネル（To‑Do 系ビューのときだけ表示） */
export function TodoNavPanel() {
  const { t } = useTranslation()
  // タスクをつかんでいる間、下のラベル・上のリストへ届くよう、端に寄せたらナビを送る
  const navRef = useRef<HTMLElement>(null)
  const { active, droppableContainers, measureDroppableContainers } = useDndContext()
  const nativeDragActive = useTaskNativeDragActive()
  const draggingTask = (active != null && String(active.id).startsWith(TASK_PREFIX)) || nativeDragActive
  const remeasure = useCallback(() => {
    // dnd-kit は落とし先の位置を覚えているので、ナビを送ったら測り直す
    const ids = [...droppableContainers.keys()].filter((id) => {
      const s = String(id)
      return s.startsWith('drop::') || s.startsWith(LIST_PREFIX) || s.startsWith(LABEL_DROP_PREFIX)
    })
    measureDroppableContainers(ids)
  }, [droppableContainers, measureDroppableContainers])
  useDragEdgeScroll(navRef, draggingTask, remeasure)
  return (
    <aside
      className="flex h-full w-52 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/30
                      dark:border-zinc-800 dark:bg-zinc-900/30"
    >
      <div className="px-4 pt-5 pb-3">
        <span className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{t('sidebar.todo')}</span>
      </div>
      <nav ref={navRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <TodoNavContent />
      </nav>
    </aside>
  )
}
