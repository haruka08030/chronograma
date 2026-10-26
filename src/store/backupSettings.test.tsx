import { beforeEach, describe, expect, it } from 'vitest'
import { useTaskStore } from './taskStore'
import { BACKUP_KEYS } from './slices/data'
import { BACKUP_SCHEMA_VERSION, buildBackupPayload } from '../lib/backupFormat'
import { DEFAULT_TIMETABLE, normalizeTimetable, type Timetable } from '../lib/timetable'
import { courseKey } from '../lib/courseLinks'
import { DEFAULT_ADDONS, withAddonOn } from '../lib/addons'
import { clearImportRollback } from '../lib/importRollback'

const st = () => useTaskStore.getState()

const term = normalizeTimetable({ ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2027-01-31' })
const rent = { id: 'rent', title: '家賃', date: '2026-10-27', repeat: 'monthly' as const, notifyDays: 1 }
const gym = { id: 'gym', title: 'ジム', date: '2026-10-05', repeat: 'monthly' as const, notifyDays: 0 }

/** 気分・欠席・支払い・よく入れる予定・つながり・他のタイムゾーンを使っている手元 */
function seedSettings() {
  st().setDayMood('2026-10-20', { mood: 4, note: '発表できた' })
  useTaskStore.setState({
    timetable: withAbsence(term, '英語', '2026-10-05', true),
    addons: { ...withAddonOn(DEFAULT_ADDONS, 'dues', true), dues: [rent], absenceCourses: ['英語'], googleSkip: ['バイト'] },
    eventTemplates: [{ id: 'early', title: '早番', startTime: '09:00', endTime: '15:00', color: null }],
    courseLinks: [{ title: '英語', course: 'English I' }],
    extraTimeZones: [{ tz: 'Europe/London', label: 'ロンドン' }],
  })
}

const settingsOf = () => {
  const s = st()
  return {
    moods: Object.fromEntries(Object.entries(s.dayMoods).map(([d, m]) => [d, { mood: m.mood, note: m.note }])),
    timetable: s.timetable,
    addons: s.addons,
    eventTemplates: s.eventTemplates,
    courseLinks: s.courseLinks,
    extraTimeZones: s.extraTimeZones,
  }
}

beforeEach(() => {
  st().resetLocalData()
  clearImportRollback()
  useTaskStore.setState({ theme: 'system', weekStartsOn: 1 })
})

/** 前の版の時間割の欠席の印（学期の中の日だけ） */
function withAbsence(tt: Timetable, name: string, date: string, absent: boolean): Timetable {
  const key = courseKey(name)
  const cur = tt.absences[key] ?? []
  const next = absent ? [...new Set([...cur, date])] : cur.filter((d) => d !== date)
  const absences = { ...tt.absences }
  if (next.length > 0) absences[key] = next
  else delete absences[key]
  return normalizeTimetable({ ...tt, absences })
}

describe('書き出し・取り込み・自動バックアップの気分・時間割・追加機能（版 4）', () => {
  it('書き出しに保存する値が入り、取り込むと戻る（気分・欠席・支払い・よく入れる予定・つながり・他のタイムゾーン）', () => {
    seedSettings()
    useTaskStore.setState({ theme: 'dark', weekStartsOn: 0, dailyCapacityMinutes: 300 })
    const before = settingsOf()
    const json = st().backupJson()
    const file = JSON.parse(json) as Record<string, unknown>
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    // 書き出しに入れる値はどれもファイルにある（端末の設定は prefs の中）
    const prefs = file.prefs as Record<string, unknown>
    const where: Record<string, string> = { sections: 'listSections' }
    for (const k of BACKUP_KEYS) expect(k in file || k in prefs || where[k]! in file, k).toBe(true)
    expect(prefs).toMatchObject({ theme: 'dark', weekStartsOn: 0, dailyCapacityMinutes: 300 })

    st().resetLocalData()
    useTaskStore.setState({ theme: 'light', weekStartsOn: 6 })
    expect(st().importData(json)).toBe(true)
    expect(settingsOf()).toEqual(before)
    // 取り込んだ値は手元の編集として送る（同期の版が付く）
    expect(st().timetableUpdatedAt).not.toBeNull()
    expect(st().addonsUpdatedAt).not.toBeNull()
    expect(st().dayMoods['2026-10-20']!.syncedAt).toBeNull()
    // 端末の設定は取り込まない（この端末の値のまま）
    expect(st().theme).toBe('light')
    expect(st().weekStartsOn).toBe(6)
  })

  it('前の版のファイル（気分・時間割などが無い）も取り込め、無い値は今のまま', () => {
    seedSettings()
    const before = settingsOf()
    const old = buildBackupPayload({
      tasks: [],
      lists: st().lists,
      habits: [],
      sections: [],
      timeLogTagPresets: ['勉強'],
      logCategoryColors: {},
    })
    const v3 = JSON.stringify({ ...old, schemaVersion: 3 })
    expect(st().importData(v3)).toBe(true)
    expect(settingsOf()).toEqual(before)
  })

  it('取り込み前に戻すと、気分・時間割・追加機能も取り込む前に戻る', () => {
    seedSettings()
    const before = settingsOf()
    const other = JSON.parse(st().backupJson()) as Record<string, unknown>
    const file = JSON.stringify({
      ...other,
      timetable: withAbsence(term, '数学', '2026-10-06', true),
      addons: { ...DEFAULT_ADDONS, dues: [gym] },
      eventTemplates: [],
    })
    expect(st().importData(file)).toBe(true)
    expect(Object.keys(st().timetable.absences)).toEqual(['数学'])
    expect(st().addons.dues.map((d) => d.id)).toEqual(['gym'])
    expect(st().restoreBeforeImport()).toBe(true)
    expect(settingsOf()).toEqual(before)
  })

  it('自動バックアップから戻すと、控えにあって今は無い気分・欠席・支払いを足す（今あるものは触らない）', () => {
    seedSettings()
    const backup = st().backupJson()
    st().resetLocalData()
    // ログアウトして消えた後、別の内容を使い始めていた
    st().setDayMood('2026-10-21', { mood: 2, note: '' })
    useTaskStore.setState({
      timetable: withAbsence(term, '数学', '2026-10-06', true),
      addons: { ...DEFAULT_ADDONS, dues: [gym, { ...rent, notifyDays: 5 }] },
    })
    st().restoreMissingFromBackup(backup)
    expect(Object.keys(st().dayMoods).sort()).toEqual(['2026-10-20', '2026-10-21'])
    expect(st().timetable.absences).toEqual({ 数学: ['2026-10-06'], 英語: ['2026-10-05'] })
    // 同じ支払いで中身が違えば今のまま、無いものは足す
    expect(st().addons.dues).toEqual([gym, { ...rent, notifyDays: 5 }])
    expect(st().addons.absenceCourses).toEqual(['英語'])
    expect(st().eventTemplates.map((t) => t.id)).toEqual(['early'])
    expect(st().courseLinks).toEqual([{ title: '英語', course: 'English I' }])
    expect(st().extraTimeZones.map((z) => z.tz)).toEqual(['Europe/London'])
  })

  it('タスク・習慣が無く気分だけを使っている人の控えも取る', async () => {
    const { hasSettingsData } = await import('./slices/data')
    expect(hasSettingsData(st())).toBe(false)
    st().setDayMood('2026-10-20', { mood: 3, note: '' })
    expect(hasSettingsData(st())).toBe(true)
  })
})
