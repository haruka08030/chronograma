import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useTextEntry } from '../hooks/useTextEntry'
import { PlusIcon } from './icons'

/**
 * いつか・チェックリストで、行の下に子を足す欄（「中国語」の下に「HSK 合格」、「カレー」の下に材料）。
 * Enter で足して欄は開いたまま（続けて書ける）。空で Enter・Esc・外したら閉じる（書きかけは足す）
 */
export function ChildAddInput({ parentId, onClose, className = '' }: { parentId: string; onClose: () => void; className?: string }) {
  const { t } = useTranslation()
  const addChild = useTaskStore((s) => s.addChildAtEnd)
  const [draft, setDraft] = useState('')
  const add = () => {
    const title = draft.trim()
    if (title) addChild(title, parentId)
    setDraft('')
    return title
  }
  const entry = useTextEntry({
    onSubmit: () => {
      if (!add()) onClose()
    },
    onCancel: onClose,
    // 書きかけで外しても捨てない（タスク詳細のサブタスクと同じ）
    onBlurSubmit: () => {
      add()
      onClose()
    },
  })
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <PlusIcon className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        {...entry}
        placeholder={t('nestedList.addChild')}
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
    </div>
  )
}

/** 行の右の「＋」（下に追加）。PC はホバーで出す。スマホは詳細カードから足す（行のアイコンを増やさない） */
export function AddChildButton({ title, onClick }: { title: string; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('nestedList.addChildTo', { title })}
      className="hidden shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-200 md:block md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100 dark:hover:bg-zinc-700"
    >
      <PlusIcon className="h-4 w-4" />
    </button>
  )
}
