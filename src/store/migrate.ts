/**
 * 保存データの移行。`STORE_VERSION`（`storeConstants.ts`）を上げたら、ここに手順を足す
 */
import { format } from 'date-fns'
import type { Task } from '../types/task'
import type { TaskList } from '../types/list'
import type { ListSection } from '../types/section'
import { inferHabitTimeMode } from '../types/habit'
import { migrateLegacyCanvasIds } from '../lib/canvasLegacyMigration'
import { DEFAULT_LIST_COLOR_PALETTE_ID, normalizeListColorPaletteId, paletteColors } from '../lib/listColorPalettes'
import { normalizeTimeLogTagPresetList } from '../lib/tagColors'
import { assignColorsInOrder, labelForHex } from '../lib/logCategoryColors'
import { nearestGoogleHex } from '../lib/googleColors'
import { looksLikeSleep } from '../lib/sleep'
import { INBOX_COLOR, INBOX_ID, LEGACY_DATA_OWNER } from './storeConstants'
import { defaultLogCategories } from './storeDefaults'
import type { TaskState } from './storeTypes'

const defaultPaletteColors = paletteColors(DEFAULT_LIST_COLOR_PALETTE_ID)

/** persist の `migrate`。`version` は保存されていたデータの版 */
export function migrateTaskState(persisted: unknown, version: number): TaskState {
  const state = persisted as Record<string, unknown>
  if (version < 2) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      description: (t as Record<string, unknown>).description ?? '',
      updatedAt: (t as Record<string, unknown>).updatedAt ?? (t as Record<string, unknown>).createdAt ?? new Date().toISOString(),
    }))
  }
  if (version < 3) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      recurrence: (t as Record<string, unknown>).recurrence ?? null,
      description: (t as Record<string, unknown>).description ?? '',
      updatedAt: (t as Record<string, unknown>).updatedAt ?? new Date().toISOString(),
    }))
    state.searchQuery = state.searchQuery ?? ''
    state.sortMode = state.sortMode ?? 'manual'
    state.deletedTasks = state.deletedTasks ?? []
  }
  if (version < 4) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      startTime: (t as Record<string, unknown>).startTime ?? null,
      endTime: (t as Record<string, unknown>).endTime ?? null,
    }))
  }
  if (version < 5) {
    const lists = (state.lists as Record<string, unknown>[]) ?? []
    const cols = defaultPaletteColors
    state.lists = lists.map((l, i) => ({
      ...l,
      color: (l as Record<string, unknown>).color ?? cols[i % cols.length],
    }))
  }
  if (version < 6) {
    state.notificationsEnabled = state.notificationsEnabled ?? false
  }
  if (version < 7) {
    state.googleConnected = state.googleConnected ?? false
  }
  if (version < 8) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      isTimeLog: (t as Record<string, unknown>).isTimeLog ?? false,
    }))
    state.activeTimer = state.activeTimer ?? null
  }
  if (version < 9) {
    state.habits = state.habits ?? []
  }
  if (version < 10) {
    state.listColorPaletteId = normalizeListColorPaletteId(state.listColorPaletteId)
  }
  if (version < 11) {
    state.sections = Array.isArray(state.sections) ? state.sections : []
    state.quickAddSectionId =
      typeof state.quickAddSectionId === 'string' || state.quickAddSectionId === null
        ? state.quickAddSectionId
        : null
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      sectionId: (t as Record<string, unknown>).sectionId ?? null,
    }))
  }
  if (version < 12) {
    if (state.selectedView === 'week-calendar') {
      state.selectedView = 'calendar'
      state.calendarMode = 'week'
    } else {
      const cm = state.calendarMode
      state.calendarMode = cm === 'week' || cm === 'month' ? cm : 'month'
    }
  }
  if (version < 13) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      isTimeLog: t.isTimeLog === true || t.is_time_log === true,
    }))
  }
  if (version < 14) {
    const lists = (state.lists as Record<string, unknown>[]) ?? []
    state.lists = lists.map((l) => {
      const rec = l as Record<string, unknown>
      if (rec.id === INBOX_ID && rec.name === '受信トレイ') {
        return { ...rec, name: '未分類' }
      }
      return l
    })
  }
  if (version < 15) {
    const habits = (state.habits as Record<string, unknown>[]) ?? []
    state.habits = habits.map((h) => {
      const rec = h as Record<string, unknown>
      const startTime = typeof rec.startTime === 'string' ? rec.startTime : null
      const endTime = typeof rec.endTime === 'string' ? rec.endTime : null
      const timeMode =
        rec.timeMode === 'none' || rec.timeMode === 'fixed' || rec.timeMode === 'range'
          ? rec.timeMode
          : inferHabitTimeMode(startTime, endTime)
      return {
        ...rec,
        timeMode,
        startTime,
        endTime,
      }
    })
  }
  if (version < 16) {
    const raw = state.timeLogTagPresets
    state.timeLogTagPresets = Array.isArray(raw)
      ? normalizeTimeLogTagPresetList(raw.filter((x): x is string => typeof x === 'string'))
      : []
  }
  if (version < 17) {
    const raw = state.selectedCalendarDateKey
    state.selectedCalendarDateKey =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? raw
        : format(new Date(), 'yyyy-MM-dd')
  }
  if (version < 18) {
    state.todayIncludeOverdue = state.todayIncludeOverdue === true
  }
  if (version < 19) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      endDate:
        typeof (t as Record<string, unknown>).endDate === 'string'
          ? ((t as Record<string, unknown>).endDate as string)
          : null,
    }))
  }
  if (version < 20) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => {
      const { pinned, ...rest } = t as Record<string, unknown>
      void pinned
      return rest
    })
  }
  if (version < 21) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => {
      const rec = t as Record<string, unknown>
      const completed = rec.completed === true
      const has = typeof rec.completedAt === 'string'
      if (completed && !has) {
        return {
          ...rec,
          completedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
        }
      }
      if (!completed) {
        return { ...rec, completedAt: null }
      }
      return { ...rec }
    })
  }
  if (version < 22) {
    delete state.todayIncludeOverdue
  }
  if (version < 23) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => ({
      ...t,
      location:
        typeof (t as Record<string, unknown>).location === 'string'
          ? ((t as Record<string, unknown>).location as string)
          : null,
    }))
  }
  if (version < 24) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => {
      const rec = t as Record<string, unknown>
      const dueTime = typeof rec.dueTime === 'string' ? rec.dueTime : null
      // 既存の「時間付き通常タスク」は期限日に予定されていたものとして予定日へ引き継ぐ
      const isLog = rec.isTimeLog === true
      const hasRange = typeof rec.startTime === 'string' && typeof rec.endTime === 'string'
      let scheduledDate: string | null =
        typeof rec.scheduledDate === 'string' ? (rec.scheduledDate as string) : null
      if (scheduledDate === null && !isLog && hasRange && typeof rec.dueDate === 'string') {
        scheduledDate = rec.dueDate as string
      }
      return { ...rec, dueTime, scheduledDate }
    })
  }
  if (version < 25) {
    const tasks = (state.tasks as Record<string, unknown>[]) ?? []
    state.tasks = tasks.map((t) => {
      const rec = t as Record<string, unknown>
      return {
        ...rec,
        archivedAt: typeof rec.archivedAt === 'string' ? rec.archivedAt : null,
        deletedAt: typeof rec.deletedAt === 'string' ? rec.deletedAt : null,
      }
    })
  }
  if (version < 26) {
    // 分類を 1 つも持っていないと記録がほぼ「未分類」になるので、既定の分類を入れる
    const presets = state.timeLogTagPresets
    if (!Array.isArray(presets) || presets.length === 0) state.timeLogTagPresets = defaultLogCategories()
  }
  if (version < 28) {
    // パレットを Google カレンダーの 11 色に統一: 既存の色を色味の最も近い色へ
    const lists = (state.lists as Record<string, unknown>[] | undefined) ?? []
    state.lists = lists.map((l) => ({
      ...l,
      color: l.id === INBOX_ID ? INBOX_COLOR : nearestGoogleHex(String(l.color ?? '')),
    }))
    const habits = (state.habits as Record<string, unknown>[] | undefined) ?? []
    state.habits = habits.map((h) => ({ ...h, color: nearestGoogleHex(String(h.color ?? '')) }))
  }
  if (version < 27) {
    // 色は並び順から決めていたので、今見えている色のまま固定する（並べ替えで変わらないように）
    const presets = Array.isArray(state.timeLogTagPresets) ? (state.timeLogTagPresets as string[]) : []
    if (!state.logCategoryColors || typeof state.logCategoryColors !== 'object') {
      state.logCategoryColors = assignColorsInOrder(presets)
    }
  }
  if (version < 29) {
    // 記録画面は「今日」に統合した
    if (state.selectedView === 'activity-log') state.selectedView = 'planner'
  }
  if (version < 30) {
    // 色＝ラベル: Google の色だけ写した記録は、同じ色のラベル（分類）があればそれにする
    const presets = Array.isArray(state.timeLogTagPresets) ? (state.timeLogTagPresets as string[]) : []
    const colors = (state.logCategoryColors as Record<string, string> | undefined) ?? {}
    const now = new Date().toISOString()
    const tasks = (state.tasks as Task[] | undefined) ?? []
    state.tasks = tasks.map((t) => {
      if (!t.isTimeLog || t.tags.length > 0) return t
      const name = labelForHex(t.color, presets, colors)
      return name ? { ...t, tags: [name], color: null, updatedAt: now } : t
    })
  }
  if (version < 31) {
    // 「予定と記録」画面はカレンダー（週・予定｜記録の 2 列）に統合した
    if (state.selectedView === 'plan-vs-actual') {
      state.selectedView = 'calendar'
      state.calendarMode = 'week'
    }
  }
  if (version < 32) {
    // 睡眠は専用の記録にした: 「睡眠」で付けていた記録に印を付ける
    const now = new Date().toISOString()
    const tasks = (state.tasks as Task[] | undefined) ?? []
    state.tasks = tasks.map((t) => (looksLikeSleep(t) ? { ...t, isSleep: true, updatedAt: now } : t))
  }
  if (version < 33) {
    // 持ち主の記録はこの版から。それまでのデータは、この端末で同期していた本人のものとみなす
    state.dataOwner = LEGACY_DATA_OWNER
  }
  if (version < 34) {
    // 夕方の締めの通知は廃止した（予定ごとの記録の確認に置き換え）
    const r = state.dailyReminders as Record<string, unknown> | undefined
    if (r) state.dailyReminders = { planTime: typeof r.planTime === 'string' ? r.planTime : null }
  }
  if (version < 35) {
    // Canvas の最初の版の id を学校名入りに（重複は利用者の書いたものを写してまとめる）。サーバーは 006 で同じことをする
    const migrated = migrateLegacyCanvasIds(
      {
        lists: (state.lists as TaskList[]) ?? [],
        sections: (state.sections as ListSection[]) ?? [],
        tasks: (state.tasks as Task[]) ?? [],
      },
      new Date().toISOString(),
    )
    state.sections = migrated.sections
    state.tasks = migrated.tasks
  }
  return state as unknown as TaskState
}
