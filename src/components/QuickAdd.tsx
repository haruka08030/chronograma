import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { addTaskFromQuickText } from '../lib/quickAddTask'
import { PlusIcon } from './icons'
import { buttonClass } from './ui/buttonClass'
import { isSubmitEnter } from '../lib/keyboard'

export function QuickAdd() {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [active, setActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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
    if (!value.trim()) return
    const { selectedListId, selectedView, filterColor } = useTaskStore.getState()
    addTaskFromQuickText(value, {
      currentListId: selectedListId,
      color: selectedView === 'all' && filterColor ? filterColor : undefined,
    })
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
          <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <span className="text-sm">{t('quickAdd.trigger')}</span>
      </button>
    )
  }

  return (
    <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl ring-2 ring-accent-500/40 space-y-1.5">
      <div className="flex items-center gap-3">
      <span className="w-6 h-6 rounded-full border-2 border-accent-400 flex items-center justify-center text-accent-500 flex-shrink-0">
        <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (isSubmitEnter(e)) {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') {
            setValue('')
            setActive(false)
          }
        }}
        placeholder={t('quickAdd.placeholder')}
        className="flex-1 min-w-0 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
      />
      <button
        type="button"
        onClick={() => submit()}
        disabled={!value.trim()}
        className={buttonClass({ variant: 'primary', size: 'sm' }, 'shrink-0')}
      >
        {t('common.add')}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue('')
          setActive(false)
        }}
        className={buttonClass({ variant: 'ghost', size: 'sm' }, 'shrink-0')}
      >
        {t('common.cancel')}
      </button>
      </div>
    </div>
  )
}
