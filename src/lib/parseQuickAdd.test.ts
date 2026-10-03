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

  it('リストを選べない欄では @… を題名に残す', () => {
    const r = parseQuickAddTitle('資料 @買い物 明日', true, NOW, { lists: false })
    expect(r.title).toBe('資料 @買い物')
    expect(r.listName).toBeNull()
    expect(r.date).toBe('2026-10-01')
  })
})

describe('日付', () => {
  it('今日・明日・明後日', () => {
    expect(ja('バイト 今日').date).toBe('2026-09-30')
    expect(ja('バイト 明日').date).toBe('2026-10-01')
    expect(ja('バイト 明後日').date).toBe('2026-10-02')
  })

  it('english keywords', () => {
    expect(en('shift today').date).toBe('2026-09-30')
    expect(en('shift tomorrow').date).toBe('2026-10-01')
  })

  it('曜日は次に来るその曜日（同じ曜日なら今日）', () => {
    // 水曜 2026-09-30 から見て
    expect(ja('ジム 金曜').date).toBe('2026-10-02')
    expect(ja('ジム 水曜').date).toBe('2026-09-30')
    expect(ja('ジム 月曜').date).toBe('2026-10-05')
  })

  it('来週◯曜は次の月曜から始まる週', () => {
    // 次の月曜 = 2026-10-05 の週
    expect(ja('面談 来週金曜').date).toBe('2026-10-09')
    expect(ja('面談 来週月曜').date).toBe('2026-10-05')
  })

  it('英語の曜日', () => {
    expect(en('mtg fri').date).toBe('2026-10-02')
  })

  it('yyyy-MM-dd と 9/30 形式', () => {
    expect(ja('課題 2026-12-24').date).toBe('2026-12-24')
    expect(ja('課題 10/3').date).toBe('2026-10-03')
  })

  it('過ぎた月日は来年にする', () => {
    expect(ja('課題 1/5').date).toBe('2027-01-05')
  })

  it('ありえない月日は日付として読まない', () => {
    const r = ja('請求 13/40')
    expect(r.date).toBeNull()
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
    expect(r.date).toBe('2026-10-01')
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
    expect(r.date).toBeNull()
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

describe('締切（まで / by / due）', () => {
  it('日付だけなら「やる日」', () => {
    const r = ja('課題 明日')
    expect(r.date).toBe('2026-10-01')
    expect(r.dateIsDeadline).toBe(false)
  })

  it('「明日まで」「金曜までに」は締切', () => {
    expect(ja('明日まで 課題')).toMatchObject({ title: '課題', date: '2026-10-01', dateIsDeadline: true })
    expect(ja('レポート 金曜までに')).toMatchObject({ title: 'レポート', date: '2026-10-02', dateIsDeadline: true })
    expect(ja('ES 10/5まで')).toMatchObject({ title: 'ES', date: '2026-10-05', dateIsDeadline: true })
  })

  it('「まで」だけの語はタイトルのまま', () => {
    expect(ja('終わるまで 粘る')).toMatchObject({ title: '終わるまで 粘る', date: null, dateIsDeadline: false })
  })

  it('英語は by / due の直後が日付なら締切', () => {
    expect(en('essay by fri')).toMatchObject({ title: 'essay', date: '2026-10-02', dateIsDeadline: true })
    expect(en('due tomorrow report')).toMatchObject({ title: 'report', date: '2026-10-01', dateIsDeadline: true })
  })

  it('by の後が日付でなければタイトルに戻す', () => {
    expect(en('stand by me')).toMatchObject({ title: 'stand by me', date: null, dateIsDeadline: false })
  })
})

describe('日本語表示でも英語の締切', () => {
  it('「essay due fri」「レポート by 金曜」も締切', () => {
    expect(ja('essay due fri')).toMatchObject({ title: 'essay', date: '2026-10-02', dateIsDeadline: true })
    expect(ja('レポート by 金曜')).toMatchObject({ title: 'レポート', date: '2026-10-02', dateIsDeadline: true })
  })
})

describe('繰り返し', () => {
  const rep = (type: string, interval = 1, weekday: number | null = null, monthDay: number | null = null) => ({
    type,
    interval,
    weekday,
    monthDay,
  })

  it('何も書かなければ繰り返しなし', () => {
    expect(ja('ジム 明日').repeat).toBeNull()
    expect(en('gym tomorrow').repeat).toBeNull()
  })

  it('毎日・隔日', () => {
    expect(ja('毎日 日記')).toMatchObject({ title: '日記', repeat: rep('daily'), date: null })
    expect(ja('水やり 隔日').repeat).toEqual(rep('daily', 2))
  })

  it('毎週・毎週金・毎週金曜・毎週金曜日', () => {
    expect(ja('毎週 振り返り').repeat).toEqual(rep('weekly'))
    expect(ja('毎週金 ゴミ出し')).toMatchObject({ title: 'ゴミ出し', repeat: rep('weekly', 1, 5), date: null })
    expect(ja('毎週金曜 ゴミ出し').repeat).toEqual(rep('weekly', 1, 5))
    expect(ja('毎週金曜日 ゴミ出し').repeat).toEqual(rep('weekly', 1, 5))
    expect(ja('隔週月 面談').repeat).toEqual(rep('weekly', 2, 1))
  })

  it('「毎週月曜」を月曜の日付として読まない', () => {
    const r = ja('毎週月曜 ゼミ')
    expect(r.date).toBeNull()
    expect(r.repeat).toEqual(rep('weekly', 1, 1))
  })

  it('曜日を 2 つ以上（毎週月水）・平日は繰り返しで表せないのでタイトルのまま', () => {
    expect(ja('毎週月水 ジム')).toMatchObject({ title: '毎週月水 ジム', repeat: null, date: null })
    expect(ja('平日 朝活')).toMatchObject({ title: '平日 朝活', repeat: null, date: null })
  })

  it('毎月・毎月15日', () => {
    expect(ja('毎月 家計簿').repeat).toEqual(rep('monthly'))
    expect(ja('毎月15日 家賃')).toMatchObject({ title: '家賃', repeat: rep('monthly', 1, null, 15), date: null })
    expect(ja('毎月40日 家賃')).toMatchObject({ title: '毎月40日 家賃', repeat: null })
  })

  it('毎年（同じ語に日付も書ける）', () => {
    expect(ja('毎年 健康診断').repeat).toEqual(rep('yearly'))
    expect(ja('毎年10月3日 誕生日')).toMatchObject({ title: '誕生日', repeat: rep('yearly'), date: '2026-10-03' })
  })

  it('N日ごと・N週間ごと・Nか月ごと・N年ごと', () => {
    expect(ja('3日ごと 水やり').repeat).toEqual(rep('daily', 3))
    expect(ja('2週間ごと 散髪').repeat).toEqual(rep('weekly', 2))
    expect(ja('2週ごと 散髪').repeat).toEqual(rep('weekly', 2))
    expect(ja('6か月ごと 歯医者').repeat).toEqual(rep('monthly', 6))
    expect(ja('3ヶ月ごと 歯医者').repeat).toEqual(rep('monthly', 3))
    expect(ja('2年ごと 免許').repeat).toEqual(rep('yearly', 2))
    expect(ja('0日ごと 水やり')).toMatchObject({ title: '0日ごと 水やり', repeat: null })
  })

  it('日付・時刻・締切と組み合わせられる', () => {
    expect(ja('毎週 金曜 15時 ゼミ')).toMatchObject({ title: 'ゼミ', repeat: rep('weekly'), date: '2026-10-02', startTime: '15:00' })
    expect(ja('毎日7時 ジョギング')).toMatchObject({ title: 'ジョギング', repeat: rep('daily'), startTime: '07:00' })
    expect(ja('毎週金曜まで 課題')).toMatchObject({ title: '課題', repeat: rep('weekly', 1, 5), date: null, dateIsDeadline: true })
  })

  it('語の途中にあればタイトルの一部', () => {
    expect(ja('毎日新聞 解約')).toMatchObject({ title: '毎日新聞 解約', repeat: null })
  })

  it('英語表示では日本語の繰り返しを読まない', () => {
    expect(en('毎日 日記')).toMatchObject({ title: '毎日 日記', repeat: null })
  })

  it('every day / week / month / year', () => {
    expect(en('journal every day')).toMatchObject({ title: 'journal', repeat: rep('daily') })
    expect(en('every week review').repeat).toEqual(rep('weekly'))
    expect(en('every month rent').repeat).toEqual(rep('monthly'))
    expect(en('every year checkup').repeat).toEqual(rep('yearly'))
  })

  it('every fri / every friday（日付にはしない）', () => {
    expect(en('trash every fri')).toMatchObject({ title: 'trash', repeat: rep('weekly', 1, 5), date: null })
    expect(en('every Monday seminar').repeat).toEqual(rep('weekly', 1, 1))
    expect(en('every thurs club').repeat).toEqual(rep('weekly', 1, 4))
  })

  it('every other week / every 2 weeks / every 3days', () => {
    expect(en('every other week haircut')).toMatchObject({ title: 'haircut', repeat: rep('weekly', 2) })
    expect(en('every 2 weeks haircut')).toMatchObject({ title: 'haircut', repeat: rep('weekly', 2) })
    expect(en('every 3days water').repeat).toEqual(rep('daily', 3))
    expect(en('every 6 months dentist').repeat).toEqual(rep('monthly', 6))
  })

  it('every の後ろが読めなければタイトルのまま', () => {
    expect(en('every little thing')).toMatchObject({ title: 'every little thing', repeat: null })
    expect(en('every')).toMatchObject({ title: 'every', repeat: null })
    expect(en('every 0 days')).toMatchObject({ title: 'every 0 days', repeat: null })
  })

  it('every と日時・締切を組み合わせられる', () => {
    expect(en('every fri 3pm seminar')).toMatchObject({ title: 'seminar', repeat: rep('weekly', 1, 5), startTime: '15:00' })
    expect(en('essay every week by fri')).toMatchObject({ title: 'essay', repeat: rep('weekly'), date: '2026-10-02', dateIsDeadline: true })
  })

  it('日本語表示でも every を読む', () => {
    expect(ja('日記 every day')).toMatchObject({ title: '日記', repeat: rep('daily') })
  })
})
