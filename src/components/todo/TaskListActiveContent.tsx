import type { ReactNode, MouseEvent } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import type { SectionBlockRow } from '../../hooks/useTaskListRows'
import { SortableTaskItem } from '../SortableTaskItem'
import { SectionHeaderDnD } from '../SectionHeaderDnD'
import { SECTION_HEADING_TEXT } from '../ListSectionHeading'
import { TaskItem, type TaskItemSelection } from '../TaskItem'
import { DnDSubtreeRows, StaticSubtreeRows } from './subtaskRows'
import { SectionDropZone } from './sectionParts'

/**
 * To-Do 一覧の未完了のタスク。手動の並び順はドラッグで並べ替えられる行、それ以外は並べた順の行。
 * どちらもセクションの塊で分けるときは、セクションの見出しの下に出す
 */
export function TaskListActiveContent({
  canDrag,
  flatManualSortableIds,
  showSectionBlocks,
  sectionBlocks,
  active,
  selectedListId,
  taskDragging,
  previewParentId,
  pendingAutoEditTaskId,
  sectionTitle,
  sectionActions,
  sectionLabelFor,
  getDragGroupRootIds,
  makeRowClick,
  makeSelection,
  handleEnterCreateSibling,
  incompleteSubtasks,
  subtaskNestWithDrag,
  subtaskNestNoDrag,
}: {
  canDrag: boolean
  flatManualSortableIds: string[]
  showSectionBlocks: boolean
  sectionBlocks: SectionBlockRow[] | null
  active: Task[]
  selectedListId: string | null
  taskDragging: boolean
  previewParentId: string | null
  pendingAutoEditTaskId: string | null
  sectionTitle: (sectionId: string, title: string, canQuickTarget: boolean) => ReactNode
  sectionActions: (sectionId: string, title: string) => ReactNode
  sectionLabelFor: (task: { sectionId: string | null }) => string | null
  getDragGroupRootIds: (taskId: string) => string[]
  makeRowClick: (id: string) => (e: MouseEvent) => void
  makeSelection: (id: string) => TaskItemSelection
  handleEnterCreateSibling: (task: Task) => void
  incompleteSubtasks: (parentId: string) => Task[]
  subtaskNestWithDrag: string
  subtaskNestNoDrag: string
}) {
  const quickAddSectionId = useTaskStore((s) => s.quickAddSectionId)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  return canDrag ? (
    <SortableContext items={flatManualSortableIds} strategy={verticalListSortingStrategy}>
      {showSectionBlocks && sectionBlocks
        ? sectionBlocks.map((block) => {
            const sectionId = block.sectionId
            const blockKey = `${block.listId}::${sectionId ?? 'none'}::${block.headerKind}`
            const canQuickTarget = Boolean(selectedListId) && selectedListId === block.listId
            const isQuickTarget =
              canQuickTarget &&
              ((sectionId === null && quickAddSectionId === '') || (sectionId !== null && quickAddSectionId === sectionId))
            // セクションの外にタスクが無いときの「セクションなし」は、ドラッグ中（外へ戻す落とし先）だけ出す
            if (block.headerKind === 'section-none' && block.tasks.length === 0 && !taskDragging) return null
            return (
              <div key={blockKey} data-section-anchor={sectionId ?? undefined} className="relative scroll-mt-2 pt-3 first:pt-1">
                {block.listTitle ? (
                  <div className="px-3 pb-1 pt-1 text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
                    {block.listTitle}
                  </div>
                ) : null}
                {block.headerKind === 'section-named' && sectionId !== null ? (
                  <SectionHeaderDnD
                    listId={block.listId}
                    sectionId={sectionId}
                    isQuickTarget={isQuickTarget}
                    titleButton={sectionTitle(sectionId, block.title, canQuickTarget)}
                    actions={sectionActions(sectionId, block.title)}
                  />
                ) : (
                  <div
                    className={`relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 transition-colors bg-white dark:bg-zinc-900
                    ${isQuickTarget ? 'ring-1 ring-accent-400/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}
                    ${block.headerKind === 'list-only' ? 'text-zinc-700 dark:text-zinc-200' : ''}`}
                  >
                    <button
                      type="button"
                      className={`min-w-0 flex-1 text-left truncate ${
                        block.headerKind === 'list-only' ? 'text-xs font-semibold tracking-tight' : SECTION_HEADING_TEXT
                      }`}
                      onClick={() => {
                        if (canQuickTarget && block.headerKind === 'section-none') setQuickAddSectionId('')
                      }}
                    >
                      {block.title}
                    </button>
                  </div>
                )}
                {block.tasks.flatMap((t) => [
                  <SortableTaskItem
                    key={t.id}
                    task={t}
                    dragGroupRootIds={getDragGroupRootIds(t.id)}
                    onRowClick={makeRowClick(t.id)}
                    onEnterCreateSibling={handleEnterCreateSibling}
                    selection={makeSelection(t.id)}
                    autoEdit={pendingAutoEditTaskId === t.id}
                    showNestGuide={t.id === previewParentId}
                  />,
                  ...DnDSubtreeRows({
                    parentId: t.id,
                    depth: 0,
                    incompleteSubtasks,
                    makeRowClick,
                    makeSelection,
                    onEnterCreateSibling: handleEnterCreateSibling,
                    pendingAutoEditTaskId,
                    subtaskNestWithDrag,
                    nestPreviewParentId: previewParentId,
                  }),
                ])}
                {block.headerKind !== 'list-only' ? (
                  <SectionDropZone
                    listId={block.listId}
                    sectionId={block.sectionId}
                    empty={block.headerKind === 'section-none' && block.tasks.length === 0}
                  />
                ) : null}
              </div>
            )
          })
        : active.flatMap((t) => [
            <SortableTaskItem
              key={t.id}
              task={t}
              dragGroupRootIds={getDragGroupRootIds(t.id)}
              onRowClick={makeRowClick(t.id)}
              onEnterCreateSibling={handleEnterCreateSibling}
              selection={makeSelection(t.id)}
              autoEdit={pendingAutoEditTaskId === t.id}
              showNestGuide={t.id === previewParentId}
            />,
            ...DnDSubtreeRows({
              parentId: t.id,
              depth: 0,
              incompleteSubtasks,
              makeRowClick,
              makeSelection,
              onEnterCreateSibling: handleEnterCreateSibling,
              pendingAutoEditTaskId,
              subtaskNestWithDrag,
              nestPreviewParentId: previewParentId,
            }),
          ])}
    </SortableContext>
  ) : showSectionBlocks && sectionBlocks ? (
    // 並べ替え中もセクションはそのまま。並び順は各セクションの中だけに効かせ、名前の変更・削除もできる。
    // 空の「セクションなし」は手動のときのドロップ先なので、並べ替え中は出さない
    sectionBlocks
      .filter((block) => block.headerKind !== 'section-none' || block.tasks.length > 0)
      .map((block) => (
        <div
          key={`${block.listId}::${block.sectionId ?? 'none'}::${block.headerKind}`}
          data-section-anchor={block.sectionId ?? undefined}
          className="relative scroll-mt-2 pt-3 first:pt-1"
        >
          {block.listTitle ? (
            <div className="px-3 pb-1 pt-1 text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">{block.listTitle}</div>
          ) : null}
          {block.headerKind === 'section-named' && block.sectionId !== null ? (
            <div className="group relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <div className="min-w-0 flex-1">
                {sectionTitle(block.sectionId, block.title, Boolean(selectedListId) && selectedListId === block.listId)}
              </div>
              {sectionActions(block.sectionId, block.title)}
            </div>
          ) : (
            <button
              type="button"
              className={`relative z-10 w-full text-left px-3 py-1.5 mb-0.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                block.headerKind === 'list-only'
                  ? 'text-xs font-semibold tracking-tight text-zinc-700 dark:text-zinc-200'
                  : SECTION_HEADING_TEXT
              }`}
              onClick={() => {
                if (selectedListId === block.listId) {
                  setQuickAddSectionId(block.sectionId === null ? '' : block.sectionId)
                }
              }}
            >
              {block.title}
            </button>
          )}
          {block.tasks.map((t) => (
            <div key={t.id}>
              <TaskItem
                task={t}
                onRowClick={makeRowClick(t.id)}
                onEnterCreateSibling={handleEnterCreateSibling}
                selection={makeSelection(t.id)}
                autoEdit={pendingAutoEditTaskId === t.id}
                dragGroupIds={getDragGroupRootIds(t.id)}
              />
              {StaticSubtreeRows({
                parentId: t.id,
                depth: 0,
                incompleteSubtasks,
                makeRowClick,
                makeSelection,
                onEnterCreateSibling: handleEnterCreateSibling,
                pendingAutoEditTaskId,
                subtaskNestNoDrag,
              })}
            </div>
          ))}
        </div>
      ))
  ) : (
    active.map((t) => (
      <div key={t.id}>
        <TaskItem
          task={t}
          onRowClick={makeRowClick(t.id)}
          onEnterCreateSibling={handleEnterCreateSibling}
          selection={makeSelection(t.id)}
          autoEdit={pendingAutoEditTaskId === t.id}
          dragGroupIds={getDragGroupRootIds(t.id)}
          sectionLabel={sectionLabelFor(t)}
        />
        {StaticSubtreeRows({
          parentId: t.id,
          depth: 0,
          incompleteSubtasks,
          makeRowClick,
          makeSelection,
          onEnterCreateSibling: handleEnterCreateSibling,
          pendingAutoEditTaskId,
          subtaskNestNoDrag,
        })}
      </div>
    ))
  )
}
