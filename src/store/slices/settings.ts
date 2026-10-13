/** 設定（テーマ・色・ラベル・通知・タイムゾーン） */
import { normalizeTimeLogTagPresetList } from '../../lib/timeLogTags'
import { categoryHex, isHexColor, labelForHex, nextCategoryColor } from '../../lib/logCategoryColors'
import { hexForGoogleKey } from '../../lib/googleColors'
import { isValidTimeZone, setAppTimeZoneSetting } from '../../lib/timeZone'
import { reanchorTasks } from '../../lib/taskTimeZone'
import { normalizeExtraTimeZones } from '../../lib/extraTimeZones'
import { normalizeWeekStart } from '../../lib/weekStart'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'
import { withLogCategory } from '../../lib/taskDefaults'
import { isLogTask } from '../../types/task'
import { validTargetMinutes } from '../../lib/labelTargets'

const sameTargets = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

type SettingsActions = Pick<
  TaskState,
  | 'setTheme'
  | 'setTimeLogTagPresets'
  | 'addLogCategory'
  | 'moveLogCategory'
  | 'saveLogLabels'
  | 'setDailyReminders'
  | 'dismissReminderPrompt'
  | 'dismissGoogleConnectLine'
  | 'finishOnboarding'
  | 'completeOnboarding'
  | 'dismissInstallNudge'
  | 'dismissSignInNudge'
  | 'setDailyCapacityMinutes'
  | 'setDefaultBlockMinutes'
  | 'setAppTimeZone'
  | 'setWeekStartsOn'
  | 'setExtraTimeZones'
  | 'setExtraTimeZoneLabel'
  | 'setEventReminderMinutes'
  | 'toggleNotifications'
  | 'setRecordPrompts'
  | 'enableRecommendedNotifications'
>

export function createSettingsSlice({ set, get, undo }: SliceContext): SettingsActions {
  const { pushUndo } = undo
  return {
    setTheme: (theme) => set({ theme }),

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
        // 週の目安（#291）: 行に書いてあればそれ（null は外す）、無ければ元のラベルの目安を名前の変更についていかせる。消したラベルの目安は残さない
        const targets: Record<string, number> = {}
        const rename = new Map<string, string>()
        for (const row of rows) {
          const name = row.name.trim()
          if (!name) continue
          if (row.from && row.from !== name) rename.set(row.from, name)
          if (presets.includes(name)) continue
          presets.push(name)
          colors[name] = row.color
          const target =
            row.weeklyTargetMinutes !== undefined
              ? validTargetMinutes(row.weeklyTargetMinutes)
              : validTargetMinutes(s.logLabelTargets[row.from ?? name])
          if (target) targets[name] = target
        }
        // 予定・タスクは色（hex）だけ持つので、ラベルの色を変えたら同じ色の予定・タスクも新しい色へ
        const recolor = new Map<string, string>()
        for (const row of rows) {
          const name = row.name.trim()
          if (row.fromHex) {
            const oldHex = row.fromHex.toUpperCase()
            const newHex = (isHexColor(row.color) ? row.color : (hexForGoogleKey(row.color) ?? oldHex)).toUpperCase()
            if (oldHex !== newHex) recolor.set(oldHex, newHex)
            continue
          }
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
          if (!isLogTask(t)) {
            const next = t.color ? recolor.get(t.color.toUpperCase()) : undefined
            return next ? { ...t, color: next, updatedAt: now } : t
          }
          const tag = t.category
          // 名前の無い色の記録も、その色を変えたら新しい色へ（新しい色にラベルがあればその分類になる）
          const moved = !tag && t.color ? recolor.get(t.color.toUpperCase()) : undefined
          if (moved) {
            const label = labelForHex(moved, presets, colors)
            return withLogCategory({ ...t, category: label, color: label ? null : moved, updatedAt: now })
          }
          if (tag && rename.has(tag)) return withLogCategory({ ...t, category: rename.get(tag)!, updatedAt: now })
          if (tag && removedHex.has(tag)) return withLogCategory({ ...t, category: null, color: removedHex.get(tag)!, updatedAt: now })
          if (!tag && t.color) {
            const label = labelForHex(t.color, presets, colors)
            if (label) return withLogCategory({ ...t, category: label, color: null, updatedAt: now })
          }
          return t
        })
        // To‑Do をその色で絞っていたら、新しい色で絞り直す
        const filterColor = s.filterColor ? (recolor.get(s.filterColor.toUpperCase()) ?? s.filterColor) : s.filterColor
        return {
          timeLogTagPresets: presets,
          logCategoryColors: { ...s.logCategoryColors, ...colors },
          // 中身が同じなら前の値のまま（目安を扱わない保存で「ラベル表を変えた」扱いを増やさない）
          logLabelTargets: sameTargets(targets, s.logLabelTargets) ? s.logLabelTargets : targets,
          tasks,
          filterColor,
        }
      })
    },

    setDailyReminders: (patch) => set((s) => ({ dailyReminders: { ...s.dailyReminders, ...patch } })),
    dismissReminderPrompt: () => set({ reminderPromptDismissed: true }),
    dismissGoogleConnectLine: () => set({ googleConnectLineDismissed: true }),
    finishOnboarding: () => set({ onboardingDone: true }),
    completeOnboarding: () => set({ onboardingDone: true, onboardingCompleted: true }),
    dismissInstallNudge: () => set({ installNudgeDismissed: true }),
    dismissSignInNudge: () => set({ signInNudgeDismissed: true }),
    setDailyCapacityMinutes: (minutes) => set({ dailyCapacityMinutes: Math.max(60, Math.round(minutes)) }),
    setDefaultBlockMinutes: (minutes) => set({ defaultBlockMinutes: Math.min(24 * 60, Math.max(15, Math.round(minutes))) }),
    setAppTimeZone: (tz) => {
      const next = tz && isValidTimeZone(tz) ? tz : null
      setAppTimeZoneSetting(next)
      // 時刻のある予定・記録は、すべて同じ瞬間のまま新しいタイムゾーンの時刻に（Google と同じ）
      set((s) => ({ appTimeZone: next, tasks: reanchorTasks(s.tasks) }))
    },
    setWeekStartsOn: (day) => set({ weekStartsOn: normalizeWeekStart(day) }),
    setExtraTimeZones: (zones) => set({ extraTimeZones: normalizeExtraTimeZones(zones) }),
    setExtraTimeZoneLabel: (tz, label) =>
      set((s) => {
        const next = normalizeExtraTimeZones(s.extraTimeZones.map((z) => (z.tz === tz ? { ...z, label } : z)))
        return next.every((z, i) => z.label === s.extraTimeZones[i]?.label) ? {} : { extraTimeZones: next }
      }),
    setEventReminderMinutes: (minutes) => set({ eventReminderMinutes: minutes }),

    toggleNotifications: () => set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
    setRecordPrompts: (on) => set({ recordPrompts: on }),
    enableRecommendedNotifications: () =>
      set((s) => ({
        dailyReminders: { ...s.dailyReminders, planTime: s.dailyReminders.planTime ?? '08:00' },
        eventReminderMinutes: s.eventReminderMinutes ?? 10,
        notificationsEnabled: true,
        recordPrompts: true,
      })),
  }
}
