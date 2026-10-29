/** バックアップ・取り込み・同期の状態・ログアウト時の初期化 */
import type { Task } from '../../types/task'
import { newId } from '../../lib/id'
import { assignColorsInOrder } from '../../lib/logCategoryColors'
import { buildBackupPayload, parseBackupJson, withFreshStamps, type BackupImportResult } from '../../lib/backupFormat'
import { ensureLabel, type LabelTable } from '../../lib/foldTaskFolders'
import { fillLabelIds, labelIndex } from '../../lib/labelIds'
import { clearImportRollback, loadImportRollback, saveImportRollback } from '../../lib/importRollback'
import { restoreMissing, restoreMissingSettings } from '../../lib/autoBackup'
import { INBOX_ID } from '../storeConstants'
import { defaultLogCategories, initialLists } from '../storeDefaults'
import { asIncomingChange } from '../../lib/changeOrigin'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'
import { appTodayKey } from '../../lib/timeZone'
import { downloadTextFile } from '../../lib/downloadFile'
import { TASK_DEFAULTS, withTaskDefaults } from '../../lib/taskDefaults'
import { hasExistingData } from '../../lib/onboarding'
import { DEFAULT_TIMETABLE } from '../../lib/timetable'
import { DEFAULT_ADDONS } from '../../lib/addons'

type DataActions = Pick<
  TaskState,
  | 'setSyncState'
  | 'setCloudPulledAt'
  | 'setSyncRejected'
  | 'setDataOwner'
  | 'resetLocalData'
  | 'backupJson'
  | 'restoreMissingFromBackup'
  | 'exportData'
  | 'importData'
  | 'restoreBeforeImport'
  | 'importTasksFromCsv'
>

/**
 * 取り込んだバックアップのタスクとラベル表。前の版のバックアップ（ラベルの id が無い）は、行の名前・色から id を付ける（#365）
 */
function importedLabels(
  parsed: BackupImportResult,
): Pick<TaskState, 'tasks' | 'timeLogTagPresets' | 'logCategoryColors' | 'logLabelIds'> & Partial<Pick<TaskState, 'logLabelTargets'>> {
  const table = {
    timeLogTagPresets: parsed.timeLogTagPresets ?? [],
    logCategoryColors: parsed.logCategoryColors ?? assignColorsInOrder(parsed.timeLogTagPresets ?? []),
    logLabelIds: parsed.logLabelIds,
  }
  return {
    ...table,
    // 週の目安はファイルにあるときだけ（前の版のバックアップには無い）
    ...(parsed.logLabelTargets ? { logLabelTargets: parsed.logLabelTargets } : {}),
    tasks: fillLabelIds(parsed.tasks.map(withTaskDefaults), labelIndex(table)),
  }
}

/**
 * 書き出し・自動バックアップ・取り込みの控えに入れるストアの値（`backupKeys.test.ts` が、保存する値（`DATA_KEYS`）ごとに
 * 入れるか・入れない理由が決まっているかを確かめる）
 */
export const BACKUP_KEYS = [
  'tasks',
  'lists',
  'habits',
  'sections',
  'timeLogTagPresets',
  'logCategoryColors',
  'logLabelIds',
  'logLabelTargets',
  'dayMoods',
  'timetable',
  'addons',
  'eventTemplates',
  'courseLinks',
  'extraTimeZones',
  // 端末ごとの設定（同期しない。書き出しの `prefs`。取り込みでは今の端末の値のまま）
  'theme',
  'weekStartsOn',
  'dailyCapacityMinutes',
  'sleepPrefs',
  'defaultBlockMinutes',
  'eventReminderMinutes',
  'appTimeZone',
] as const satisfies readonly (keyof TaskState)[]

