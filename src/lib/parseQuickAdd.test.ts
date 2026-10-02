import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOCK_MINUTES, parseQuickAddTitle } from './parseQuickAdd'

/**
 * クイック追加は毎日の入口なので、解釈を取り違えるとタイトルが壊れる。
 * 「日時として読む」「タイトルに戻す」の境界を固定する。
 */

/** 2026-09-30 は水曜（getDay=3） */
const NOW = new Date(2026, 8, 30, 10, 0, 0)

const ja = (raw: string) => parseQuickAddTitle(raw, true, NOW)
const en = (raw: string) => parseQuickAddTitle(raw, false, NOW)

describe('タグ・リスト指定', () => {
  it('#タグ を取り出してタイトルから外す', () => {
    const r = ja('ES 提出 #就活')
    expect(r.title).toBe('ES 提出')
    expect(r.tags).toEqual(['就活'])
  })

  it('同じタグは重複させない', () => {
    expect(ja('課題 #授業 #授業').tags).toEqual(['授業'])
  })

  it('@リスト名 を取り出す（全角＠も）', () => {
    expect(ja('牛乳 @買い物').listName).toBe('買い物')
    expect(ja('牛乳 ＠買い物').listName).toBe('買い物')
  })
})

describe('日付', () => {
  it('今日・明日・明後日', () => {
    expect(ja('バイト 今日').dueDate).toBe('2026-09-30')
    expect(ja('バイト 明日').dueDate).toBe('2026-10-01')
    expect(ja('バイト 明後日').dueDate).toBe('2026-10-02')
  })

  it('english keywords', () => {
    expect(en('shift today').dueDate).toBe('2026-09-30')
    expect(en('shift tomorrow').dueDate).toBe('2026-10-01')
  })

  it('曜日は次に来るその曜日（同じ曜日なら今日）', () => {
    // 水曜 2026-09-30 から見て
    expect(ja('ジム 金曜').dueDate).toBe('2026-10-02')
    expect(ja('ジム 水曜').dueDate).toBe('2026-09-30')
    expect(ja('ジム 月曜').dueDate).toBe('2026-10-05')
  })

  it('来週◯曜は次の月曜から始まる週', () => {
    // 次の月曜 = 2026-10-05 の週
    expect(ja('面談 来週金曜').dueDate).toBe('2026-10-09')
    expect(ja('面談 来週月曜').dueDate).toBe('2026-10-05')
  })

  it('英語の曜日', () => {
    expect(en('mtg fri').dueDate).toBe('2026-10-02')
  })

  it('yyyy-MM-dd と 9/30 形式', () => {
    expect(ja('課題 2026-12-24').dueDate).toBe('2026-12-24')
    expect(ja('課題 10/3').dueDate).toBe('2026-10-03')
  })

  it('過ぎた月日は来年にする', () => {
    expect(ja('課題 1/5').dueDate).toBe('2027-01-05')
  })

  it('ありえない月日は日付として読まない', () => {
    const r = ja('請求 13/40')
    expect(r.dueDate).toBeNull()
    expect(r.title).toBe('請求 13/40')
  })
})

describe('時刻と長さ', () => {
  it('15時 は開始時刻になり、既定の長さが付く', () => {
    expect(DEFAULT_BLOCK_MINUTES).toBe(60)
    const r = ja('15時 ゼミ')
    expect(r.startTime).toBe('15:00')
    expect(r.endTime).toBe('16:00')
    expect(r.title).toBe('ゼミ')
  })

  it('15時半 / 午後3時 / 15:00 / 3pm', () => {
    expect(ja('15時半 ゼミ').startTime).toBe('15:30')
    expect(ja('午後3時 ゼミ').startTime).toBe('15:00')
    expect(ja('15:00 ゼミ').startTime).toBe('15:00')
    expect(en('seminar 3pm').startTime).toBe('15:00')
  })

  it('範囲指定', () => {
    const r = ja('15時〜16時半 ゼミ')
    expect(r.startTime).toBe('15:00')
    expect(r.endTime).toBe('16:30')
    expect(en('mtg 3pm-4pm').startTime).toBe('15:00')
    expect(en('mtg 3pm-4pm').endTime).toBe('16:00')
  })

  it('長さの指定が終了時刻になる', () => {
    const r = ja('15時 ゼミ 1時間半')
    expect(r.startTime).toBe('15:00')
    expect(r.endTime).toBe('16:30')
    expect(r.title).toBe('ゼミ')
  })

  it('日付と時刻を同じ語で書ける', () => {
    const r = ja('明日15時 面接')
    expect(r.dueDate).toBe('2026-10-01')
    expect(r.startTime).toBe('15:00')
    expect(r.title).toBe('面接')
  })

  it('「15時から1時間」のつなぎ語を飲み込む', () => {
    const r = ja('15時から1時間 バイト')
    expect(r.startTime).toBe('15:00')
    expect(r.endTime).toBe('16:00')
    expect(r.title).toBe('バイト')
  })

  it('「時間」は長さ、「時」は時刻', () => {
    const r = ja('レポート 2時間')
    expect(r.startTime).toBeNull()
    // 時刻が無ければ長さだけの語はタイトルに戻す
    expect(r.title).toBe('レポート 2時間')
  })

  it('素の数字だけの範囲は時刻と断定しない', () => {
    const r = en('read 3-4')
    expect(r.startTime).toBeNull()
    expect(r.title).toBe('read 3-4')
  })
})

describe('タイトルの保全', () => {
  it('日時表現を含まない入力はそのまま', () => {
    const r = ja('TOEIC の申し込み')
    expect(r.title).toBe('TOEIC の申し込み')
    expect(r.dueDate).toBeNull()
    expect(r.startTime).toBeNull()
  })

  it('日時語の途中に文字が混ざればタイトルの一部として扱う', () => {
    const r = ja('15時間目安の課題')
    expect(r.title).toBe('15時間目安の課題')
    expect(r.startTime).toBeNull()
  })

  it('全部が日時表現ならタイトルは元の入力に戻す（空にしない）', () => {
    const r = ja('明日15時')
    expect(r.title).toBe('明日15時')
  })

  it('前後の余分な空白を詰める', () => {
    expect(ja('  ジム   明日  ').title).toBe('ジム')
  })
})
