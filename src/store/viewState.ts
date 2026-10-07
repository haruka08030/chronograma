import type { CalendarMode, SectionGrouping, SmartView, SortMode, TaskState } from './storeTypes'

/**
 * 画面の好みの保存（`chronograma-view-v1`）を読む。版も migrate も通らないので、キーごとに形と取りうる値を確かめ、
 * 合わないものは捨てる（既定のまま）。ビューの名前が変わった古い値や、`sortByKey: null` で落ちないように
 */
type ViewState = Pick<TaskState, 'selectedListId' | 'selectedView' | 'calendarMode' | 'sortByKey' | 'sectionGrouping'>

// Record にして、型に値を足したらここでも足すよう型で知らせる
const SMART_VIEWS: Record<SmartView, true> = {
  planner: true,
  all: true,
  today: true,
  upcoming: true,
  overdue: true,
  calendar: true,
  stats: true,
  habits: true,
  completed: true,
  archived: true,
  deleted: true,
  settings: true,
}
const CALENDAR_MODES: Record<CalendarMode, true> = { month: true, week: true, threeDay: true, schedule: true }
const SORT_MODES: Record<SortMode, true> = { manual: true, dueDate: true, priority: true, title: true, createdAt: true }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isOneOf = <K extends string>(table: Record<K, true>, v: unknown): v is K => typeof v === 'string' && Object.hasOwn(table, v)

export function readViewState(raw: unknown): Partial<ViewState> {
  if (!isRecord(raw)) return {}
  const out: Partial<ViewState> = {}
  if (typeof raw.selectedListId === 'string' || raw.selectedListId === null) out.selectedListId = raw.selectedListId
  if (raw.selectedView === null || isOneOf(SMART_VIEWS, raw.selectedView)) out.selectedView = raw.selectedView
  if (isOneOf(CALENDAR_MODES, raw.calendarMode)) out.calendarMode = raw.calendarMode
  if (isRecord(raw.sortByKey)) {
    out.sortByKey = Object.fromEntries(Object.entries(raw.sortByKey).filter(([, v]) => isOneOf(SORT_MODES, v))) as Record<string, SortMode>
  }
  const g = raw.sectionGrouping
  if (isRecord(g) && typeof g.lists === 'boolean' && typeof g.dueViews === 'boolean') {
    const grouping: SectionGrouping = { lists: g.lists, dueViews: g.dueViews }
    if (isRecord(g.byList)) {
      grouping.byList = Object.fromEntries(Object.entries(g.byList).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>
    }
    out.sectionGrouping = grouping
  }
  return out
}
