import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOCK_MINUTES, QUICK_ADD_PAST_DAYS, parseQuickAddTitle } from './parseQuickAdd'

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

  it('設定の既定の長さを渡すとその長さになる', () => {
    const r = parseQuickAddTitle('15時 ゼミ', true, NOW, { blockMinutes: 30 })
    expect(r.endTime).toBe('15:30')
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
    // 時刻が無ければ長さは見積もり
    expect(r.title).toBe('レポート')
    expect(r.estimateMinutes).toBe(120)
  })

  it('24 時間を超える長さの見積もりは 1440 分（1 日）で止める', () => {
    expect(ja('勉強 30時間')).toMatchObject({ title: '勉強', estimateMinutes: 1440 })
    expect(ja('ES 2000分')).toMatchObject({ title: 'ES', estimateMinutes: 1440 })
    expect(en('read 48h')).toMatchObject({ title: 'read', estimateMinutes: 1440 })
    expect(ja('勉強 24時間')).toMatchObject({ estimateMinutes: 1440 })
    expect(ja('勉強 0分').estimateMinutes).toBeNull()
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
  const rep = (type: string, interval = 1, weekdays: number[] | null = null, monthDay: number | null = null) => ({
    type,
    interval,
    weekdays,
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
    expect(ja('毎週金 ゴミ出し')).toMatchObject({ title: 'ゴミ出し', repeat: rep('weekly', 1, [5]), date: null })
    expect(ja('毎週金曜 ゴミ出し').repeat).toEqual(rep('weekly', 1, [5]))
    expect(ja('毎週金曜日 ゴミ出し').repeat).toEqual(rep('weekly', 1, [5]))
    expect(ja('隔週月 面談').repeat).toEqual(rep('weekly', 2, [1]))
  })

  it('「毎週月曜」を月曜の日付として読まない', () => {
    const r = ja('毎週月曜 ゼミ')
    expect(r.date).toBeNull()
    expect(r.repeat).toEqual(rep('weekly', 1, [1]))
  })

  it('曜日を 2 つ以上（毎週月水・毎週月・水・金）', () => {
    expect(ja('毎週月水 ジム')).toMatchObject({ title: 'ジム', repeat: rep('weekly', 1, [1, 3]), date: null })
    expect(ja('毎週月・水・金 ジム').repeat).toEqual(rep('weekly', 1, [1, 3, 5]))
    expect(ja('毎週月曜・木曜 ゼミ').repeat).toEqual(rep('weekly', 1, [1, 4]))
    expect(ja('毎週土日 掃除').repeat).toEqual(rep('weekly', 1, [6, 7]))
    expect(ja('隔週火金 面談').repeat).toEqual(rep('weekly', 2, [2, 5]))
    // 「金曜日」の「日」を日曜と読まない
    expect(ja('毎週金曜日 ゴミ出し').repeat).toEqual(rep('weekly', 1, [5]))
    expect(ja('毎週月水19時 ジム')).toMatchObject({ title: 'ジム', repeat: rep('weekly', 1, [1, 3]), startTime: '19:00' })
  })

  it('平日（月〜金）', () => {
    expect(ja('平日 朝活')).toMatchObject({ title: '朝活', repeat: rep('weekly', 1, [1, 2, 3, 4, 5]), date: null })
    expect(ja('毎平日 朝活').repeat).toEqual(rep('weekly', 1, [1, 2, 3, 4, 5]))
    expect(ja('平日7時 ジョギング')).toMatchObject({ title: 'ジョギング', startTime: '07:00' })
    expect(ja('平日ランチ 予約')).toMatchObject({ title: '平日ランチ 予約', repeat: null })
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
    expect(ja('毎週金曜まで 課題')).toMatchObject({ title: '課題', repeat: rep('weekly', 1, [5]), date: null, dateIsDeadline: true })
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
    expect(en('trash every fri')).toMatchObject({ title: 'trash', repeat: rep('weekly', 1, [5]), date: null })
    expect(en('every Monday seminar').repeat).toEqual(rep('weekly', 1, [1]))
    expect(en('every thurs club').repeat).toEqual(rep('weekly', 1, [4]))
    expect(en('gym every mon wed')).toMatchObject({ title: 'gym', repeat: rep('weekly', 1, [1, 3]) })
    expect(en('gym every mon, wed and fri 7pm')).toMatchObject({ title: 'gym', repeat: rep('weekly', 1, [1, 3, 5]), startTime: '19:00' })
    expect(en('every mon/thu seminar')).toMatchObject({ title: 'seminar', repeat: rep('weekly', 1, [1, 4]) })
    expect(en('every sat sun cleaning').repeat).toEqual(rep('weekly', 1, [6, 7]))
    expect(en('every mon and dinner')).toMatchObject({ title: 'and dinner', repeat: rep('weekly', 1, [1]) })
    expect(en('standup every weekday')).toMatchObject({ title: 'standup', repeat: rep('weekly', 1, [1, 2, 3, 4, 5]) })
    expect(ja('朝活 every weekdays').repeat).toEqual(rep('weekly', 1, [1, 2, 3, 4, 5]))
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
    expect(en('every fri 3pm seminar')).toMatchObject({ title: 'seminar', repeat: rep('weekly', 1, [5]), startTime: '15:00' })
    expect(en('essay every week by fri')).toMatchObject({ title: 'essay', repeat: rep('weekly'), date: '2026-10-02', dateIsDeadline: true })
  })

  it('日本語表示でも every を読む', () => {
    expect(ja('日記 every day')).toMatchObject({ title: '日記', repeat: rep('daily') })
  })
})

