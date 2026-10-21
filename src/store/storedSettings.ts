/**
 * 本体に保存する設定（行以外の `DATA_KEYS`）の表。保存データを使う 3 つの道（読み込みの `merge`・他のタブの書き込みを取り込む
 * `adoptOtherTabChanges`・localStorage で動いた回を合わせる `takeInRecoveredLocal`）は、どれもこの表で同じようにそろえる。
 * 変えた時刻（`*UpdatedAt`）を付ける購読も、localStorage で動いた回の合わせ方（`recoverLocal.ts`）もこの表から作る。
 * 設定を足したら、ここに 1 行足す（`storedSettings.test.ts` が `DATA_KEYS` と比べて確かめる）
 */
import { normalizeExtraTimeZones } from '../lib/extraTimeZones'
import { normalizeEventTemplates } from '../lib/eventTemplates'
import { normalizeLabelTargets } from '../lib/labelTargets'
import { normalizeLabelIds } from '../lib/labelIds'
import { normalizeCourseLinks } from '../lib/courseLinks'
import { normalizeWeekStart } from '../lib/weekStart'
import { normalizeDayMoods } from '../lib/dayMood'
import { normalizeTimetable } from '../lib/timetable'
import { normalizeAddons } from '../lib/addons'
import { normalizeStoredRows } from '../lib/backupFormat'
import { withTaskDefaults } from '../lib/taskDefaults'
import type { Task } from '../types/task'
import type { DATA_KEYS } from './persistKeys'

/** 行（id ごとに合わせる一覧） */
export const ROW_KEYS = ['tasks', 'lists', 'habits', 'sections'] as const
type RowKey = (typeof ROW_KEYS)[number]
export type SettingDataKey = Exclude<(typeof DATA_KEYS)[number], RowKey>

interface StoredSetting {
  /** 保存データの値をそろえる（型の違う値は既定値・直した値に）。無ければそのまま入れる */
  normalize?: (raw: unknown) => unknown
  /** この設定を変えたら進める、変えた時刻の名前（ほかの端末・localStorage で動いた回とどちらが新しいかを比べる） */
  stamp?: SettingDataKey
}

const strings = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string') : [])

export const STORED_SETTINGS: Record<SettingDataKey, StoredSetting> = {
  dataOwner: {},
  theme: {},
  notificationsEnabled: {},
  recordPrompts: {},
  timeLogTagPresets: { stamp: 'logLabelsUpdatedAt' },
  logCategoryColors: { stamp: 'logLabelsUpdatedAt' },
  logLabelTargets: { normalize: normalizeLabelTargets, stamp: 'logLabelsUpdatedAt' },
  logLabelIds: { normalize: normalizeLabelIds, stamp: 'logLabelsUpdatedAt' },
  logLabelsUpdatedAt: {},
  logLabelPendingAdds: { normalize: strings },
  googleEventColors: {},
  activeTimer: { stamp: 'activeTimerUpdatedAt' },
  activeTimerUpdatedAt: {},
  dailyReminders: {},
  reminderPromptDismissed: {},
  googleConnectLineDismissed: {},
  onboardingDone: {},
  onboardingCompleted: {},
  installNudgeDismissed: {},
  signInNudgeDismissed: {},
  dailyCapacityMinutes: {},
  defaultBlockMinutes: {},
  eventReminderMinutes: {},
  appTimeZone: {},
  weekStartsOn: { normalize: normalizeWeekStart },
  extraTimeZones: { normalize: normalizeExtraTimeZones, stamp: 'extraTimeZonesUpdatedAt' },
  extraTimeZonesUpdatedAt: {},
  eventTemplates: { normalize: normalizeEventTemplates, stamp: 'eventTemplatesUpdatedAt' },
  eventTemplatesUpdatedAt: {},
  courseLinks: { normalize: normalizeCourseLinks, stamp: 'courseLinksUpdatedAt' },
  courseLinksUpdatedAt: {},
  dayMoods: { normalize: normalizeDayMoods },
  timetable: { normalize: normalizeTimetable, stamp: 'timetableUpdatedAt' },
  timetableUpdatedAt: {},
  addons: { normalize: normalizeAddons, stamp: 'addonsUpdatedAt' },
  addonsUpdatedAt: {},
}

/** 変えた時刻の名前 → その時刻で比べる設定 */
export const SETTING_STAMPS: Record<string, SettingDataKey[]> = {}
for (const [key, s] of Object.entries(STORED_SETTINGS) as [SettingDataKey, StoredSetting][])
  if (s.stamp) (SETTING_STAMPS[s.stamp] ??= []).push(key)

/**
 * 保存データ（本体の `state`。他のタブ・localStorage で動いた回のものも）の中身を、その場でそろえる。あるキーだけを見る。
 * 行はバックアップの取り込みと同じ基準で（読めない行は外す。配列でなければキーごと外す＝呼ぶ側の値のまま）、
 * 設定は表の `normalize` で。`broken` は読めない行を外した・一覧が配列でなかったとき（元の中身を別のキーに写す合図）
 */
export function normalizeStoredState(state: Record<string, unknown>): { broken: boolean } {
  let broken = false
  for (const key of ROW_KEYS) {
    if (!(key in state)) continue
    const { rows, broken: bad } = normalizeStoredRows(key, state[key])
    if (bad) broken = true
    if (rows) state[key] = key === 'tasks' ? (rows as Task[]).map(withTaskDefaults) : rows
    else delete state[key]
  }
  for (const [key, s] of Object.entries(STORED_SETTINGS) as [SettingDataKey, StoredSetting][])
    if (s.normalize && key in state) state[key] = s.normalize(state[key])
  return { broken }
}
