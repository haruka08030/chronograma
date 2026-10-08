import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { isArchivedTask, isDeletedTask } from '../lib/taskLifecycle'
import { displayListName } from '../lib/displayListName'
import { isLogTask, type Task } from '../types/task'
import { ICON_PATHS } from '../lib/iconPaths'
import { buttonClass } from './ui/buttonClass'
import { iconButtonClass } from './ui/iconButtonClass'
import { PathIcon } from './PathIcon'
import { askConfirm } from '../lib/confirmDialog'
import { tip } from '../lib/tooltip'
import { EmptyState } from './ui/EmptyState'
import { useDateFormat } from '../hooks/useDateFormat'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'
import { ActionMenu, type ActionEntry } from './ui/ActionMenu'
import { colorVars } from '../lib/logCategoryColors'
import { useTaskListSelection } from '../hooks/useTaskListSelection'
import { useShowMore } from '../hooks/useShowMore'
import { ShowMoreButton } from './ui/ShowMoreButton'
import { RowSelectCheckbox } from './ui/RowSelectCheckbox'
import { SelectionBar } from './ui/SelectionBar'
import { ROW_CURSOR_CLASS, ROW_SELECTED_CLASS } from './ui/rowStateClass'

type BinMode = 'archived' | 'deleted'

const RESTORE_ICON = ICON_PATHS.restore
const DELETE_ICON = ICON_PATHS.trash
const ARCHIVE_BOX_ICON =
  'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
const TRASH_BOX_ICON = ICON_PATHS.trash