/** 保存する値（`DATA_KEYS`）のうち、書き出しに入れないものと理由 */
export const BACKUP_EXCLUDED = {
  dataOwner: 'どのアカウントのデータか。取り込んだ先の端末・アカウントで決まる',
  logLabelsUpdatedAt: '同期の版。取り込んだら今の時刻になる',
  logLabelPendingAdds: '同期に送り残したラベルの印。取り込みは別に覚える',
  extraTimeZonesUpdatedAt: '同期の版',
  eventTemplatesUpdatedAt: '同期の版',
  courseLinksUpdatedAt: '同期の版',
  timetableUpdatedAt: '同期の版',
  addonsUpdatedAt: '同期の版',
  activeTimer: '動いているタイマー。いまこの端末で計っているもの（止めると記録としてタスクに入る）',
  activeTimerUpdatedAt: '同期の版',
  sleepTimer: '寝ている間だけある睡眠のタイマー。起きたら睡眠の記録としてタスクに入る',
  sleepTimerUpdatedAt: '同期の版',
  googleEventColors: 'Google の予定の id に付けた色。Google の予定そのものは書き出さない（同期で戻る）',
  skippedEvents: 'やらなかった予定は Google の予定の控え。Google の予定そのものは書き出さない（同期で戻る）',
  skippedEventsUpdatedAt: '同期の版',
  myEventTimes: 'Google の予定の id に付けた自分の時間。Google の予定そのものは書き出さない（同期で戻る）',
  myEventTimesUpdatedAt: '同期の版',
  notificationsEnabled: '通知は端末ごとに許可してから決める',
  recordPrompts: '通知は端末ごとに許可してから決める',
  dailyReminders: '通知は端末ごとに許可してから決める',
  reminderPromptDismissed: '端末で閉じた案内',
  googleConnectLineDismissed: '端末で閉じた案内',
  onboardingDone: '端末で閉じた案内（取り込んだデータがあれば出さない）',
  onboardingCompleted: '端末で閉じた案内',
  onboardingFinishedOn: '端末で閉じた案内（終えた日）',
  installNudgeDismissed: '端末で閉じた案内',
  signInNudgeDismissed: '端末で閉じた案内',
} as const satisfies Partial<Record<keyof TaskState, string>>

/**
 * タスク・リスト・習慣のほかに控えるデータがあるか（気分・欠席・支払い・よく入れる予定 …）。
 * これだけを使っている人も、ログアウトの前・毎日の控えを取る
 */
export function hasSettingsData(
  s: Pick<TaskState, 'dayMoods' | 'timetableUpdatedAt' | 'addonsUpdatedAt' | 'eventTemplates' | 'courseLinks' | 'extraTimeZones'>,
): boolean {
  return (
    Object.keys(s.dayMoods).length > 0 ||
    s.timetableUpdatedAt !== null ||
    s.addonsUpdatedAt !== null ||
    s.eventTemplates.length > 0 ||
    s.courseLinks.length > 0 ||
    s.extraTimeZones.length > 0
  )
}

/** その時点の状態の控え（エクスポートと同じ形の JSON）。状態はあとで変わっても、渡したときのもの */
export function backupJsonOf(s: TaskState): string {
  return JSON.stringify(
    buildBackupPayload({
      tasks: s.tasks,
      lists: s.lists,
      habits: s.habits,
      sections: s.sections,
      timeLogTagPresets: s.timeLogTagPresets,
      logCategoryColors: s.logCategoryColors,
      logLabelIds: s.logLabelIds,
      logLabelTargets: s.logLabelTargets,
      dayMoods: s.dayMoods,
      timetable: s.timetable,
      addons: s.addons,
      eventTemplates: s.eventTemplates,
      courseLinks: s.courseLinks,
      extraTimeZones: s.extraTimeZones,
      prefs: {
        theme: s.theme,
        weekStartsOn: s.weekStartsOn,
        dailyCapacityMinutes: s.dailyCapacityMinutes,
        sleepPrefs: s.sleepPrefs,
        defaultBlockMinutes: s.defaultBlockMinutes,
        eventReminderMinutes: s.eventReminderMinutes,
        appTimeZone: s.appTimeZone,
      },
    }),
  )
}

/**
 * 取り込んだファイルのラベル表のほかの値（版 4 から）。ファイルにあるものだけ置き換え、無いもの（前の版のファイル）は今の値のまま。
 * 気分は日ごとに置き換え（ファイルに無い日は今のまま。サーバーの行は消さないので、消しても次の同期で戻る）。
 * 置き換えた日は今の時刻にして送る（もとにした版は今の手元のもの）。
 * 端末の設定（`prefs`）は取り込まない（取り込みはデータの置き換え。テーマ・週の開始日・タイムゾーンはこの端末のまま。
 * タイムゾーンを変えると時刻のある予定・記録を読み替えることになる）
 */
