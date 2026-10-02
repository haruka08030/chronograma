import { useMemo, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { useTaskStore, INBOX_LIST_ID, type SmartView } from '../store/taskStore'
import { CALENDAR_COLORS } from '../lib/googleColors'
import { LIST_PREFIX } from '../lib/listDnD'
import { SmartViewRow } from './SmartViewRow'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskList } from '../types/list'
import { CloseIcon, PencilIcon, PlusIcon } from './icons'
import { ICON_PATHS } from '../lib/iconPaths'
import { unplannedListIds } from '../lib/listKind'
import { colorLabelText, todoColorLabels } from '../lib/todoColorLabels'

const DUE_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'all', icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z' },
  { id: 'today', icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' },
  { id: 'upcoming', icon: ICON_PATHS.calendar },
  { id: 'overdue', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
]

const BIN_VIEWS: { id: SmartView; icon: string }[] = [
  { id: 'archived', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
  { id: 'deleted', icon: ICON_PATHS.trash },
]

function SortableListItem({ list, isSelected, onSelect, onStartEdit, onDelete, onColorPick }: {
  list: TaskList
  isSelected: boolean
  onSelect: () => void
  onStartEdit: () => void
  onDelete: () => void
  onColorPick: () => void
}) {
  const { t } = useTranslation()
  const isInbox = list.id === INBOX_LIST_ID
  const taskDragHoverListId = useTaskStore((s) => s.taskDragHoverListId)
  const sortableId = `${LIST_PREFIX}${list.id}`
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: sortableId, disabled: isInbox })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop::${list.id}` })
  const dropHighlight = isOver || taskDragHoverListId === list.id

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={(node) => { setSortableRef(node); setDropRef(node) }}
      style={style}
      className={`group flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg cursor-pointer transition-colors text-sm border-l-[3px] border-l-transparent
        ${dropHighlight
          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
          : isSelected
            ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
      onClick={onSelect}
      onDoubleClick={() => { if (!isInbox) onStartEdit() }}
    >
      <button
        type="button"
        disabled={isInbox}
        // 開いている色の一覧の「内側」扱い（押すと閉じて開き直さず、そのまま閉じる）
        data-popover-keep
        onClick={(e) => { e.stopPropagation(); onColorPick() }}
        className="h-5 w-5 min-h-[20px] min-w-[20px] shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10
          touch-manipulation disabled:cursor-default md:h-3 md:w-3 md:min-h-[12px] md:min-w-[12px]"
        style={{ backgroundColor: list.color }}
        aria-label={isInbox ? t('sidebar.inboxColorFixed') : t('sidebar.changeListColor')}
        tabIndex={-1}
      />

      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      {list.kind === 'someday' && (
        <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-label={t('listKind.someday')}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      )}
      {list.kind === 'checklist' && (
        <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-label={t('listKind.checklist')}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      )}

      {!isInbox ? (
        <>
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="touch-none shrink-0 cursor-grab rounded p-1.5 opacity-100 active:cursor-grabbing md:p-0.5 md:opacity-0 md:group-hover:opacity-100"
            tabIndex={-1}
            title={t('sidebar.reorderList')}
            aria-label={t('sidebar.reorderList')}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="h-4 w-4 text-zinc-400 md:h-3 md:w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <circle cx="7" cy="4" r="1.5" /><circle cx="13" cy="4" r="1.5" />
              <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
              <circle cx="7" cy="16" r="1.5" /><circle cx="13" cy="16" r="1.5" />
            </svg>
          </button>
          {/* スマホにはダブルクリックが無いので、名前の変更はこのボタンから */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartEdit() }}
            className="shrink-0 rounded p-1.5 touch-manipulation hover:bg-zinc-200 dark:hover:bg-zinc-700 md:hidden"
            aria-label={t('sidebar.renameList')}
          >
            <PencilIcon className="h-4 w-4 text-zinc-400" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="shrink-0 rounded p-1.5 opacity-100 touch-manipulation hover:bg-zinc-200 dark:hover:bg-zinc-700 md:p-0.5 md:opacity-0 md:group-hover:opacity-100"
            aria-label={t('sidebar.deleteList')}
          >
            <CloseIcon className="h-4 w-4 text-zinc-400 md:h-3.5 md:w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  )
}

function ColorPicker({ current, onChange, onClose }: { current: string; onChange: (c: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const selected = current.toUpperCase()
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ open: true, onClose, inside: [ref] })
  return (
    <div
      ref={ref}
      className={`absolute left-0 top-full z-[100] mt-1.5 w-max max-w-[calc(100vw-2rem)] p-2 ${POPOVER_PANEL}`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={t('sidebar.listColorDialog')}
    >
      {/* 記録のラベルと同じ Google カレンダーの 24 色 */}
      <div className="grid grid-cols-6 gap-1.5">
        {CALENDAR_COLORS.map(({ key, hex }) => (
          <button
            key={hex}
            type="button"
            onClick={() => { onChange(hex); onClose() }}
            title={t(`googleColors.${key}`)}
            aria-label={t(`googleColors.${key}`)}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110
              ${hex === selected ? 'ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-zinc-800' : 'ring-1 ring-black/10'}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * To‑Do のサブナビ本体（期限別ビュー / リスト / 色ラベル / アーカイブ・ゴミ箱）。
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
  const selectList = useTaskStore((s) => s.selectList)
  const selectView = useTaskStore((s) => s.selectView)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const addList = useTaskStore((s) => s.addList)
  const renameList = useTaskStore((s) => s.renameList)
  const updateListColor = useTaskStore((s) => s.updateListColor)
  const deleteList = useTaskStore((s) => s.deleteList)
  const tasks = useTaskStore((s) => s.tasks)
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const categoryColors = useTaskStore((s) => s.logCategoryColors)
  const filterColor = useTaskStore((s) => s.filterColor)
  const selectColor = useTaskStore((s) => s.selectColor)
  const colorLabels = useMemo(
    () => todoColorLabels(tasks, unplannedListIds(lists), presets, categoryColors),
    [tasks, lists, presets, categoryColors],
  )

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [colorPickId, setColorPickId] = useState<string | null>(null)

  const sorted = [...lists].sort((a, b) => a.order - b.order)
  const sortedIds = sorted.map((l) => `${LIST_PREFIX}${l.id}`)
  const sectionsByList = new Map<string, typeof sections>()
  for (const s of sections) {
    const arr = sectionsByList.get(s.listId)
    if (arr) arr.push(s)
    else sectionsByList.set(s.listId, [s])
  }
  for (const arr of sectionsByList.values()) arr.sort((a, b) => a.order - b.order)

  const handleNav = (cb: () => void) => {
    cb()
    onNavigate?.()
  }

  const submitNew = () => {
    const trimmed = newName.trim()
    if (trimmed) addList(trimmed)
    setNewName('')
    setAdding(false)
  }

  const submitRename = (id: string) => {
    const trimmed = editName.trim()
    if (trimmed) renameList(id, trimmed)
    setEditingId(null)
  }

  const selectListSection = (listId: string, sectionId: string) => {
    selectList(listId)
    // selectList が quickAddSectionId をクリアしたあとでセクションを指定
    setQuickAddSectionId(sectionId)
  }

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

      <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
        {sorted.map((list) => {
          const isSelected = selectedListId === list.id && selectedView === null
          const listSections = sectionsByList.get(list.id) ?? []

          if (editingId === list.id) {
            return (
              <input
                key={list.id}
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => submitRename(list.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitRename(list.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
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
                onStartEdit={() => { setEditingId(list.id); setEditName(list.name) }}
                onDelete={() => deleteList(list.id)}
                onColorPick={() => setColorPickId(colorPickId === list.id ? null : list.id)}
              />
              {listSections.map((sec) => {
                const secSelected =
                  isSelected && quickAddSectionId === sec.id
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleNav(() => selectListSection(list.id, sec.id))}
                    aria-current={secSelected ? 'page' : undefined}
                    className={`ml-5 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition-colors
                      ${secSelected
                        ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
                        : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{sec.name}</span>
                  </button>
                )
              })}
              {colorPickId === list.id && (
                <ColorPicker
                  current={list.color}
                  onChange={(c) => updateListColor(list.id, c)}
                  onClose={() => setColorPickId(null)}
                />
              )}
            </div>
          )
        })}
      </SortableContext>

      <div className="px-2 pb-2 pt-2">
        {adding ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitNew()
              if (e.key === 'Escape') { setNewName(''); setAdding(false) }
            }}
            placeholder={t('sidebar.listPlaceholder')}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 rounded-lg outline-none
                       ring-2 ring-accent-500/40 text-zinc-900 dark:text-zinc-100
                       placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
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

      {/* タスクに色（ラベル）を付けたときだけ出す。付け方は詳細の「ラベル」 */}
      {colorLabels.length > 0 && (
        <>
          <div className="mx-2 my-2 border-t border-zinc-200 dark:border-zinc-800" />
          <div className="px-3 pb-1 pt-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            {t('labels.title')}
          </div>
          {colorLabels.map((label) => {
            const isSelected = selectedView === 'all' && filterColor === label.hex
            const name = colorLabelText(label.hex, presets, categoryColors, t)
            return (
              <button
                key={label.hex}
                type="button"
                onClick={() => handleNav(() => selectColor(label.hex))}
                aria-current={isSelected ? 'page' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors
                  ${isSelected
                    ? 'bg-accent-50 font-medium text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: label.hex }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {label.count > 0 && (
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{label.count}</span>
                )}
              </button>
            )
          })}
        </>
      )}

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
    </>
  )
}

/** md 以上でサイドバーの右に常設する細い To‑Do パネル（To‑Do 系ビューのときだけ表示） */
export function TodoNavPanel() {
  const { t } = useTranslation()
  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/30
                      dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="px-4 pt-5 pb-3">
        <span className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {t('sidebar.todo')}
        </span>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <TodoNavContent />
      </nav>
    </aside>
  )
}
