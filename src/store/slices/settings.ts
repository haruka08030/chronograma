/** 設定（テーマ・色・ラベル・通知・タイムゾーン） */
import { normalizeTimeLogTagPresetList } from '../../lib/timeLogTags'
import { categoryHex, labelForHex, nextCategoryColor } from '../../lib/logCategoryColors'
import { isValidTimeZone, setAppTimeZoneSetting } from '../../lib/timeZone'
import { reanchorTasks } from '../../lib/taskTimeZone'
import { normalizeExtraTimeZones } from '../../lib/extraTimeZones'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'
import { withLogCategory } from '../../lib/taskDefaults'

type SettingsActions = Pick<
  TaskState,
  | 'toggleTheme'
  | 'setTheme'
  | 'setListColorPalette'
  | 'setTimeLogTagPresets'
  | 'addLogCategory'
  | 'moveLogCategory'
  | 'saveLogLabels'
  | 'setDailyReminders'
  | 'dismissReminderPrompt'
  | 'setDailyCapacityMinutes'
  | 'setAppTimeZone'
  | 'setExtraTimeZones'
  | 'setExtraTimeZoneLabel'
  | 'setEventReminderMinutes'
  | 'toggleNotifications'
  | 'setRecordPrompts'
  | 'setTagsEnabled'
  | 'enableRecommendedNotifications'
>

export function createSettingsSlice({ set, get, undo }: SliceContext): SettingsActions {
  const { pushUndo } = undo
  return {
    toggleTheme: () =>
      set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    setTheme: (theme) => set({ theme }),

    setListColorPalette: (id) => {
      pushUndo()
      set({ listColorPaletteId: id })
    },

    setTimeLogTagPresets: (presets) => {
      pushUndo()
      set({ timeLogTagPresets: normalizeTimeLogTagPresetList(presets) })
    },
    addLogCategory: (raw, color) => {
      const name = raw.trim()
      const s0 = get()
      if (!name || s0.timeLogTagPresets.includes(name)) return
      pushUndo()
      set({
        timeLogTagPresets: [...s0.timeLogTagPresets, name],
        logCategoryColors: {
          ...s0.logCategoryColors,
          [name]: color ?? s0.logCategoryColors[name] ?? nextCategoryColor(name, s0.logCategoryColors, s0.timeLogTagPresets),
        },
      })
    },
    moveLogCategory: (name, delta) => {
      const list = [...get().timeLogTagPresets]
      const i = list.indexOf(name)
      const j = i + delta
      if (i < 0 || j < 0 || j >= list.length) return
      pushUndo()
      ;[list[i], list[j]] = [list[j]!, list[i]!]
      set({ timeLogTagPresets: list })
    },
    saveLogLabels: (rows) => {
      // 消したラベルがあれば「元に戻す」で知らせる（ほかの削除と同じく、確認は出さずに戻せるようにする）
      const nextNames = new Set(rows.flatMap((r) => [r.name.trim(), r.from ?? '']).filter(Boolean))
      const removed = get().timeLogTagPresets.filter((n) => !nextNames.has(n))
      pushUndo(
        removed.length === 1
          ? { key: 'undo.labelDeleted', params: { name: removed[0] } }
          : removed.length > 1
            ? { key: 'undo.labelsDeleted', params: { count: removed.length } }
            : undefined,
      )
      const now = new Date().toISOString()
      set((s) => {
        const presets: string[] = []
        const colors: Record<string, string> = {}
        const rename = new Map<string, string>()
        for (const row of rows) {
          const name = row.name.trim()
          if (!name) continue
          if (row.from && row.from !== name) rename.set(row.from, name)
          if (presets.includes(name)) continue
          presets.push(name)
          colors[name] = row.color
        }
        // 予定・タスクは色（hex）だけ持つので、ラベルの色を変えたら同じ色の予定・タスクも新しい色へ
        const recolor = new Map<string, string>()
        for (const row of rows) {
          const name = row.name.trim()
          const from = row.from ?? name
          if (!name || !s.timeLogTagPresets.includes(from)) continue
          const oldHex = categoryHex(from, s.logCategoryColors).toUpperCase()
          const newHex = categoryHex(name, { ...s.logCategoryColors, ...colors }).toUpperCase()
          if (oldHex !== newHex) recolor.set(oldHex, newHex)
        }
        const kept = new Set([...presets, ...rename.keys()])
        const removedHex = new Map(
          s.timeLogTagPresets.filter((n) => !kept.has(n)).map((n) => [n, categoryHex(n, s.logCategoryColors)] as const),
        )
        const tasks = s.tasks.map((t) => {
          if (!t.isTimeLog) {
            const next = t.color ? recolor.get(t.color.toUpperCase()) : undefined
            return next ? { ...t, color: next, updatedAt: now } : t
          }
          const tag = t.category
          if (tag && rename.has(tag)) return withLogCategory({ ...t, category: rename.get(tag)!, updatedAt: now })
          if (tag && removedHex.has(tag)) return withLogCategory({ ...t, category: null, color: removedHex.get(tag)!, updatedAt: now })
          if (!tag && t.color) {
            const label = labelForHex(t.color, presets, colors)
            if (label) return withLogCategory({ ...t, category: label, color: null, updatedAt: now })
          }
          return t
        })
        return { timeLogTagPresets: presets, logCategoryColors: { ...s.logCategoryColors, ...colors }, tasks }
      })
    },

    setDailyReminders: (patch) => set((s) => ({ dailyReminders: { ...s.dailyReminders, ...patch } })),
    dismissReminderPrompt: () => set({ reminderPromptDismissed: true }),
    setDailyCapacityMinutes: (minutes) => set({ dailyCapacityMinutes: Math.max(60, Math.round(minutes)) }),
    setAppTimeZone: (tz) => {
      const next = tz && isValidTimeZone(tz) ? tz : null
      setAppTimeZoneSetting(next)
      // 時刻のある予定・記録は、すべて同じ瞬間のまま新しいタイムゾーンの時刻に（Google と同じ）
      set((s) => ({ appTimeZone: next, tasks: reanchorTasks(s.tasks) }))
    },
    setExtraTimeZones: (zones) => set({ extraTimeZones: normalizeExtraTimeZones(zones) }),
    setExtraTimeZoneLabel: (tz, label) =>
      set((s) => {
        const next = normalizeExtraTimeZones(s.extraTimeZones.map((z) => (z.tz === tz ? { ...z, label } : z)))
        return next.every((z, i) => z.label === s.extraTimeZones[i]?.label) ? {} : { extraTimeZones: next }
      }),
    setEventReminderMinutes: (minutes) => set({ eventReminderMinutes: minutes }),

    toggleNotifications: () =>
      set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
    setRecordPrompts: (on) => set({ recordPrompts: on }),
    setTagsEnabled: (on) => set(on ? { tagsEnabled: true } : { tagsEnabled: false, filterTag: null }),
    enableRecommendedNotifications: () =>
      set((s) => ({
        dailyReminders: { planTime: s.dailyReminders.planTime ?? '08:00' },
        eventReminderMinutes: s.eventReminderMinutes ?? 10,
        notificationsEnabled: true,
        recordPrompts: true,
      })),
  }
}