export function TaskBinView({ mode }: { mode: BinMode }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const restoreDeletedTasks = useTaskStore((s) => s.restoreDeletedTasks)
  const permanentlyDeleteTasks = useTaskStore((s) => s.permanentlyDeleteTasks)
  const emptyDeleted = useTaskStore((s) => s.emptyDeleted)
  const unarchiveTasks = useTaskStore((s) => s.unarchiveTasks)
  const deleteTasks = useTaskStore((s) => s.deleteTasks)

  const [menu, setMenu] = useState<{ x: number; y: number; taskIds: string[]; above?: boolean } | null>(null)

  // 行のボタン・右クリックのメニュー・選択中のバーで同じ動きにする（選んだ行はまとめて。元に戻すは 1 回で戻る）。
  // 完全に削除は戻せないので件数を出して確認する（アーカイブの削除はゴミ箱へ・元に戻せる）
  const restoreLabel = mode === 'deleted' ? t('taskBin.restore') : t('taskBin.unarchive')
  const deleteLabel = mode === 'deleted' ? t('taskBin.deleteForever') : t('common.delete')
  const restore = useCallback(
    (ids: string[]) => (mode === 'deleted' ? restoreDeletedTasks(ids) : unarchiveTasks(ids)),
    [mode, restoreDeletedTasks, unarchiveTasks],
  )
  const remove = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      if (mode !== 'deleted') {
        deleteTasks(ids)
        return
      }
      const { tasks: all } = useTaskStore.getState()
      const subCount = all.filter((x) => x.parentId && ids.includes(x.parentId)).length
      const message =
        ids.length === 1
          ? t('taskBin.permanentConfirm')
          : subCount > 0
            ? t('taskBin.permanentConfirmManyWithSub', { count: ids.length, sub: subCount })
            : t('taskBin.permanentConfirmMany', { count: ids.length })
      const confirmLabel = ids.length === 1 ? t('taskBin.deleteForever') : t('taskBin.deleteForeverCount', { count: ids.length })
      if (await askConfirm({ message, confirmLabel, danger: true })) permanentlyDeleteTasks(ids)
    },
    [mode, deleteTasks, permanentlyDeleteTasks, t],
  )
  const menuEntries = (ids: string[]): ActionEntry[] => [
    {
      kind: 'leaf',
      id: 'restore',
      label: restoreLabel,
      icon: <PathIcon d={RESTORE_ICON} className="h-4 w-4 flex-shrink-0" />,
      run: () => {
        restore(ids)
        clearSelection()
      },
    },
    {
      kind: 'leaf',
      id: 'delete',
      divider: true,
      danger: true,
      label: deleteLabel,
      icon: <PathIcon d={DELETE_ICON} className="h-4 w-4 flex-shrink-0" />,
      run: () => {
        void remove(ids)
        clearSelection()
      },
    },
  ]

  const df = useDateFormat()
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])
  const flagged = mode === 'deleted' ? isDeletedTask : isArchivedTask

  const rows = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const isRootOfBin = (t: Task): boolean => {
      if (!flagged(t)) return false
      if (!t.parentId) return true
      const parent = byId.get(t.parentId)
      // 親も同じ箱にあるなら、その親を代表として表示（子は隠す）
      return !(parent && flagged(parent))
    }
    const stamp = (t: Task): string => (mode === 'deleted' ? t.deletedAt : t.archivedAt) ?? t.updatedAt
    // サブタスクの数は 1 回の走査で数える（行ごとに全件を見ると、数千行で行数 × 全件になる）
    const childCount = new Map<string, number>()
    for (const t of tasks) if (t.parentId) childCount.set(t.parentId, (childCount.get(t.parentId) ?? 0) + 1)
    return tasks
      .filter(isRootOfBin)
      .map((t) => ({
        task: t,
        stamp: stamp(t),
        childCount: childCount.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.stamp.localeCompare(a.stamp))
  }, [tasks, flagged, mode])

  // 数千行になりうるので新しい順に 100 件だけ描き、「さらに表示」・最後の行で ↓ で足す（#288）。⌘A・選択も描いている行だけ
  const { limit, remaining, showMore } = useShowMore(rows.length, mode)
  const shownRows = useMemo(() => rows.slice(0, limit), [rows, limit])
  const rowIds = useMemo(() => shownRows.map((r) => r.task.id), [shownRows])
  // 完了済みと同じ選択（クリック・Shift・⌘A・↑↓）。開く詳細は無いので、行を押すと選ぶ
  const openMenu = useCallback((m: { x: number; y: number; taskIds: string[]; above?: boolean }) => setMenu(m), [])
  const removeRows = useCallback((ids: string[]) => void remove(ids), [remove])
  const noop = useCallback(() => {}, [])
  const toggleRef = useRef<(id: string) => void>(() => {})
  const toggleRow = useCallback((id: string) => toggleRef.current(id), [])
  const { selected, clearSelection, toggleInSelection, makeRowClick, makeSelection, listboxProps } = useTaskListSelection({
    rowIds,
    openDetail: toggleRow,
    toggleRow,
    removeRows,
    completeRows: noop,
    openMenu,
    onShowMore: showMore,
    resetOn: [mode],
  })
  useEffect(() => {
    toggleRef.current = toggleInSelection
  }, [toggleInSelection])

  const title = mode === 'deleted' ? t('sidebar.views.deleted') : t('sidebar.views.archived')
  const boxIcon = mode === 'deleted' ? TRASH_BOX_ICON : ARCHIVE_BOX_ICON

  return (
    <div className={`flex flex-col ${PAGE_SCROLL_CLASS}`}>
      <div className="flex items-end justify-between px-6 pt-8 pb-2">
        <div>
          <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
          {/* 空なら下の「ありません」で分かるので件数は出さない */}
          {rows.length > 0 && <p className={`mt-1 ${META_TEXT}`}>{t('taskBin.count', { count: rows.length })}</p>}
        </div>
        {mode === 'deleted' && rows.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              if (await askConfirm({ message: t('taskBin.emptyConfirm'), confirmLabel: t('taskBin.emptyTrash'), danger: true }))
                emptyDeleted()
            }}
            className={buttonClass({ variant: 'danger', size: 'sm' })}
          >
            {t('taskBin.emptyTrash')}
          </button>
        )}
      </div>

      <div
        {...(rows.length > 0 ? listboxProps : {})}
        aria-label={rows.length > 0 ? title : undefined}
        className="flex-1 space-y-1 px-4 pb-6 outline-none"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<PathIcon d={boxIcon} strokeWidth={1} />}
            title={mode === 'deleted' ? t('taskBin.emptyDeleted') : t('taskBin.emptyArchived')}
          />
        ) : (
          shownRows.map(({ task, stamp, childCount }) => {
            const list = listById.get(task.listId)
            const notePreview =
              task.description
                .split('\n')
                .find((line) => line.trim())
                ?.trim() ?? ''
            const timeLog = isLogTask(task)
            let stampLabel = ''
            try {
              stampLabel = df.monthDayTime(parseISO(stamp))
            } catch {
              stampLabel = ''
            }
            const selection = makeSelection(task.id)
            return (
              // 行のクリックはマウスの近道。キーでは一覧（listbox）の ↑↓・Space・Enter で選べる
              // 行は listbox の option（フォーカスは箱に置き、aria-activedescendant で今の行を伝える）
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
              <div
                key={task.id}
                id={selection.optionId}
                role="option"
                aria-selected={selection.selected}
                aria-labelledby={`${selection.optionId}-title`}
                data-task-row={task.id}
                onClick={makeRowClick(task.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  selection.onContextMenu?.(e)
                }}
                className={`group flex cursor-pointer select-none items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40
                  ${selection.selected ? ROW_SELECTED_CLASS : ''} ${selection.cursor ? ROW_CURSOR_CLASS : ''}`}
              >
                <RowSelectCheckbox selected={selection.selected} reveal={selection.reveal} onToggle={selection.onToggle} />
                <div className="min-w-0 flex-1">
                  <p
                    id={`${selection.optionId}-title`}
                    className={`truncate text-sm ${task.completed && !timeLog ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}
                  >
                    {task.title || '\u00A0'}
                  </p>
                  {notePreview && <p className={`mt-0.5 truncate ${META_TEXT}`}>{notePreview}</p>}
                  <div className={`mt-1 flex flex-wrap items-center gap-2 ${META_TEXT}`}>
                    {list && (
                      <span className="inline-flex items-center gap-1">
                        <span className="gc-dot h-2 w-2 rounded-full" style={colorVars(list.color)} />
                        {displayListName(list.id, list.name)}
                      </span>
                    )}
                    {childCount > 0 && <span>{t('taskBin.subtaskCount', { count: childCount })}</span>}
                    {stampLabel && <span>{stampLabel}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      restore([task.id])
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    {...tip(restoreLabel, { name: true })}
                  >
                    <PathIcon d={RESTORE_ICON} className="h-4 w-4" />
                    <span className="hidden sm:inline">{restoreLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove([task.id])
                    }}
                    className={iconButtonClass('p-1.5!')}
                    {...tip(deleteLabel, { name: true })}
                  >
                    <PathIcon d={DELETE_ICON} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      {showMore && (
        <div className="px-4 pb-6">
          <ShowMoreButton onClick={showMore} remaining={remaining} />
        </div>
      )}
      {/* 選んでいる間: 件数・戻す・削除（To-Do 一覧と同じバー）。「操作」はこの画面のメニュー */}
      <SelectionBar
        selectedIds={selected}
        actions={[
          { label: restoreLabel, icon: <PathIcon d={RESTORE_ICON} className="h-4 w-4" />, onClick: () => restore([...selected]) },
          { label: deleteLabel, icon: <PathIcon d={DELETE_ICON} className="h-4 w-4" />, onClick: () => void remove([...selected]) },
        ]}
        onClear={clearSelection}
        onOpenMenu={(x, y) => setMenu({ x, y, taskIds: [...selected], above: true })}
      />
      {menu && (
        <ActionMenu
          x={menu.x}
          y={menu.y}
          above={menu.above}
          header={
            menu.taskIds.length > 1
              ? t('taskMenu.count', { count: menu.taskIds.length })
              : tasks.find((x) => x.id === menu.taskIds[0])?.title || t('taskMenu.one')
          }
          entries={menuEntries(menu.taskIds)}
          onClose={() => setMenu(null)}
          searchable={false}
        />
      )}
    </div>
  )
}
