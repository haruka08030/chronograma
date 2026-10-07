import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useIsLargeScreen } from '../hooks/useMediaQuery'
import { isImeKeyEvent, isSubmitEnter, shortcutLabel } from '../lib/keyboard'
import { requestListCursor } from '../lib/shortcuts'
import { searchTasks } from '../lib/searchTasks'
import { openTaskDetail } from '../lib/overlays'
import { CloseIcon } from './icons'

/** To-Do・検索の画面の上の検索欄。`inputRef` は / と ⌘K（`useGlobalShortcuts`）がフォーカスに使う */
export function SearchBox({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { t } = useTranslation()
  const searchQuery = useTaskStore((s) => s.searchQuery)
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery)
  const isLargeScreen = useIsLargeScreen()

  // Esc 1 回で文字を消し、2 回目で欄から出る。↓ で結果の一覧へ（最初の行に枠）、Enter で最初の結果を開く
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isImeKeyEvent(e.nativeEvent)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (searchQuery) setSearchQuery('')
      else e.currentTarget.blur()
    } else if (e.key === 'ArrowDown' && searchQuery.trim()) {
      e.preventDefault()
      e.currentTarget.blur()
      // 一覧のキー操作（useTaskListSelection）に ↓ と同じ動きを頼み、最初の行に枠を出す
      requestListCursor()
    } else if (isSubmitEnter(e) && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const first = searchTasks(useTaskStore.getState().tasks, searchQuery)[0]
      if (!first) return
      e.preventDefault()
      // 欄から出しておく（残すと、詳細を閉じる Esc が欄の「文字を消す」になる）
      e.currentTarget.blur()
      openTaskDetail(first.id)
    }
  }

  return (
    <header className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
      <div className="relative min-w-0 flex-1 max-w-2xl">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isLargeScreen ? t('app.searchPlaceholder', { key: shortcutLabel(['mod', 'K']) }) : t('app.searchPlaceholderTouch')}
          className={`w-full rounded-full border border-zinc-200/55 bg-zinc-50/60 py-2.5 pl-10 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none backdrop-blur-sm transition-[background-color,border-color,box-shadow,color] duration-200 placeholder:text-zinc-400 focus:border-zinc-300/70 focus:bg-white/85 focus:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus:ring-2 focus:ring-accent-500/30 dark:border-zinc-700/35 dark:bg-zinc-950/35 dark:text-zinc-100 dark:shadow-none dark:placeholder:text-zinc-500 dark:focus:border-zinc-600/50 dark:focus:bg-zinc-900/45 dark:focus:ring-white/[0.06] ${searchQuery ? 'pr-10' : 'pr-4'}`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label={t('app.clearSearch')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400/70 transition-colors hover:bg-zinc-200/50 hover:text-zinc-600 dark:text-zinc-500/60 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </header>
  )
}
