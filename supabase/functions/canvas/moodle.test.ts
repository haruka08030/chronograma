import { describe, expect, it } from 'vitest'
import { parseMoodleFeed } from './moodle.ts'

const ROOT = 'https://moodle.example.ac.jp'

// Moodle 4.x の書き出し（Bennu の iCalendar。CRLF・75 文字での折り返し・エスケープ）に近い形
const FEED = [
  'BEGIN:VCALENDAR',
  'METHOD:PUBLISH',
  'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024042200//EN',
  'VERSION:2.0',
  // 課題の提出期限（長さ 0、UTC）
  'BEGIN:VEVENT',
  'UID:1201@moodle.example.ac.jp',
  'SUMMARY:レポート1\\, 第3章の要約 の提出期限',
  'DESCRIPTION:第3章を読んで 800 字で要約してください。\\n形式は PDF。',
  'CLASS:PUBLIC',
  'LAST-MODIFIED:20260920T010203Z',
  'DTSTAMP:20261007T000000Z',
  'DTSTART:20261010T145900Z',
  'DTEND:20261010T145900Z',
  'CATEGORIES:情報科学概論',
  'END:VEVENT',
  // 小テストの開始（締切ではない）と終了
  'BEGIN:VEVENT',
  'UID:1202@moodle.example.ac.jp',
  'SUMMARY:第2回 小テスト 開始',
  'DTSTART:20261012T000000Z',
  'DTEND:20261012T000000Z',
  'CATEGORIES:ECON-101',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:1203@moodle.example.ac.jp',
  'SUMMARY:Quiz 2 closes',
  'DTSTART:20261013T145900Z',
  'DTEND:20261013T145900Z',
  'CATEGORIES:ECON-101',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:1204@moodle.example.ac.jp',
  'SUMMARY:Quiz 3 opens',
  'DTSTART:20261014T000000Z',
  'DTEND:20261014T000000Z',
  'CATEGORIES:ECON-101',
  'END:VEVENT',
  // 授業（長さのある科目の予定）は締切ではない
  'BEGIN:VEVENT',
  'UID:1205@moodle.example.ac.jp',
  'SUMMARY:対面授業 第4回',
  'DTSTART:20261009T013000Z',
  'DTEND:20261009T030000Z',
  'CATEGORIES:情報科学概論',
  'END:VEVENT',
  // 自分の予定（科目が無い）は読まない
  'BEGIN:VEVENT',
  'UID:1206@moodle.example.ac.jp',
  'SUMMARY:バイト',
  'DTSTART:20261011T080000Z',
  'DTEND:20261011T080000Z',
  'END:VEVENT',
  // TZID 付き（ほかの書き出し・手を入れたサイト）と、浮動の日時
  'BEGIN:VEVENT',
  'UID:1207@moodle.example.ac.jp',
  'SUMMARY:Essay draft is due',
  'DTSTART;TZID=Asia/Tokyo:20261015T235900',
  'DTEND;TZID=Asia/Tokyo:20261015T235900',
  'CATEGORIES:ENG-201',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:1208@moodle.example.ac.jp',
  'SUMMARY:Lab sheet',
  'DTSTART:20261016T120000',
  'CATEGORIES:PHYS-110',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:1209@moodle.example.ac.jp',
  'SUMMARY:Final report',
  'DTSTART;TZID=UTC:20261020T150000',
  'DTEND;TZID=UTC:20261020T150000',
  'CATEGORIES:PHYS-110',
  'END:VEVENT',
  // 古い Moodle: 長さ 0 の予定を終日で書く
  'BEGIN:VEVENT',
  'UID:1210@moodle.example.ac.jp',
  'SUMMARY:Reading log',
  'DTSTART;VALUE=DATE:20261018',
  'DTEND;VALUE=DATE:20261019',
  'CATEGORIES:LIT-80',
  'END:VEVENT',
  // 期間より前の締切
  'BEGIN:VEVENT',
  'UID:1100@moodle.example.ac.jp',
  'SUMMARY:Old homework',
  'DTSTART:20260901T145900Z',
  'DTEND:20260901T145900Z',
  'CATEGORIES:LIT-80',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseMoodleFeed', () => {
  const items = parseMoodleFeed(FEED, ROOT, '2026-10-06', '2027-02-03')
  const byId = new Map(items.map((i) => [i.id, i]))

  it('科目の締切（長さ 0）だけ、期間の中のものを読む', () => {
    expect(items.map((i) => i.id)).toEqual(['1201', '1203', '1207', '1208', '1209', '1210'])
  })

  it('件名・科目（CATEGORIES）・UTC の締切・その日のカレンダーへのリンク', () => {
    expect(byId.get('1201')).toEqual({
      type: 'assignment',
      id: '1201',
      title: 'レポート1, 第3章の要約 の提出期限',
      courseId: null,
      courseName: '情報科学概論',
      url: `${ROOT}/calendar/view.php?view=day&time=${Date.UTC(2026, 9, 10, 14, 59) / 1000}`,
      dueAt: '2026-10-10T14:59:00Z',
      done: false,
    })
  })

  it('TZID 付き・浮動の日時は壁時計のまま、TZID=UTC は UTC の瞬間', () => {
    expect(byId.get('1207')).toMatchObject({ dueAt: null, dueWall: { date: '2026-10-15', time: '23:59', timeZone: 'Asia/Tokyo' } })
    expect(byId.get('1208')).toMatchObject({ dueAt: null, dueWall: { date: '2026-10-16', time: '12:00', timeZone: null } })
    expect(byId.get('1209')).toMatchObject({ dueAt: '2026-10-20T15:00:00Z' })
    expect(byId.get('1207')?.url).toBe(`${ROOT}/calendar/view.php?view=upcoming`)
  })

  it('終日の締切は日付のまま', () => {
    expect(byId.get('1210')).toMatchObject({ dueAt: null, dueDate: '2026-10-18', courseName: 'LIT-80' })
  })

  it('サブパスの Moodle はリンクもサブパスから', () => {
    const [first] = parseMoodleFeed(FEED, 'https://lms.example.ac.jp/moodle', '2026-10-06', '2027-02-03')
    expect(first?.url.startsWith('https://lms.example.ac.jp/moodle/calendar/view.php?')).toBe(true)
  })
})
