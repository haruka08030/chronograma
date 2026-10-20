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
import { compactLabelIds, effectiveLabelIds, labelIndex, relabelTasks } from '../../lib/labelIds'
import type { Task } from '../../types/task'

const withoutLabelId = (t: Task): Task => {
  if (t.labelId === undefined) return t
  const { labelId: _drop, ...rest } = t
  void _drop
  return rest as Task
}

const sameTargets = <T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>) => {
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
      const presets = [...s0.timeLogTagPresets, name]
      // 名前から決まる id がほかのラベル（名前を変えたラベルの元の名前）と重なるときだけ、決め直した id を書いておく
      const ids = compactLabelIds(presets, effectiveLabelIds(presets, s0.logLabelIds))
      set({
        timeLogTagPresets: presets,
        ...(sameTargets(ids, s0.logLabelIds) ? {} : { logLabelIds: ids }),
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
      // 名前を空にした行は消したラベル（元の名前 `from` も残さない）
      const nextNames = new Set(
        rows
          .filter((r) => r.name.trim())
          .flatMap((r) => [r.name.trim(), r.from ?? ''])
          .filter(Boolean),
      )
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
        // id（#365）: 名前を変えても元のラベルの id のまま。新しいラベルは名前から決める
        const oldIds = effectiveLabelIds(s.timeLogTagPresets, s.logLabelIds)
        const ids: Record<string, string> = {}
        const rename = new Map<string, string>()
        for (const row of rows) {
          const name = row.name.trim()
          if (!name) continue
          if (row.from && row.from !== name) rename.set(row.from, name)
          if (presets.includes(name)) continue
          presets.push(name)
          colors[name] = row.color
          const id = row.from ? oldIds.get(row.from) : undefined
          if (id) ids[name] = id
          const target =
            row.weeklyTargetMinutes !== undefined
              ? validTargetMinutes(row.weeklyTargetMinutes)
              : validTargetMinutes(s.logLabelTargets[row.from ?? name])
          if (target) targets[name] = target
        }
        const logLabelIds = compactLabelIds(presets, effectiveLabelIds(presets, ids))
        // 名前の無かった色（To‑Do ナビの色ラベル）の色を変えたら、その色の予定・タスクも新しい色へ（ラベルではないので行を直す）
        const recolor = new Map<string, string>()
        // To‑Do の絞り込みの色はラベルの色の変更にもついていく
        const filterRecolor = new Map<string, string>()
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
          if (oldHex !== newHex) filterRecolor.set(oldHex, newHex)
        }
        const before = labelIndex(s)
        const after = labelIndex({ timeLogTagPresets: presets, logCategoryColors: { ...s.logCategoryColors, ...colors }, logLabelIds })
        const kept = new Set([...presets, ...rename.keys()])
        const removedIds = new Set(s.timeLogTagPresets.filter((n) => !kept.has(n)).map((n) => before.byName.get(n)!.id))
        const removedHex = new Map(
          s.timeLogTagPresets.filter((n) => !kept.has(n)).map((n) => [n, categoryHex(n, s.logCategoryColors)] as const),
        )
        const changed = s.tasks.map((t) => {
          if (!isLogTask(t)) {
            const next = t.color ? recolor.get(t.color.toUpperCase()) : undefined
            if (next) return { ...t, color: next, updatedAt: now }
            // 消したラベルの To‑Do・予定は色だけ残す（名前の無い色）
            if (t.labelId && removedIds.has(t.labelId)) return withoutLabelId(t)
            return t
          }
          const tag = t.category
          // 名前の無い色の記録も、その色を変えたら新しい色へ（新しい色にラベルがあればその分類になる）
          const moved = !tag && t.color ? (recolor.get(t.color.toUpperCase()) ?? filterRecolor.get(t.color.toUpperCase())) : undefined
          if (moved) {
            const label = labelForHex(moved, presets, colors)
            return withLogCategory({ ...withoutLabelId(t), category: label, color: label ? null : moved, updatedAt: now })
          }
          if (tag && removedHex.has(tag) && (!t.labelId || removedIds.has(t.labelId))) {
            return withLogCategory({ ...withoutLabelId(t), category: null, color: removedHex.get(tag)!, updatedAt: now })
          }
          if (!tag && t.color) {
            const label = labelForHex(t.color, presets, colors)
            if (label) return withLogCategory({ ...withoutLabelId(t), category: label, color: null, updatedAt: now })
          }
          return t
        })
        // 名前・色を変えたラベルの行は、端末の中で今の名前・色にするだけ（updatedAt は変えない。行は書き直さない、#365）
        const tasks = relabelTasks(changed, before, after)
        // To‑Do をその色で絞っていたら、新しい色で絞り直す
        const filterColor = s.filterColor
          ? (recolor.get(s.filterColor.toUpperCase()) ?? filterRecolor.get(s.filterColor.toUpperCase()) ?? s.filterColor)
          : s.filterColor
        return {
          timeLogTagPresets: presets,
          logCategoryColors: { ...s.logCategoryColors, ...colors },
          // 中身が同じなら前の値のまま（目安を扱わない保存で「ラベル表を変えた」扱いを増やさない）
          logLabelTargets: sameTargets(targets, s.logLabelTargets) ? s.logLabelTargets : targets,
          logLabelIds: sameTargets(logLabelIds, s.logLabelIds) ? s.logLabelIds : logLabelIds,
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
