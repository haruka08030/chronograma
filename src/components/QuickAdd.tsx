import { useState, useRef, useEffect } from 'react'
import { useTaskStore } from '../store/taskStore'
import { isModKey } from '../lib/keyboard'

export function QuickAdd() {
  const [value, setValue] = useState('')
  const [active, setActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const addTask = useTaskStore((s) => s.addTask)
  const quickAddRequested = useTaskStore((s) => s.quickAddRequested)
  const clearQuickAddRequest = useTaskStore((s) => s.clearQuickAddRequest)

  useEffect(() => {
    if (!quickAddRequested) return
    clearQuickAddRequest()
    queueMicrotask(() => {
      if (active) {
        inputRef.current?.focus()
      } else {
        setActive(true)
      }
    })
  }, [quickAddRequested, active, clearQuickAddRequest])

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    addTask(trimmed)
    setValue('')
    queueMicrotask(() => inputRef.current?.focus())
  }

  if (!active) {
    return (
      <button
        data-quickadd
        onClick={() => setActive(true)}
        className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 dark:text-zinc-500
                   hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl transition-colors group"
      >
        <span className="w-6 h-6 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600
                         flex items-center justify-center group-hover:border-accent-500 group-hover:text-accent-500 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </span>
        <span className="text-sm">タスクを追加…</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl ring-2 ring-accent-500/40">
      <span className="w-6 h-6 rounded-full border-2 border-accent-400 flex items-center justify-center text-accent-500">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isModKey(e)) {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') { setValue(''); setActive(false) }
        }}
        placeholder="タスク名を入力"
        className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      />
      <button
        onClick={submit}
        disabled={!value.trim()}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-500 text-white
                   hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        追加
      </button>
      <button
        onClick={() => { setValue(''); setActive(false) }}
        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      >
        キャンセル
      </button>
    </div>
  )
}
