import { describe, expect, it } from 'vitest'
import { feedUrlProblem, parseFeedUrl } from './feedUrl.ts'

const TOKEN = '3f2a9c0d1e4b5a6978c0d1e2f3a4b5c6d7e8f901'

describe('parseFeedUrl', () => {
  it('Canvas のカレンダーフィード', () => {
    expect(parseFeedUrl('https://canvas.ucsc.edu/feeds/calendars/user_AbC123xyz.ics')).toEqual({
      lms: 'canvas',
      baseUrl: 'https://canvas.ucsc.edu',
      feedUrl: 'https://canvas.ucsc.edu/feeds/calendars/user_AbC123xyz.ics',
      root: 'https://canvas.ucsc.edu',
    })
  })

  it('Moodle の書き出し。userid と authtoken だけ残し、範囲は「すべて・最近と今後」にする', () => {
    expect(
      parseFeedUrl(
        `https://moodle.example.ac.jp/calendar/export_execute.php?userid=1234&authtoken=${TOKEN}&preset_what=courses&preset_time=weeknow`,
      ),
    ).toEqual({
      lms: 'moodle',
      baseUrl: 'https://moodle.example.ac.jp',
      feedUrl: `https://moodle.example.ac.jp/calendar/export_execute.php?userid=1234&authtoken=${TOKEN}&preset_what=all&preset_time=recentupcoming`,
      root: 'https://moodle.example.ac.jp',
    })
  })

  it('サブパスに置いた Moodle は、課題のリンクの頭もサブパスまで', () => {
    const feed = parseFeedUrl(`lms.example.ac.jp/moodle/calendar/export_execute.php?userid=7&authtoken=${TOKEN}`)
    expect(feed?.root).toBe('https://lms.example.ac.jp/moodle')
    expect(feed?.feedUrl.startsWith('https://lms.example.ac.jp/moodle/calendar/export_execute.php?userid=7&')).toBe(true)
  })

  it('形の違う URL・トークンの無い URL・内部の宛先は読まない', () => {
    expect(parseFeedUrl('https://moodle.example.ac.jp/calendar/export_execute.php?userid=1234')).toBeNull()
    expect(parseFeedUrl(`https://moodle.example.ac.jp/calendar/export_execute.php?userid=abc&authtoken=${TOKEN}`)).toBeNull()
    expect(parseFeedUrl(`https://moodle.example.ac.jp/calendar/export_execute.php?userid=1&authtoken=x%27y`)).toBeNull()
    expect(parseFeedUrl(`http://moodle.example.ac.jp/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`)).toBeNull()
    expect(parseFeedUrl(`https://localhost/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`)).toBeNull()
    expect(parseFeedUrl(`https://10.0.0.5/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`)).toBeNull()
    expect(parseFeedUrl('https://moodle.example.ac.jp/admin/tool.php')).toBeNull()
  })
})

describe('feedUrlProblem', () => {
  it('読める形なら null、カレンダーの画面は分けて案内する', () => {
    expect(feedUrlProblem('')).toBeNull()
    expect(feedUrlProblem('https://canvas.ucsc.edu/feeds/calendars/user_AbC123xyz.ics')).toBeNull()
    expect(feedUrlProblem(`https://moodle.example.ac.jp/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`)).toBeNull()
    expect(feedUrlProblem('https://canvas.ucsc.edu/calendar#view_name=month')).toBe('calendarPage')
    expect(feedUrlProblem('https://moodle.example.ac.jp/calendar/export.php?course=1')).toBe('moodlePage')
    expect(feedUrlProblem('https://moodle.example.ac.jp/calendar/view.php?view=month')).toBe('moodlePage')
    expect(feedUrlProblem('https://moodle.example.ac.jp/calendar/export_execute.php?userid=1')).toBe('moodlePage')
    expect(feedUrlProblem('https://canvas.ucsc.edu/courses/77')).toBe('notFeed')
  })
})
