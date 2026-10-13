import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { parseTasksCsv } from './importTasksCsv'
import {
  buildRecordsCsv,
  buildRecordsIcs,
  collectExportRows,
  csvCell,
  exportInterval,
  exportPeriodRange,
  foldIcsLine,
  icsText,
  type CsvTexts,
  type ExportRow,
} from './recordExport'

const TOKYO = 'Asia/Tokyo'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    timeZoneAnchor: TOKYO,
    ...over,
  }) as Task

const log = (id: string, date: string, start: string, end: string, over: Partial<Task> = {}) =>
  task(id, { kind: 'log', dueDate: date, startTime: start, endTime: end, ...over })

const ALL = { from: null, to: null }
const collect = (tasks: Task[], over: Partial<Parameters<typeof collectExportRows>[2]> = {}) =>
  collectExportRows(tasks, [], { range: ALL, includePlans: false, excludedListIds: new Set(), zone: TOKYO, ...over })

const TEXTS: CsvTexts = {
  headers: ['種類', '日付', '開始', '終了', '終了日', '分', 'ラベル', 'タイトル', 'タグ', '元の予定'],
  kind: (k) => ({ log: '記録', sleep: '睡眠', event: '予定', todo: 'To-Do' })[k],
  match: (m) => ({ matched: '予定どおり', 'time-drift': '時間がずれた', 'actual-only': '予定になし' })[m],
}
const labelOf = (t: Task) => t.category ?? ''

const csvOf = (rows: ExportRow[]) => buildRecordsCsv({ rows, texts: TEXTS, labelOf })
const icsOf = (rows: ExportRow[]) =>
  buildRecordsIcs({ rows, labelOf, untitled: '記録', calendarName: 'Chronograma の記録', now: Date.UTC(2026, 9, 8, 1, 2, 3) })

/** 折り返しを戻した行 */
const unfold = (ics: string) => ics.replace(/\r\n /g, '').split('\r\n')

