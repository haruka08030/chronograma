import type { TaskState } from './storeTypes'

/**
 * ストアの値をどこに保存するか（新しい値を足したら必ずどれかに入れる。`persistKeys.test.ts` が確かめる）。
 *
 * - DATA: データと設定。localStorage の本体（`chronograma-tasks`）に保存し、他のタブとも共有する
 * - VIEW: 開いていた画面・並び順などの好み。小さな別の保存先（`chronograma-view-v1`）に。
 *   画面を切り替えるたびに全データを書き直さない・他のタブに読み直させないため
 * - TRANSIENT: 保存しない（通知・同期の状態・選んだ日など、開き直したら最初からでよいもの）
 */
export const DATA_KEYS = [
  'tasks',
  'lists',
  'sections',
  'habits',
  'dataOwner',
  'theme',
  'notificationsEnabled',
  'recordPrompts',
  'timeLogTagPresets',
  'logCategoryColors',
  'logLabelTargets',
  'logLabelsUpdatedAt',
  'logLabelPendingAdds',
  'googleEventColors',
  'activeTimer',
  'activeTimerUpdatedAt',
  'dailyReminders',
  'reminderPromptDismissed',
  'googleConnectLineDismissed',
  'onboardingDone',
  'onboardingCompleted',
  'installNudgeDismissed',
  'signInNudgeDismissed',
  'dailyCapacityMinutes',
  'defaultBlockMinutes',
  'eventReminderMinutes',
  'appTimeZone',
  'weekStartsOn',
  'extraTimeZones',
  'extraTimeZonesUpdatedAt',
  'eventTemplates',
  'eventTemplatesUpdatedAt',
  'courseLinks',
  'courseLinksUpdatedAt',
  'dayMoods',
  'timetable',
  'timetableUpdatedAt',
] as const satisfies readonly (keyof TaskState)[]

export const VIEW_KEYS = [
  'selectedListId',
  'selectedView',
  'calendarMode',
  'sortByKey',
  'sectionGrouping',
  'plannerCandidateView',
  'todoFilter',
  'completedFilter',
] as const satisfies readonly (keyof TaskState)[]

export const TRANSIENT_KEYS = [
  // 開き直したら今日から（保存すると翌日に開いたとき昨日が選ばれている）
  'selectedCalendarDateKey',
  'filterTag',
  'filterColor',
  'quickAddSectionId',
  'searchQuery',
  'settingsScrollTarget',
  'sectionScrollTarget',
  'storageFull',
  'recentDeletes',
  'moveBannerText',
  'undoBanner',
  'googleUndo',
  'taskDragHoverListId',
  'syncState',
  'lastSyncedAt',
  'syncRejected',
  'quickAddRequested',
  'recordPromptTaskId',
  'completePromptTaskId',
  'labelPromptLogId',
  'calendarEvents',
  'googleConnected',
  'googleAccessToken',
  'googleConnectionError',
  'googleCanWrite',
  // 毎週の予定のカード・詳細を開いている間だけ（閉じたら「この予定のみ」に戻る）
  'seriesEditScope',
] as const satisfies readonly (keyof TaskState)[]

export function pickKeys<K extends string>(source: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {}
  for (const k of keys) if (k in source) out[k] = source[k]
  return out
}
