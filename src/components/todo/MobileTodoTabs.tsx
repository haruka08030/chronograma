import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore, type SmartView } from '../../store/taskStore'
import { displayListName } from '../../lib/displayListName'

const VIEWS: SmartView[] = ['all', 'today', 'upcoming', 'overdue']

/**
 * スマホの To-Do の上に常に出す、絞り込み・リストのタブ（Google Tasks のスマホアプリと同じ横スクロールのタブ）。
 * 左のパネルが無い幅でも、「その他」のドロワーを探さずに「買い物」などを開ける。md 以上は左のパネルがあるので出さない
 */
export function MobileTodoTabs() {
  const { t } = useTranslation()
  const lists = useTaskStore((s) => s.lists)
  const selectedView = useTaskStore((s) => s.selectedView)
  const selectedListId = useTaskStore((s) => s.selectedListId)
  const filterColor = useTaskStore((s) => s.filterColor)
  const selectView = useTaskStore((s) => s.selectView)
  const selectList = useTaskStore((s) => s.selectList)
  const selectedRef = useRef<HTMLButtonElement>(null)

  const tabs = [
    ...VIEWS.map((v) => ({
      key: `view-${v}`,
      label: t(`sidebar.views.${v}`),
      // 色ラベルは「すべて」を色で絞ったものなので、そのときはどのタブも選ばない
      selected: selectedView === v && !(v === 'all' && filterColor),
      select: () => selectView(v),
    })),
    ...[...lists]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        key: `list-${l.id}`,
        label: displayListName(l.id, l.name),
        selected: selectedView === null && selectedListId === l.id,
        select: () => selectList(l.id),
      })),
  ]
  const selectedKey = tabs.find((tab) => tab.selected)?.key

  // 選んでいるタブが画面の外にあれば、横に送って見せる（ほかの画面から戻ったときも）
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedKey])

  return (
    <nav
      aria-label={t('nav.todo')}
      className="flex-shrink-0 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none] md:hidden dark:border-zinc-800"
    >
      <div className="flex w-max px-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            ref={tab.selected ? selectedRef : undefined}
            type="button"
            aria-current={tab.selected ? 'page' : undefined}
            onClick={tab.select}
            className={`relative whitespace-nowrap px-3 py-2.5 text-sm touch-manipulation transition-colors ${
              tab.selected
                ? 'font-medium text-accent-600 dark:text-accent-400'
                : 'text-zinc-500 active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800'
            }`}
          >
            {tab.label}
            {tab.selected && (
              <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-accent-600 dark:bg-accent-400" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