describe('exportPeriodRange', () => {
  it('今週は月曜から日曜、今月・先月は暦の月、すべては制限なし', () => {
    // 2026-10-08 は木曜
    expect(exportPeriodRange('week', '2026-10-08')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(exportPeriodRange('month', '2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(exportPeriodRange('lastMonth', '2026-10-08')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(exportPeriodRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(exportPeriodRange('all', '2026-10-08')).toEqual({ from: null, to: null })
  })
})

describe('exportInterval / collectExportRows の時刻', () => {
  it('日をまたぐ記録（終了が開始以前・終了日なし）は翌日まで。終了日の列が付く', () => {
    const t = log('a', '2026-10-07', '23:00', '01:30')
    expect(exportInterval(t, TOKYO)).toEqual({ startMs: Date.UTC(2026, 9, 7, 14, 0), endMs: Date.UTC(2026, 9, 7, 16, 30) })
    const [row] = collect([t])
    expect(row).toMatchObject({ date: '2026-10-07', startTime: '23:00', endTime: '01:30', endDate: '2026-10-08', minutes: 150 })
  })

  it('終了日のある複数日の記録', () => {
    const [row] = collect([log('a', '2026-10-07', '22:00', '08:00', { endDate: '2026-10-09' })])
    expect(row).toMatchObject({ endDate: '2026-10-09', minutes: 34 * 60 })
  })

  it('書いたタイムゾーン（timeZoneAnchor）から瞬間を出し、列はアプリのタイムゾーンで書く', () => {
    const t = log('a', '2026-10-07', '20:00', '21:00', { timeZoneAnchor: 'America/New_York' })
    const [row] = collect([t])
    // NY 20:00 (EDT, UTC-4) = 00:00Z 翌日 = 東京 09:00
    expect(row.startMs).toBe(Date.UTC(2026, 9, 8, 0, 0))
    expect(row).toMatchObject({ date: '2026-10-08', startTime: '09:00', endTime: '10:00', endDate: null, minutes: 60 })
  })

  it('夏時間の終わりをまたぐ記録は実際の長さ（壁時計の差ではない）', () => {
    const NY = 'America/New_York'
    const t = log('a', '2026-11-01', '00:30', '03:00', { timeZoneAnchor: NY })
    const [row] = collectExportRows([t], [], { range: ALL, includePlans: false, excludedListIds: new Set(), zone: NY })
    // 00:30 EDT = 04:30Z、03:00 EST = 08:00Z
    expect(row.minutes).toBe(210)
  })

  it('予定は 0:00 終わりだけ翌日。終了が開始より前の予定は入れない', () => {
    const ok = task('e1', { kind: 'event', scheduledDate: '2026-10-07', startTime: '22:00', endTime: '00:00' })
    const bad = task('e2', { kind: 'event', scheduledDate: '2026-10-07', startTime: '22:00', endTime: '21:00' })
    const rows = collect([ok, bad], { includePlans: true })
    expect(rows.map((r) => [r.task.id, r.minutes, r.endDate])).toEqual([['e1', 120, '2026-10-08']])
  })
})

describe('collectExportRows の対象', () => {
  const base = [
    log('log', '2026-10-07', '09:00', '10:00'),
    task('sleep', { kind: 'sleep', dueDate: '2026-10-06', startTime: '23:30', endTime: '07:00', endDate: '2026-10-07' }),
    log('deleted', '2026-10-07', '11:00', '12:00', { deletedAt: '2026-10-07T00:00:00Z' }),
    log('archived', '2026-10-07', '11:00', '12:00', { archivedAt: '2026-10-07T00:00:00Z' }),
    log('child', '2026-10-07', '11:00', '12:00', { parentId: 'log' }),
    log('untimed', '2026-10-07', '11:00', '', { endTime: null }),
    task('event', { kind: 'event', scheduledDate: '2026-10-07', startTime: '17:00', endTime: '22:00', title: 'バイト' }),
    task('done', { scheduledDate: '2026-10-07', startTime: '13:00', endTime: '14:00', completed: true }),
    task('open', { scheduledDate: '2026-10-07', startTime: '15:00', endTime: '16:00' }),
    task('someday', { kind: 'event', scheduledDate: '2026-10-07', startTime: '08:00', endTime: '09:00', listId: 'someday' }),
    log('old', '2026-09-30', '09:00', '10:00'),
  ]

  it('記録と睡眠だけ（削除・アーカイブ・サブタスク・時刻の無いものは入れない）を古い順に', () => {
    expect(collect(base).map((r) => [r.task.id, r.kind])).toEqual([
      ['old', 'log'],
      ['sleep', 'sleep'],
      ['log', 'log'],
    ])
  })

  it('選べば予定と ✓ で終えた時刻つきの To-Do も入れる（いつか・チェックリストのリストは入れない）', () => {
    const rows = collect(base, { includePlans: true, excludedListIds: new Set(['someday']) })
    expect(rows.map((r) => [r.task.id, r.kind])).toEqual([
      ['old', 'log'],
      ['sleep', 'sleep'],
      ['log', 'log'],
      ['done', 'todo'],
      ['event', 'event'],
    ])
  })

  it('期間は開始日で切る（日をまたぐ睡眠は寝た日）', () => {
    const rows = collect(base, { range: { from: '2026-10-07', to: '2026-10-31' } })
    expect(rows.map((r) => r.task.id)).toEqual(['log'])
  })

  it('記録には予定と突き合わせた結果を付ける（▶ の元・時間のずれ・予定に無い記録）', () => {
    const tasks = [
      task('plan1', { scheduledDate: '2026-10-07', startTime: '09:00', endTime: '10:00', title: 'レポート' }),
      task('plan2', { scheduledDate: '2026-10-07', startTime: '13:00', endTime: '14:00', title: 'ゼミの準備' }),
      log('a', '2026-10-07', '09:05', '10:05', { title: '別の題名', sourceTaskId: 'plan1' }),
      log('b', '2026-10-07', '13:40', '14:40', { title: 'ゼミの準備' }),
      log('c', '2026-10-07', '20:00', '21:00', { title: '読書' }),
    ]
    const match = Object.fromEntries(collect(tasks).map((r) => [r.task.id, r.match]))
    expect(match).toEqual({ a: 'matched', b: 'time-drift', c: 'actual-only' })
  })
})

describe('buildRecordsCsv', () => {
  it("BOM・CRLF・見出し。カンマ・引用符・改行を含む値は引用符で囲み、式に見える値は先頭に ' を付ける", () => {
    const rows = collect([
      log('a', '2026-10-07', '23:00', '01:30', { title: 'レポート, 第2章 "下書き"', category: 'ゼミ', tags: ['ゼミ'] }),
      task('s', { kind: 'sleep', dueDate: '2026-10-08', startTime: '02:00', endTime: '08:00', title: '=SUM(A1)' }),
    ])
    const csv = csvOf(rows)
    expect(csv.startsWith('\uFEFF種類,日付,開始,終了,終了日,分,ラベル,タイトル,タグ,元の予定\r\n')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/\n/)
    const lines = csv.slice(1).split('\r\n')
    // 記録の tags はラベルの写しなので、タグの列には出さない
    expect(lines[1]).toBe('記録,2026-10-07,23:00,01:30,2026-10-08,150,ゼミ,"レポート, 第2章 ""下書き""",,予定になし')
    expect(lines[2]).toBe("睡眠,2026-10-08,02:00,08:00,,360,,'=SUM(A1),,")
  })

  it('改行を含む題名は 1 つの値のまま', () => {
    expect(csvCell('1行目\n2行目')).toBe('"1行目\n2行目"')
    expect(csvCell(' 前の空白')).toBe('" 前の空白"')
    expect(csvCell('ふつう')).toBe('ふつう')
  })

  it('CSV の取り込みで読み直せる（タイトル・日付・タグ）', () => {
    const rows = collect(
      [
        task('done', {
          scheduledDate: '2026-10-07',
          startTime: '13:00',
          endTime: '14:00',
          completed: true,
          title: '課題',
          tags: ['英語', '提出'],
        }),
      ],
      { includePlans: true },
    )
    const parsed = parseTasksCsv(csvOf(rows))
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toMatchObject([{ title: '課題', dueDate: '2026-10-07', tags: ['英語', '提出'] }])
  })
})

describe('buildRecordsIcs', () => {
  const rows = () =>
    collect([
      log('a', '2026-10-07', '23:00', '01:30', { title: '実験; 結果, まとめ\\メモ', category: 'ゼミ, 研究', description: '1行目\n2行目' }),
      log('b', '2026-10-08', '09:00', '10:00', { title: '', category: null }),
      task('s', { kind: 'sleep', dueDate: '2026-10-08', startTime: '01:00', endTime: '07:00' }),
      log('long', '2026-10-08', '12:00', '13:00', { title: 'とても長い題名の記録'.repeat(8) + '🎓' }),
    ])

  it('CRLF で、どの行も 75 オクテット以内（続きの行は空白で始まる）', () => {
    const ics = icsOf(rows())
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    const unfolded = unfold(ics)
    expect(unfolded).toContain(`SUMMARY:${'とても長い題名の記録'.repeat(8)}🎓`)
  })

  it('記録だけを VEVENT に。UTC の時刻・DTSTAMP・記録の id からの UID', () => {
    const lines = unfold(icsOf(rows()))
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3)
    const uids = lines.filter((l) => l.startsWith('UID:'))
    expect(uids).toEqual(['UID:record-a@chronograma', 'UID:record-b@chronograma', 'UID:record-long@chronograma'])
    expect(new Set(uids).size).toBe(uids.length)
    expect(lines.filter((l) => l === 'DTSTAMP:20261008T010203Z')).toHaveLength(3)
    // 東京 23:00〜翌 1:30 = 14:00Z〜16:30Z
    expect(lines).toContain('DTSTART:20261007T140000Z')
    expect(lines).toContain('DTEND:20261007T163000Z')
    expect(lines.at(-2)).toBe('END:VCALENDAR')
  })

  it('TEXT の \\ ; , 改行を逃がす。ラベルは CATEGORIES、題名が無ければラベルか「記録」', () => {
    const lines = unfold(icsOf(rows()))
    expect(lines).toContain('SUMMARY:実験\\; 結果\\, まとめ\\\\メモ')
    expect(lines).toContain('CATEGORIES:ゼミ\\, 研究')
    expect(lines).toContain('DESCRIPTION:1行目\\n2行目')
    expect(lines).toContain('SUMMARY:記録')
    expect(icsText('a\r\nb')).toBe('a\\nb')
  })

  it('折り返しは文字の途中で切らない', () => {
    const line = `SUMMARY:${'🎓'.repeat(40)}`
    const folded = foldIcsLine(line)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
    expect(folded).not.toContain('�')
    expect(foldIcsLine('SHORT:abc')).toBe('SHORT:abc')
  })
})
