import { useState } from 'react'
import { useTaskStore, INBOX_LIST_ID, LIST_COLORS, type SmartView } from '../store/taskStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskList } from '../types/list'

const smartViews: { id: SmartView; label: string; icon: string }[] = [
  { id: 'all', label: 'すべて', icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z' },
  { id: 'today', label: '今日', icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' },
  { id: 'upcoming', label: '近日中', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  { id: 'calendar', label: '月カレンダー', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-3.75h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z' },
  { id: 'week-calendar', label: '週カレンダー', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  { id: 'stats', label: '統計', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
]

function SortableListItem({ list, isSelected, onSelect, onStartEdit, onDelete, onColorPick }: {
  list: TaskList
  isSelected: boolean
  onSelect: () => void
  onStartEdit: () => void
  onDelete: () => void
  onColorPick: () => void
}) {
  const isInbox = list.id === INBOX_LIST_ID
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id, disabled: isInbox })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
        ${isSelected
          ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
      onClick={onSelect}
      onDoubleClick={() => { if (!isInbox) onStartEdit() }}
    >
      {!isInbox && (
        <button
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 touch-none -ml-1"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3 h-3 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="7" cy="4" r="1.5" /><circle cx="13" cy="4" r="1.5" />
            <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
            <circle cx="7" cy="16" r="1.5" /><circle cx="13" cy="16" r="1.5" />
          </svg>
        </button>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); if (!isInbox) onColorPick() }}
        className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: list.color }}
        tabIndex={-1}
      />

      <span className="flex-1 truncate">{list.name}</span>

      {!isInbox && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        >
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function ColorPicker({ current, onChange, onClose }: { current: string; onChange: (c: string) => void; onClose: () => void }) {
  return (
    <div className="absolute left-full ml-2 top-0 z-50 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-2"
      onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-5 gap-1.5">
        {LIST_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose() }}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110
              ${c === current ? 'ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-zinc-800' : 'ring-1 ring-black/10'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  )
}

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const { lists, selectedListId, selectedView, selectList, selectView, addList, renameList, updateListColor, deleteList, reorderLists } = useTaskStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [colorPickId, setColorPickId] = useState<string | null>(null)

  const sorted = [...lists].sort((a, b) => a.order - b.order)
  const sortedIds = sorted.map((l) => l.id)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  const handleNav = (cb: () => void) => {
    cb()
    onClose?.()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = sortedIds.indexOf(active.id as string)
    const newIdx = sortedIds.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = [...sortedIds]
    reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, active.id as string)
    reorderLists(reordered)
  }

  const sidebarContent = (
    <aside className="w-60 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50
                       flex flex-col h-full">
      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent-500 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">TickDo</span>
      </div>

      <div className="px-2 pb-1 space-y-0.5">
        {smartViews.map((v) => {
          const isSelected = selectedView === v.id
          return (
            <div
              key={v.id}
              onClick={() => handleNav(() => selectView(v.id))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
                ${isSelected
                  ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={v.icon} />
              </svg>
              <span className="flex-1">{v.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mx-4 my-2 border-t border-zinc-200 dark:border-zinc-800" />

      <div className="px-4 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          リスト
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
            {sorted.map((list) => {
              const isSelected = selectedListId === list.id && selectedView === null

              if (editingId === list.id) {
                return (
                  <input
                    key={list.id}
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => submitRename(list.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(list.id)
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
                    isSelected={isSelected}
                    onSelect={() => handleNav(() => selectList(list.id))}
                    onStartEdit={() => { setEditingId(list.id); setEditName(list.name) }}
                    onDelete={() => deleteList(list.id)}
                    onColorPick={() => setColorPickId(colorPickId === list.id ? null : list.id)}
                  />
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
        </DndContext>
      </nav>

      <div className="px-2 pb-4 pt-2">
        {adding ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') { setNewName(''); setAdding(false) }
            }}
            placeholder="リスト名"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800 rounded-lg outline-none
                       ring-2 ring-accent-500/40 text-zinc-900 dark:text-zinc-100
                       placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500
                       hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800
                       rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            リストを追加
          </button>
        )}
      </div>
    </aside>
  )

  if (open !== undefined) {
    return (
      <>
        <div className="hidden md:flex">{sidebarContent}</div>
        {open && (
          <div className="fixed inset-0 z-40 flex md:hidden" onClick={onClose}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative animate-slide-in-left" onClick={(e) => e.stopPropagation()}>
              {sidebarContent}
            </div>
          </div>
        )}
      </>
    )
  }

  return sidebarContent
}
