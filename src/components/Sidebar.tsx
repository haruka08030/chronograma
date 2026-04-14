import { useState } from 'react'
import { useTaskStore, INBOX_LIST_ID, type SmartView } from '../store/taskStore'

const smartViews: { id: SmartView; label: string; icon: string }[] = [
  { id: 'all', label: 'すべて', icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z' },
  { id: 'today', label: '今日', icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z' },
  { id: 'upcoming', label: '近日中', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
  { id: 'calendar', label: '月カレンダー', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-3.75h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z' },
  { id: 'week-calendar', label: '週カレンダー', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
]

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const { lists, selectedListId, selectedView, selectList, selectView, addList, renameList, deleteList } = useTaskStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const sorted = [...lists].sort((a, b) => a.order - b.order)

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
        {sorted.map((list) => {
          const isSelected = selectedListId === list.id && selectedView === null
          const isInbox = list.id === INBOX_LIST_ID

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
            <div
              key={list.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm
                ${isSelected
                  ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
              onClick={() => handleNav(() => selectList(list.id))}
              onDoubleClick={() => {
                if (!isInbox) {
                  setEditingId(list.id)
                  setEditName(list.name)
                }
              }}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isInbox
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                }
              </svg>
              <span className="flex-1 truncate">{list.name}</span>
              {!isInbox && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteList(list.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  aria-label="リストを削除"
                >
                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
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

  // Mobile: overlay drawer; Desktop: always visible
  if (open !== undefined) {
    return (
      <>
        {/* Desktop */}
        <div className="hidden md:flex">{sidebarContent}</div>
        {/* Mobile overlay */}
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