function importedExtras(parsed: BackupImportResult, s: TaskState, nowIso: string): Partial<TaskState> {
  const out: Partial<TaskState> = {}
  if (parsed.dayMoods) {
    const days = Object.entries(parsed.dayMoods).map(([day, m]) => [
      day,
      { ...m, updatedAt: nowIso, syncedAt: s.dayMoods[day]?.syncedAt ?? null },
    ])
    out.dayMoods = { ...s.dayMoods, ...Object.fromEntries(days) }
  }
  if (parsed.timetable) out.timetable = parsed.timetable
  if (parsed.addons) out.addons = parsed.addons
  if (parsed.eventTemplates) out.eventTemplates = parsed.eventTemplates
  if (parsed.courseLinks) out.courseLinks = parsed.courseLinks
  if (parsed.extraTimeZones) out.extraTimeZones = parsed.extraTimeZones
  return out
}

export function createDataSlice({ set, get, undo }: SliceContext): DataActions {
  const { pushUndo } = undo
  return {
    setSyncState: (state, lastSyncedAt) => set(lastSyncedAt ? { syncState: state, lastSyncedAt } : { syncState: state }),
    setCloudPulledAt: (at) => set({ cloudPulledAt: at }),

    setSyncRejected: (rows) => set({ syncRejected: rows }),

    setDataOwner: (userId) => set({ dataOwner: userId }),

    resetLocalData: () => {
      // 取り消しの履歴や取り込み前の控えにも前の人のデータが残っている
      undo.clear()
      clearImportRollback()
      // ラベル表・他のタイムゾーン・よく入れる予定・授業と科目のつながり・時間割・1 日の気分・Google の予定の色・動いているタイマーもその人のもの（科目名・会社名が次の人に見え、次の人のアカウントに送られていた）。
      // 時刻は null（次の人とは「まだ合わせていない」から始める）。初期の値に戻すのは利用者の編集ではないので時刻を付けない
      asIncomingChange(() =>
        set({
          timeLogTagPresets: defaultLogCategories(),
          logCategoryColors: assignColorsInOrder(defaultLogCategories()),
          logLabelTargets: {},
          logLabelIds: {},
          logLabelsUpdatedAt: null,
          logLabelPendingAdds: [],
          extraTimeZones: [],
          extraTimeZonesUpdatedAt: null,
          eventTemplates: [],
          eventTemplatesUpdatedAt: null,
          courseLinks: [],
          courseLinksUpdatedAt: null,
          skippedEvents: [],
          skippedEventsUpdatedAt: null,
          myEventTimes: [],
          myEventTimesUpdatedAt: null,
          timetable: DEFAULT_TIMETABLE,
          timetableUpdatedAt: null,
          addons: DEFAULT_ADDONS,
          addonsUpdatedAt: null,
          dayMoods: {},
          googleEventColors: {},
          activeTimer: null,
          activeTimerUpdatedAt: null,
          sleepTimer: null,
          sleepTimerUpdatedAt: null,
        }),
      )
      set({
        tasks: [],
        lists: initialLists(),
        sections: [],
        habits: [],
        recentDeletes: [],
        selectedListId: INBOX_ID,
        quickAddSectionId: null,
        completePromptTaskId: null,
        labelPromptLogId: null,
        undoBanner: null,
        moveBannerText: null,
        syncState: 'idle',
        lastSyncedAt: null,
        cloudPulledAt: null,
        dataOwner: null,
      })
    },

    backupJson: () => backupJsonOf(get()),

    restoreMissingFromBackup: (json) => {
      const parsed = parseBackupJson(json)
      if (!parsed) return null
      const s = get()
      const { next, addedTasks } = restoreMissing(
        { lists: s.lists, sections: s.sections, tasks: s.tasks, habits: s.habits },
        parsed,
        new Date().toISOString(),
      )
      // 気分・欠席・支払い・よく入れる予定なども、控えにあって今は無いものを足す
      const settings = restoreMissingSettings(s, parsed)
      const rowsAdded = addedTasks > 0 || next.lists.length !== s.lists.length || next.habits.length !== s.habits.length
      if (!rowsAdded && Object.keys(settings).length === 0) return 0
      pushUndo({ key: 'undo.restoredFromBackup', params: { count: addedTasks } })
      set({ ...(rowsAdded ? next : {}), ...settings })
      return addedTasks
    },

    exportData: () => {
      const data = JSON.stringify(JSON.parse(get().backupJson()), null, 2)
      downloadTextFile(data, `chronograma-backup-${appTodayKey()}.json`, 'application/json')
    },

    importData: (json) => {
      const read = parseBackupJson(json)
      if (!read) return false
      const parsed = withFreshStamps(read)
      // ⌘Z はメモリ上だけなので、再読み込みをまたげる控えも別に残す
      const before = get()
      saveImportRollback({
        // 書き出しと同じ中身（気分・時間割・追加機能・端末の設定も戻せるように）
        json: backupJsonOf(before),
        savedAt: new Date().toISOString(),
        taskCount: before.tasks.length,
        owner: before.dataOwner,
      })
      // 取り込みは全置換なので、戻せることを画面に出す
      pushUndo({ key: 'undo.imported', params: { count: parsed.tasks.length } })
      set({
        ...importedLabels(parsed),
        ...importedExtras(parsed, before, new Date().toISOString()),
        lists: parsed.lists,
        habits: parsed.habits,
        sections: parsed.sections,
        quickAddSectionId: null,
        // バックアップを持っている人には、はじめの案内を出さない
        onboardingDone: before.onboardingDone || hasExistingData(parsed),
      })
      return true
    },

    restoreBeforeImport: () => {
      const saved = loadImportRollback()
      if (!saved) return false
      const read = parseBackupJson(saved.json)
      if (!read) {
        clearImportRollback()
        return false
      }
      const parsed = withFreshStamps(read)
      pushUndo()
      set({
        ...importedLabels(parsed),
        ...importedExtras(parsed, get(), new Date().toISOString()),
        lists: parsed.lists,
        habits: parsed.habits,
        sections: parsed.sections,
        quickAddSectionId: null,
      })
      clearImportRollback()
      return true
    },
    importTasksFromCsv: async (csv, options = {}) => {
      // 取り込むときだけ読む（起動時に読まない）
      const { csvListTarget, parseTasksCsv } = await import('../../lib/importTasksCsv')
      const { rows, skipped, errors } = parseTasksCsv(csv, { fileName: options.fileName })
      if (errors.length > 0 || rows.length === 0) {
        return { imported: 0, skipped, errors }
      }
      const s = get()
      // リスト名は、同じ名前のリスト → 同じ名前のラベル（色）→ 選んだときだけラベルを作る → To-Do（ラベルなし）
      let labels: LabelTable = { timeLogTagPresets: s.timeLogTagPresets, logCategoryColors: s.logCategoryColors }
      const placeOf = (name: string | null): { listId: string; color: string | null } => {
        const target = csvListTarget(name, s.lists, labels.timeLogTagPresets)
        if (target.kind === 'list') return { listId: target.id, color: null }
        if (target.kind === 'label' || (target.kind === 'unknown' && options.unknownLists === 'label')) {
          const r = ensureLabel(labels, target.name)
          labels = r.table
          return { listId: INBOX_ID, color: r.hex }
        }
        return { listId: INBOX_ID, color: null }
      }
      let baseOrder = Math.max(0, ...s.tasks.map((t) => t.order))
      const now = new Date().toISOString()
      const newTasks: Task[] = rows.map((row) => {
        baseOrder += 1
        const place = placeOf(row.listName)
        return {
          ...TASK_DEFAULTS,
          id: newId(),
          title: row.title,
          description: row.description,
          completed: row.completed,
          completedAt: row.completed ? (row.completedAt ?? now) : null,
          createdAt: now,
          updatedAt: now,
          order: baseOrder,
          listId: place.listId,
          sectionId: null,
          parentId: null,
          dueDate: row.dueDate,
          dueTime: row.dueDate ? row.dueTime : null,
          scheduledDate: null,
          endDate: null,
          startTime: null,
          endTime: null,
          location: null,
          color: place.color,
          priority: row.priority,
          tags: row.tags,
          recurrence: null,
          kind: 'todo',
          archivedAt: null,
          deletedAt: null,
        }
      })
      // 結果は「元に戻す」付きの通知で知らせる（JSON の取り込みと同じ）
      pushUndo({ key: 'alert.csvImported', params: { count: newTasks.length, skipped } })
      set((st) => ({
        tasks: [...st.tasks, ...newTasks],
        ...(labels.timeLogTagPresets === s.timeLogTagPresets ? {} : labels),
      }))
      return { imported: newTasks.length, skipped, errors: [] }
    },
  }
}
