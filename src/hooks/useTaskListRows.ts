import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SortMode } from '../store/taskStore'
import type { SectionGrouping, SectionGroupingScope, SmartView } from '../store/storeTypes'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { unplannedListIds } from '../lib/listKind'
import { getFilteredRootTasks, getOrderedActiveRootTasksForDnD } from '../lib/mainListTasks'
import { isListedTimeLog } from '../lib/timeLogTask'
import { groupsBySection, isTodoSurfaceView } from '../lib/todoSurfaceView'
import { displayListName } from '../lib/displayListName'

export type SectionBlockRow = {
  listId: string
  sectionId: string | null
  title: string
  /** マルチリスト時、このブロックの直前に出すリスト名 */
  listTitle: string | null
  tasks: Task[]
  headerKind: 'section-none' | 'section-named' | 'list-only'
}

/** To-Do 一覧に出すルートのタスクと、セクションの塊（分けないときは null） */
export function useTaskListRows({
  tasks,
  lists,
  sections,
  selectedListId,
  selectedView,
  sortMode,
  sectionGrouping,
  filterTag,
  filterColor,
}: {
  tasks: Task[]
  lists: TaskList[]
  sections: ListSection[]
  selectedListId: string | null
  selectedView: SmartView | null
  sortMode: SortMode
  sectionGrouping: SectionGrouping
  filterTag: string | null
  filterColor: string | null
}) {
  const { t } = useTranslation()
  const listOrderById = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lists) m.set(l.id, l.order)
    return m
  }, [lists])
  const excludedListIds = useMemo(() => unplannedListIds(lists), [lists])


  const filtered = useMemo(
    () =>
      getFilteredRootTasks({
        tasks,
        selectedView,
        selectedListId,
        sortMode,
        filterTag,
        filterColor,
        sections,
        excludedListIds,
      }),
    [tasks, selectedView, selectedListId, sortMode, filterTag, filterColor, sections, excludedListIds],
  )

  const listSectionsOrdered = useMemo(() => {
    if (!selectedListId) return []
    return sections.filter((s) => s.listId === selectedListId).sort((a, b) => a.order - b.order)
  }, [sections, selectedListId])

  // リスト選択時はそのリストのセクション。スマートビューでは、表示対象タスクが属する
  // リストにセクションがあるとき、リスト横断でセクションブロックを出す。
  const multiListSectionMode = !selectedListId && isTodoSurfaceView(selectedView)
  /** 手動以外の並び順でセクションの塊を出すか。リストはリストごと、「すべて」は lists、今日・近日中・期限切れは dueViews */
  const groupingScope: SectionGroupingScope = selectedListId
    ? { listId: selectedListId }
    : selectedView === 'all' || selectedView === null ? 'lists' : 'dueViews'
  const groupBySection = groupsBySection(sortMode, sectionGrouping, groupingScope)
  const showSectionBlocks = useMemo(() => {
    if (!groupBySection) return false
    if (selectedListId) return listSectionsOrdered.length > 0
    if (!multiListSectionMode || sections.length === 0) return false
    const listIds = new Set(
      filtered.filter((t) => !t.completed && !isListedTimeLog(t)).map((t) => t.listId),
    )
    return sections.some((s) => listIds.has(s.listId))
  }, [groupBySection, selectedListId, listSectionsOrdered.length, multiListSectionMode, sections, filtered])

  const active = useMemo(() => {
    const incomplete = filtered.filter((t) => !t.completed && !isListedTimeLog(t))
    // 手動以外は filtered が既にソート済みなので、その順序を維持したまま
    // セクションごとにバケット分けする（下の sectionBlocks で分割）。
    if (!showSectionBlocks || sortMode !== 'manual') return incomplete
    return getOrderedActiveRootTasksForDnD({
      tasks,
      selectedView,
      selectedListId,
      sortMode,
      filterTag,
      filterColor,
      sections,
      listOrderById,
      excludedListIds,
    })
  }, [filtered, showSectionBlocks, tasks, selectedView, selectedListId, sortMode, filterTag, filterColor, sections, listOrderById, excludedListIds])

  const sectionBlocks = useMemo((): SectionBlockRow[] | null => {
    if (!showSectionBlocks) return null

    if (selectedListId) {
      const map = new Map<string | null, typeof active>()
      map.set(null, [])
      for (const s of listSectionsOrdered) map.set(s.id, [])
      for (const t of active) {
        const sid = t.sectionId ?? null
        const bucket = map.get(sid)
        if (bucket) bucket.push(t)
        else map.get(null)!.push(t)
      }
      const rows: SectionBlockRow[] = [
        {
          listId: selectedListId,
          sectionId: null,
          title: t('sections.noneTitle'),
          listTitle: null,
          tasks: map.get(null) ?? [],
          headerKind: 'section-none',
        },
      ]
      for (const s of listSectionsOrdered) {
        rows.push({
          listId: selectedListId,
          sectionId: s.id,
          title: s.name,
          listTitle: null,
          tasks: map.get(s.id) ?? [],
          headerKind: 'section-named',
        })
      }
      return rows
    }

    // スマートビュー: リスト order 順に、セクションがあるリストはセクション分割、無いリストはフラット
    const sortedLists = [...lists].sort((a, b) => a.order - b.order)
    const activeByList = new Map<string, typeof active>()
    for (const t of active) {
      const arr = activeByList.get(t.listId)
      if (arr) arr.push(t)
      else activeByList.set(t.listId, [t])
    }

    const rows: SectionBlockRow[] = []
    for (const list of sortedLists) {
      const listTasks = activeByList.get(list.id)
      if (!listTasks || listTasks.length === 0) continue

      const listSecs = sections
        .filter((s) => s.listId === list.id)
        .sort((a, b) => a.order - b.order)
      const listLabel = displayListName(list.id, list.name)

      if (listSecs.length === 0) {
        rows.push({
          listId: list.id,
          sectionId: null,
          title: listLabel,
          listTitle: null,
          tasks: listTasks,
          headerKind: 'list-only',
        })
        continue
      }

      const map = new Map<string | null, typeof active>()
      map.set(null, [])
      for (const s of listSecs) map.set(s.id, [])
      for (const t of listTasks) {
        const sid = t.sectionId ?? null
        const bucket = map.get(sid)
        if (bucket) bucket.push(t)
        else map.get(null)!.push(t)
      }

      let first = true
      const pushRow = (
        sectionId: string | null,
        title: string,
        tasksIn: typeof active,
        headerKind: 'section-none' | 'section-named',
      ) => {
        rows.push({
          listId: list.id,
          sectionId,
          title,
          listTitle: first ? listLabel : null,
          tasks: tasksIn,
          headerKind,
        })
        first = false
      }
      pushRow(null, t('sections.noneTitle'), map.get(null) ?? [], 'section-none')
      for (const s of listSecs) {
        pushRow(s.id, s.name, map.get(s.id) ?? [], 'section-named')
      }
    }
    return rows.length > 0 ? rows : null
  }, [showSectionBlocks, selectedListId, listSectionsOrdered, active, t, lists, sections])

  return { filtered, groupingScope, groupBySection, showSectionBlocks, active, sectionBlocks }
}