describe('初見の学生が打つ書き方（2026-10-06 火曜）', () => {
  /** 2026-10-06 は火曜（今週の日曜は 10/11、来週の日曜は 10/18） */
  const OCT6 = new Date(2026, 9, 6, 10, 0, 0)
  const ja6 = (raw: string) => parseQuickAddTitle(raw, true, OCT6)
  const en6 = (raw: string) => parseQuickAddTitle(raw, false, OCT6)

  describe('締切の印（締切・〆切・締め切り・期限・提出）', () => {
    it('「A社 ES 10/10 23:59 締切」は 10/10 23:59 の締切で、予定にしない', () => {
      expect(ja6('A社 ES 10/10 23:59 締切')).toMatchObject({
        title: 'A社 ES',
        date: '2026-10-10',
        dateIsDeadline: true,
        dueTime: '23:59',
        startTime: null,
        endTime: null,
      })
    })

    it('「まで」でも時刻は締切の時刻になる', () => {
      expect(ja6('A社 ES 10/10 23:59まで')).toMatchObject({
        title: 'A社 ES',
        date: '2026-10-10',
        dateIsDeadline: true,
        dueTime: '23:59',
        startTime: null,
      })
      expect(ja6('レポート 明日23:59まで')).toMatchObject({
        title: 'レポート',
        date: '2026-10-07',
        dateIsDeadline: true,
        dueTime: '23:59',
        startTime: null,
      })
    })

    it('印は前後どちらに書いても、語にくっつけても読む', () => {
      for (const raw of ['〆切 10/10 ES', 'ES 10/10 締め切り', '期限 10/10 ES', 'ES 10/10締切', '締切:10/10 ES', 'ES 締切り 10/10']) {
        expect(ja6(raw), raw).toMatchObject({ title: 'ES', date: '2026-10-10', dateIsDeadline: true, dueTime: null })
      }
    })

    it('日だけの指定と締切の印を空白で離しても読む', () => {
      expect(ja6('レポート 10日 締切')).toMatchObject({ title: 'レポート', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('レポート 10日 まで')).toMatchObject({ title: 'レポート', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('10日 旅行')).toMatchObject({ title: '10日 旅行', date: null })
    })

    it('「有効期限」は締切として読んでも語を題名に残す', () => {
      expect(ja6('パスポート有効期限 10/10')).toMatchObject({ title: 'パスポート有効期限', date: '2026-10-10', dateIsDeadline: true })
    })

    it('「提出」は締切として読んでも題名に残す（やることの名前でもある）', () => {
      expect(ja6('ES 提出 10/10 23:59')).toMatchObject({ title: 'ES 提出', date: '2026-10-10', dateIsDeadline: true, dueTime: '23:59' })
      expect(ja6('提出 10/10 ES')).toMatchObject({ title: '提出 ES', date: '2026-10-10', dateIsDeadline: true })
    })

    it('日付が無く時刻だけでも締切の時刻（日は呼び出し側が決める）', () => {
      expect(ja6('課題 23:59まで')).toMatchObject({ title: '課題', date: null, dateIsDeadline: true, dueTime: '23:59', startTime: null })
    })

    it('範囲と締切の印なら終わりの時刻が締切', () => {
      expect(ja6('提出 10/10 13:00-15:00 窓口')).toMatchObject({ title: '提出 窓口', dueTime: '15:00', startTime: null })
    })

    it('日時の無い「提出」「締切」は題名のまま', () => {
      expect(ja6('ES 提出')).toMatchObject({ title: 'ES 提出', date: null, dateIsDeadline: false, dueTime: null })
      expect(ja6('締切 確認')).toMatchObject({ title: '締切 確認', dateIsDeadline: false })
    })

    it('語の一部の「提出物」「期限切れ」は印ではない', () => {
      expect(ja6('提出物 明日')).toMatchObject({ title: '提出物', date: '2026-10-07', dateIsDeadline: false })
      expect(ja6('期限切れ 確認')).toMatchObject({ title: '期限切れ 確認', date: null })
    })

    it('英語表示では日本語の印を読まない', () => {
      expect(en6('ES 10/10 締切')).toMatchObject({ title: 'ES 締切', date: '2026-10-10', dateIsDeadline: false })
    })
  })

  describe('2 回目に読めなかった締切の書き方', () => {
    it('「10/10 23:59までにES提出」は「までに」で語が切れ、後ろが題名', () => {
      expect(ja6('10/10 23:59までにES提出')).toMatchObject({
        title: 'ES提出',
        date: '2026-10-10',
        dateIsDeadline: true,
        dueTime: '23:59',
        startTime: null,
      })
      expect(ja6('10/10 23:59までES提出')).toMatchObject({ title: 'ES提出', date: '2026-10-10', dueTime: '23:59' })
      expect(ja6('明日までにレポート')).toMatchObject({ title: 'レポート', date: '2026-10-07', dateIsDeadline: true })
      expect(ja6('10/10までの課題')).toMatchObject({ title: '課題', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('１０/１０ ２３：５９までにＥＳ提出')).toMatchObject({ title: 'ＥＳ提出', date: '2026-10-10', dueTime: '23:59' })
    })

    it('語の後ろの「期限」「締切」は除いて締切に読む（「提出」は残す）', () => {
      expect(ja6('ES 提出期限 10/10')).toMatchObject({ title: 'ES 提出', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('レポート提出期限 10/10')).toMatchObject({ title: 'レポート提出', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('レポート締切 10/10 23:59')).toMatchObject({ title: 'レポート', dateIsDeadline: true, dueTime: '23:59', startTime: null })
      expect(ja6('ES〆切 明日')).toMatchObject({ title: 'ES', date: '2026-10-07', dateIsDeadline: true })
    })

    it('日時が無ければ「提出期限」は題名のまま', () => {
      expect(ja6('提出期限 確認')).toMatchObject({ title: '提出期限 確認', date: null, dateIsDeadline: false })
      expect(ja6('レポート締切')).toMatchObject({ title: 'レポート締切', dateIsDeadline: false })
    })

    it('「10日まで」「10日締切」は今月か来月の、今日に近いほうのその日', () => {
      expect(ja6('レポート 10日まで')).toMatchObject({ title: 'レポート', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('10日締切 ES')).toMatchObject({ title: 'ES', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('ES 10日までに提出')).toMatchObject({ title: 'ES 提出', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('ES 10/10提出')).toMatchObject({ title: 'ES 提出', date: '2026-10-10', dateIsDeadline: true })
      expect(ja6('レポート 6日まで')).toMatchObject({ date: '2026-10-06', dateIsDeadline: true })
      // 昨日なら昨日（締切切れ）。月末の「1日まで」は来月
      expect(ja6('レポート 5日まで')).toMatchObject({ date: '2026-10-05', dateIsDeadline: true })
      expect(parseQuickAddTitle('レポート 1日まで', true, new Date(2026, 9, 31, 10))).toMatchObject({ date: '2026-11-01' })
      expect(ja6('課題 10日 23:59まで')).toMatchObject({ title: '課題 10日', dueTime: '23:59' })
    })

    it('その日が無い月は飛ばす（31日）', () => {
      // 10/31 はある
      expect(ja6('課題 31日まで')).toMatchObject({ date: '2026-10-31' })
      // 11/30 から見た 31日 → 11 月に 31 日は無いので 12/31
      expect(parseQuickAddTitle('課題 31日まで', true, new Date(2026, 10, 30, 10))).toMatchObject({ date: '2026-12-31' })
      // 1/31 から見た 30日 → 昨日の 1/30（2 月に 30 日は無く、次は 3/30 で遠い）
      expect(parseQuickAddTitle('課題 30日まで', true, new Date(2027, 0, 31, 10))).toMatchObject({ date: '2027-01-30' })
    })

    it('「3日後」「1週間後」「2週間後」は今日から数える（「まで」が付けば締切）', () => {
      expect(ja6('3日後 歯医者')).toMatchObject({ title: '歯医者', date: '2026-10-09', dateIsDeadline: false })
      expect(ja6('1週間後 面談')).toMatchObject({ title: '面談', date: '2026-10-13', dateIsDeadline: false })
      expect(ja6('レポート 2週間後まで')).toMatchObject({ title: 'レポート', date: '2026-10-20', dateIsDeadline: true })
      expect(ja6('ES 3日後までに')).toMatchObject({ title: 'ES', date: '2026-10-09', dateIsDeadline: true })
    })

    it('日の数・番号は日付にしない', () => {
      for (const raw of ['旅行 10日間', '筋トレ 3日目', '第10日 振り返り', '1週間ぶり 運動', '10日 旅行', '1日1時間 勉強', '3日坊主']) {
        const r = ja6(raw)
        expect(r.date, raw).toBeNull()
        expect(r.title, raw).toBe(raw)
      }
      expect(ja6('毎月15日 家賃')).toMatchObject({ title: '家賃', date: null, repeat: { type: 'monthly', monthDay: 15 } })
    })
  })

  describe('今週中・来週中', () => {
    it('「今週中」「今週まで」は今週の日曜締切', () => {
      expect(ja6('今週中 レポート')).toMatchObject({ title: 'レポート', date: '2026-10-11', dateIsDeadline: true })
      expect(ja6('レポート 今週まで')).toMatchObject({ title: 'レポート', date: '2026-10-11', dateIsDeadline: true })
      expect(ja6('レポート 今週までに')).toMatchObject({ date: '2026-10-11', dateIsDeadline: true })
    })

    it('「来週中」「来週まで」は来週の日曜締切', () => {
      expect(ja6('来週中 ES')).toMatchObject({ title: 'ES', date: '2026-10-18', dateIsDeadline: true })
      expect(ja6('ES 来週まで')).toMatchObject({ date: '2026-10-18', dateIsDeadline: true })
    })

    it('日曜に書いた「今週中」はその日', () => {
      expect(parseQuickAddTitle('今週中 掃除', true, new Date(2026, 9, 11, 10))).toMatchObject({
        date: '2026-10-11',
        dateIsDeadline: true,
      })
    })

    it('「今週」だけは読まない（来週金曜は今まで通り）', () => {
      expect(ja6('今週 掃除')).toMatchObject({ title: '今週 掃除', date: null })
      expect(ja6('来週金曜 面談')).toMatchObject({ date: '2026-10-16', dateIsDeadline: false })
    })
  })

  describe('時刻の範囲', () => {
    it('範囲の直後の括弧書きは題名に戻す', () => {
      expect(ja6('C社 一次面接 10/8 14:00–15:00（オンライン）')).toMatchObject({
        title: 'C社 一次面接 （オンライン）',
        date: '2026-10-08',
        dateIsDeadline: false,
        startTime: '14:00',
        endTime: '15:00',
      })
    })

    it('全角の数字・コロンも読む（題名は元の文字のまま）', () => {
      expect(ja6('面接 １０/８ １４：００〜１５：００')).toMatchObject({
        title: '面接',
        date: '2026-10-08',
        startTime: '14:00',
        endTime: '15:00',
      })
      expect(ja6('ゼミ １４：００（Ｂ棟）')).toMatchObject({ title: 'ゼミ （Ｂ棟）', startTime: '14:00' })
    })

    it('日付の後の曜日の書き添え「10/8(木)」は読み飛ばす', () => {
      expect(ja6('面接 10/8(木) 14:00')).toMatchObject({ title: '面接', date: '2026-10-08', startTime: '14:00' })
      expect(ja6('面接 １０/８（木）')).toMatchObject({ title: '面接', date: '2026-10-08' })
    })

    it('「バイト 17-22」の素の数字の範囲', () => {
      expect(ja6('バイト 17-22')).toMatchObject({ title: 'バイト', startTime: '17:00', endTime: '22:00' })
      expect(ja6('バイト 9〜17')).toMatchObject({ startTime: '09:00', endTime: '17:00' })
      expect(en6('shift 17-22')).toMatchObject({ title: 'shift', startTime: '17:00', endTime: '22:00' })
      // 24 時はその日の終わり
      expect(ja6('夜勤 18-24')).toMatchObject({ startTime: '18:00', endTime: '23:59' })
    })

    it('題名にくっついた範囲「バイト17時〜22時」「バイト17:00-22:00」', () => {
      expect(ja6('バイト17時〜22時')).toMatchObject({ title: 'バイト', startTime: '17:00', endTime: '22:00' })
      expect(ja6('バイト17:00-22:00')).toMatchObject({ title: 'バイト', startTime: '17:00', endTime: '22:00' })
      expect(ja6('バイト午後5時〜午後10時')).toMatchObject({ title: 'バイト', startTime: '17:00', endTime: '22:00' })
      expect(ja6('C社面接14:00-15:00(オンライン)')).toMatchObject({ title: 'C社面接(オンライン)', startTime: '14:00', endTime: '15:00' })
      expect(en6('shift17:00-22:00')).toMatchObject({ title: 'shift', startTime: '17:00' })
    })

    it('「17時から22時」も範囲', () => {
      expect(ja6('バイト 17時から22時')).toMatchObject({ title: 'バイト', startTime: '17:00', endTime: '22:00' })
    })
  })

  describe('時刻と取り違えない', () => {
    it('ページ・章・問の範囲', () => {
      for (const raw of [
        '教科書 2-3 ページ',
        '教科書 10-12 ページ',
        '問題集 10-12',
        '教科書 10-12',
        '範囲 7-9',
        'read p. 17-20',
        'read pp 17-20',
        'exercises 10-12',
        '10-12 問 解く',
        'ドリル 8-9 回',
      ]) {
        const r = ja6(raw)
        expect(r.startTime, raw).toBeNull()
        expect(r.title, raw).toBe(raw)
      }
    })

    it('くっついた番号「第3-4章」「第3-4」「p17-20」', () => {
      for (const raw of ['第3-4章 読む', '第3-4 読む', 'p17-20 読む', '3-4章 読む']) {
        const r = ja6(raw)
        expect(r.startTime, raw).toBeNull()
        expect(r.title, raw).toBe(raw)
      }
    })

    it('ありそうにない範囲（早すぎる・長すぎる・逆順）', () => {
      for (const raw of ['課 2-3', '読む 1-5', '作業 6-20', '作業 22-5', '作業 17-17']) {
        const r = ja6(raw)
        expect(r.startTime, raw).toBeNull()
        expect(r.title, raw).toBe(raw)
      }
    })

    it('題名にくっついた素の数字・時刻 1 つは分けない', () => {
      expect(ja6('バイト17-22')).toMatchObject({ title: 'バイト17-22', startTime: null })
      expect(ja6('バイト17時')).toMatchObject({ title: 'バイト17時', startTime: null })
      expect(ja6('A1017:00-18:00')).toMatchObject({ title: 'A1017:00-18:00', startTime: null })
    })
  })

  describe('23:59 で頭打ち', () => {
    it('長さが 0 になる時刻は予定にせず、題名に戻す', () => {
      expect(ja6('宿題 23:59')).toMatchObject({ title: '宿題 23:59', startTime: null, endTime: null })
    })

    it('少しでも長さがあれば予定（23:59 まで）', () => {
      expect(ja6('宿題 23:30')).toMatchObject({ title: '宿題', startTime: '23:30', endTime: '23:59' })
    })
  })
})

describe('過ぎた月日・年・あり得ない時刻・日をまたぐ範囲（2026-10-06）', () => {
  const OCT6 = new Date(2026, 9, 6, 10, 0, 0)
  const ja6 = (raw: string) => parseQuickAddTitle(raw, true, OCT6)
  const en6 = (raw: string) => parseQuickAddTitle(raw, false, OCT6)

  it(`過ぎて ${QUICK_ADD_PAST_DAYS} 日以内の月日は今年、それより前は来年`, () => {
    expect(ja6('10/3 レポート')).toMatchObject({ title: 'レポート', date: '2026-10-03' })
    expect(ja6('10月3日 レポート')).toMatchObject({ date: '2026-10-03' })
    expect(ja6('レポート 10/3まで')).toMatchObject({ date: '2026-10-03', dateIsDeadline: true })
    expect(en6('essay by 10/3')).toMatchObject({ title: 'essay', date: '2026-10-03', dateIsDeadline: true })
    expect(ja6('9/5 レポート')).toMatchObject({ date: '2026-09-05' })
    expect(ja6('7/5 レポート')).toMatchObject({ date: '2027-07-05' })
  })

  it('2/29: 来年に無ければ次のうるう年（3/1 にしない）', () => {
    const mar5 = new Date(2028, 2, 5, 10)
    expect(parseQuickAddTitle('2/29 誕生日', true, mar5)).toMatchObject({ title: '誕生日', date: '2028-02-29' })
    const jun = new Date(2028, 5, 1, 10)
    expect(parseQuickAddTitle('2/29 誕生日', true, jun)).toMatchObject({ date: '2032-02-29' })
  })

  it('年を書けばその年（yyyy/M/d・yyyy-M-d・yyyy年M月d日）', () => {
    expect(ja6('2027/1/15 レポート')).toMatchObject({ title: 'レポート', date: '2027-01-15' })
    expect(ja6('2026-1-5 レポート')).toMatchObject({ title: 'レポート', date: '2026-01-05' })
    expect(ja6('2027年1月15日 レポート')).toMatchObject({ title: 'レポート', date: '2027-01-15' })
    expect(ja6('2027/2/30 レポート')).toMatchObject({ title: '2027/2/30 レポート', date: null })
  })

  it('am / pm・午前 / 午後は 1〜12 時だけ読む', () => {
    expect(en6('mtg 13pm')).toMatchObject({ title: 'mtg 13pm', startTime: null })
    expect(en6('mtg 0pm')).toMatchObject({ title: 'mtg 0pm', startTime: null })
    expect(ja6('面談 午後13時')).toMatchObject({ startTime: null })
    expect(en6('mtg 12pm')).toMatchObject({ startTime: '12:00' })
    expect(en6('mtg 12am')).toMatchObject({ startTime: '00:00' })
  })

  it('日をまたぐ範囲（夜から朝）は範囲として読み、予定はその日の終わりまで', () => {
    expect(ja6('バイト 23時-1時')).toMatchObject({ title: 'バイト', startTime: '23:00', endTime: '23:59' })
    expect(ja6('夜勤 22:00-6:00')).toMatchObject({ title: '夜勤', startTime: '22:00', endTime: '23:59' })
    // 朝から昼の逆順は範囲にしない
    expect(ja6('メモ 10時-9時').startTime).not.toBe('10:00')
  })

  it('24 時は書き方によらずその日の終わり', () => {
    expect(ja6('バイト 22時-24時')).toMatchObject({ title: 'バイト', startTime: '22:00', endTime: '23:59' })
    expect(ja6('バイト 22:00-24:00')).toMatchObject({ title: 'バイト', startTime: '22:00', endTime: '23:59' })
    expect(ja6('バイト 22-24')).toMatchObject({ title: 'バイト', startTime: '22:00', endTime: '23:59' })
  })
})

describe('英語の題名の語を曜日・月日と取り違えない（2026-10-06 火曜）', () => {
  const OCT6 = new Date(2026, 9, 6, 10, 0, 0)
  const en6 = (raw: string) => parseQuickAddTitle(raw, false, OCT6)
  const ja6 = (raw: string) => parseQuickAddTitle(raw, true, OCT6)

  it('曜日の略で始まるだけの語（friend・sunscreen・Wedding・Monthly・monitor・Satellite）は題名に残す', () => {
    expect(en6('Call friend')).toMatchObject({ title: 'Call friend', date: null })
    expect(en6('Buy sunscreen')).toMatchObject({ title: 'Buy sunscreen', date: null })
    expect(en6('Wedding gift')).toMatchObject({ title: 'Wedding gift', date: null })
    expect(en6('Monthly report')).toMatchObject({ title: 'Monthly report', date: null })
    expect(en6('Fix monitor')).toMatchObject({ title: 'Fix monitor', date: null })
    expect(en6('Satellite lab')).toMatchObject({ title: 'Satellite lab', date: null })
    expect(ja6('Call friend')).toMatchObject({ title: 'Call friend', date: null })
  })

  it('曜日の綴り（fri / friday / fridays / thurs / Sat）は日付として読む', () => {
    expect(en6('Call Sat')).toMatchObject({ title: 'Call', date: '2026-10-10' })
    expect(en6('mtg fri')).toMatchObject({ title: 'mtg', date: '2026-10-09' })
    expect(en6('mtg Friday')).toMatchObject({ title: 'mtg', date: '2026-10-09' })
    expect(en6('mtg fridays')).toMatchObject({ title: 'mtg', date: '2026-10-09' })
    expect(en6('mtg wednesday')).toMatchObject({ title: 'mtg', date: '2026-10-07' })
    expect(en6('mtg thurs')).toMatchObject({ title: 'mtg', date: '2026-10-08' })
    expect(en6('mtg fri10am')).toMatchObject({ title: 'mtg', date: '2026-10-09', startTime: '10:00' })
  })

  it('月が 1〜12 でない月日（25/10・13/1）は日付にせず題名に残す', () => {
    expect(en6('25/10 party')).toMatchObject({ title: '25/10 party', date: null })
    expect(ja6('13/1 レポート')).toMatchObject({ title: '13/1 レポート', date: null })
    expect(ja6('2026/13/5 レポート')).toMatchObject({ title: '2026/13/5 レポート', date: null })
    expect(ja6('12/1 レポート')).toMatchObject({ title: 'レポート', date: '2026-12-01' })
  })
})

describe('英語の空白をまたぐ日付・noon・tonight（2026-10-06 火曜）', () => {
  /** 2026-10-06 は火曜（次の月曜は 10/12、今週の日曜は 10/11、来週の日曜は 10/18） */
  const OCT6 = new Date(2026, 9, 6, 10, 0, 0)
  const en6 = (raw: string) => parseQuickAddTitle(raw, false, OCT6)
  const ja6 = (raw: string) => parseQuickAddTitle(raw, true, OCT6)

  it('「next fri」は来週（次の月曜から始まる週）の金曜で、「next」を題名に残さない', () => {
    expect(en6('next fri essay')).toMatchObject({ title: 'essay', date: '2026-10-16', dateIsDeadline: false })
    expect(en6('essay next Friday')).toMatchObject({ title: 'essay', date: '2026-10-16' })
    expect(en6('mtg next mon 3pm')).toMatchObject({ title: 'mtg', date: '2026-10-12', startTime: '15:00' })
    // 来週の火曜は今日から 7 日後（「来週火曜」と同じ）
    expect(en6('next tue gym')).toMatchObject({ title: 'gym', date: '2026-10-13' })
    // 日曜に書いた「next fri」は翌日の月曜から始まる週の金曜
    expect(parseQuickAddTitle('next fri essay', false, new Date(2026, 9, 11, 10))).toMatchObject({ date: '2026-10-16' })
    // 日本語表示でも読む（by / due / every と同じ）
    expect(ja6('レポート next fri')).toMatchObject({ title: 'レポート', date: '2026-10-16' })
  })

  it('「this fri」は次に来る金曜（「fri」と同じ）', () => {
    expect(en6('this fri party')).toMatchObject({ title: 'party', date: '2026-10-09' })
    expect(en6('this tue party')).toMatchObject({ title: 'party', date: '2026-10-06' })
  })

  it('「this week」「next week」は今週・来週の日曜が締切（「今週中」「来週中」と同じ）', () => {
    expect(en6('next week essay')).toMatchObject({ title: 'essay', date: '2026-10-18', dateIsDeadline: true })
    expect(en6('essay this week')).toMatchObject({ title: 'essay', date: '2026-10-11', dateIsDeadline: true })
  })

  it('「this weekend」は今週の土曜（日曜に書けば今日）', () => {
    expect(en6('this weekend clean')).toMatchObject({ title: 'clean', date: '2026-10-10', dateIsDeadline: false })
    expect(parseQuickAddTitle('this weekend clean', false, new Date(2026, 9, 11, 10))).toMatchObject({ date: '2026-10-11' })
  })

  it('「in 2 days」「in 3 weeks」「in a week」は今日から数える', () => {
    expect(en6('in 2 days essay')).toMatchObject({ title: 'essay', date: '2026-10-08', dateIsDeadline: false })
    expect(en6('dentist in 3 weeks')).toMatchObject({ title: 'dentist', date: '2026-10-27' })
    expect(en6('call in a week')).toMatchObject({ title: 'call', date: '2026-10-13' })
    expect(en6('call in a day')).toMatchObject({ title: 'call', date: '2026-10-07' })
    expect(en6('in 1 day essay')).toMatchObject({ date: '2026-10-07' })
    expect(en6('in 2days essay')).toMatchObject({ title: 'essay', date: '2026-10-08' })
  })

  it('締切の印 by / due と組み合わせられる', () => {
    expect(en6('essay by next fri')).toMatchObject({ title: 'essay', date: '2026-10-16', dateIsDeadline: true })
    expect(en6('report due in 3 days')).toMatchObject({ title: 'report', date: '2026-10-09', dateIsDeadline: true })
    expect(en6('ES by Oct 10')).toMatchObject({ title: 'ES', date: '2026-10-10', dateIsDeadline: true })
    expect(en6('essay due this week')).toMatchObject({ title: 'essay', date: '2026-10-11', dateIsDeadline: true })
  })

  it('「Dec 5」「December 5th」「5 Dec」「Dec. 5」は月日', () => {
    expect(en6('Dec 5 exam')).toMatchObject({ title: 'exam', date: '2026-12-05' })
    expect(en6('Oct 10 ES')).toMatchObject({ title: 'ES', date: '2026-10-10' })
    expect(en6('5 Dec exam')).toMatchObject({ title: 'exam', date: '2026-12-05' })
    expect(en6('exam December 5th')).toMatchObject({ title: 'exam', date: '2026-12-05' })
    expect(en6('exam 1st Nov')).toMatchObject({ title: 'exam', date: '2026-11-01' })
    expect(en6('exam Dec. 5')).toMatchObject({ title: 'exam', date: '2026-12-05' })
    expect(en6('exam Sept 3')).toMatchObject({ title: 'exam', date: '2026-09-03' })
    expect(en6('interview Oct 8, 2pm')).toMatchObject({ title: 'interview', date: '2026-10-08', startTime: '14:00' })
    expect(ja6('試験 Dec 5')).toMatchObject({ title: '試験', date: '2026-12-05' })
  })

  it(`月の名前の月日も、過ぎて ${QUICK_ADD_PAST_DAYS} 日以内なら今年、それより前は来年（「10/3」と同じ）`, () => {
    expect(en6('Oct 3 essay')).toMatchObject({ date: '2026-10-03' })
    expect(en6('Jul 5 essay')).toMatchObject({ date: '2027-07-05' })
  })

  it('月日の後ろの年はその年（今年の 5 年前〜10 年後だけ。それ以外は題名に残す）', () => {
    expect(en6('exam Jan 15 2027')).toMatchObject({ title: 'exam', date: '2027-01-15' })
    expect(en6('exam 15 Jan, 2027')).toMatchObject({ title: 'exam', date: '2027-01-15' })
    expect(en6('Oct 10 2000 words')).toMatchObject({ title: '2000 words', date: '2026-10-10' })
    // 年を書いてその年に無い日なら読まない
    expect(en6('Feb 30 2027 exam')).toMatchObject({ title: 'Feb 30 2027 exam', date: null })
  })

  it('月の名前だけ・ありえない日・月の名前と日が並ばなければ日付にしない', () => {
    for (const raw of ['December report', 'May I help', 'Dec 32 exam', 'Feb 30 exam', 'march band 5']) {
      const r = en6(raw)
      expect(r.date, raw).toBeNull()
      expect(r.title, raw).toBe(raw)
    }
  })

  it('next / this / in の後ろが日付の語でなければ題名のまま（「next weekend」は今週末か来週末か決められないので読まない）', () => {
    for (const raw of [
      'next step',
      'plan next weekend trip',
      'next month rent',
      'this is it',
      'in 0 days',
      'in a days',
      'log in 2 hours',
    ]) {
      const r = en6(raw)
      expect(r.date, raw).toBeNull()
      expect(r.title, raw).toBe(raw)
    }
    // 「in」だけ題名に残り、tomorrow は今まで通り読む
    expect(en6('check in tomorrow')).toMatchObject({ title: 'check in', date: '2026-10-07' })
  })

  it('「noon」は 12:00（範囲の端にも書ける）', () => {
    expect(en6('lunch noon')).toMatchObject({ title: 'lunch', startTime: '12:00', endTime: '13:00' })
    expect(en6('lunch noon-1pm')).toMatchObject({ title: 'lunch', startTime: '12:00', endTime: '13:00' })
    expect(en6('class 11am-noon')).toMatchObject({ title: 'class', startTime: '11:00', endTime: '12:00' })
    expect(en6('lunch tomorrow noon')).toMatchObject({ title: 'lunch', date: '2026-10-07', startTime: '12:00' })
    // 「afternoon」「noonday」は読まない
    expect(en6('afternoon tea')).toMatchObject({ title: 'afternoon tea', startTime: null })
    expect(en6('noonday walk')).toMatchObject({ title: 'noonday walk', startTime: null })
  })

  it('「tonight」は今日で、時刻は決めつけない', () => {
    expect(en6('tonight dinner')).toMatchObject({ title: 'dinner', date: '2026-10-06', startTime: null, dateIsDeadline: false })
    expect(en6('dinner tonight 8pm')).toMatchObject({ title: 'dinner', date: '2026-10-06', startTime: '20:00' })
    expect(en6('essay due tonight')).toMatchObject({ title: 'essay', date: '2026-10-06', dateIsDeadline: true })
  })

  it('曜日と取り違えない語（#334）は next / this の後ろでも曜日にしない', () => {
    expect(en6('next friend')).toMatchObject({ title: 'next friend', date: null })
    expect(en6('this Monthly report')).toMatchObject({ title: 'this Monthly report', date: null })
  })
})
