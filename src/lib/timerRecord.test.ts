import { describe, expect, it } from 'vitest'
import { timerRecordTimes } from './timerRecord'

/** ローカル時刻で日付をまたぐ判定をするので、テストもローカル時刻で書く */
const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi).toISOString()

describe('timerRecordTimes', () => {
  it('同じ日なら endDate は null', () => {
    expect(timerRecordTimes(at(2026, 9, 30, 15, 0), at(2026, 9, 30, 16, 30))).toEqual({
      dueDate: '2026-09-30',
      endDate: null,
      startTime: '15:00',
      endTime: '16:30',
    })
  })

  it('日をまたぐと endDate が入る（睡眠など）', () => {
    expect(timerRecordTimes(at(2026, 9, 30, 23, 30), at(2026, 10, 1, 7, 0))).toEqual({
      dueDate: '2026-09-30',
      endDate: '2026-10-01',
      startTime: '23:30',
      endTime: '07:00',
    })
  })

  it('1 分未満は記録しない（同じ HH:mm で 24 時間ログになるのを防ぐ）', () => {
    expect(timerRecordTimes(at(2026, 9, 30, 15, 0), at(2026, 9, 30, 15, 0))).toBeNull()
  })

  it('ちょうど 1 分は記録する', () => {
    expect(timerRecordTimes(at(2026, 9, 30, 15, 0), at(2026, 9, 30, 15, 1))).not.toBeNull()
  })

  it('終了が開始より前なら記録しない', () => {
    expect(timerRecordTimes(at(2026, 9, 30, 15, 0), at(2026, 9, 30, 14, 0))).toBeNull()
  })

  it('壊れた日付は記録しない', () => {
    expect(timerRecordTimes('not-a-date', at(2026, 9, 30, 15, 0))).toBeNull()
    expect(timerRecordTimes(at(2026, 9, 30, 15, 0), 'not-a-date')).toBeNull()
  })

  it('止め忘れを選んだ終了時刻で閉じられる（8 時間超でも歪めない）', () => {
    // 15:00 開始 → 翌朝まで放置。17:00 で閉じると 2 時間の記録になる
    const r = timerRecordTimes(at(2026, 9, 30, 15, 0), at(2026, 9, 30, 17, 0))
    expect(r).toEqual({
      dueDate: '2026-09-30',
      endDate: null,
      startTime: '15:00',
      endTime: '17:00',
    })
  })
})
