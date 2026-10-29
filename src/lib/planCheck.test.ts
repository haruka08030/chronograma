import { describe, expect, it } from 'vitest'
import { checkRecordTimes, planRecordOn } from './planCheck'

describe('checkRecordTimes', () => {
  const seg = { startTime: '13:00', endTime: '14:30' }

  it('予定の途中で押したら今まで', () => {
    expect(checkRecordTimes(seg, 13 * 60 + 40)).toEqual({ startTime: '13:00', endTime: '13:40' })
  })

  it('終わった後・過ぎた日は予定どおり', () => {
    expect(checkRecordTimes(seg, 15 * 60)).toEqual(seg)
    expect(checkRecordTimes(seg, null)).toEqual(seg)
  })

  it('始まる前は予定どおり（縮めない）', () => {
    expect(checkRecordTimes(seg, 12 * 60)).toEqual(seg)
    expect(checkRecordTimes(seg, 0)).toEqual(seg)
  })

  it('24:00 終わりは 0:00 終わりにする', () => {
    expect(checkRecordTimes({ startTime: '23:00', endTime: '24:00' }, null)).toEqual({ startTime: '23:00', endTime: '00:00' })
    expect(checkRecordTimes({ startTime: '23:00', endTime: '24:00' }, 23 * 60 + 30)).toEqual({ startTime: '23:00', endTime: '23:30' })
  })
})

describe('planRecordOn', () => {
  const log = (title: string, startTime: string, endTime: string) => ({ title, startTime, endTime })

  it('同じ題名で予定の時間に重なる記録', () => {
    const logs = [log('ゼミ', '09:00', '10:00'), log('ゼミ', '15:10', '16:00')]
    expect(planRecordOn(logs, 'ゼミ', { startTime: '15:00', endTime: '16:30' })).toBe(logs[1])
  })

  it('題名が違う・重ならない記録は数えない', () => {
    const logs = [log('授業', '15:00', '16:30'), log('ゼミ', '17:00', '18:00')]
    expect(planRecordOn(logs, 'ゼミ', { startTime: '15:00', endTime: '16:30' })).toBeUndefined()
  })

  it('0:00 終わりの記録・予定も重なりを見る', () => {
    const logs = [log('夜勤', '23:00', '00:00')]
    expect(planRecordOn(logs, '夜勤', { startTime: '22:00', endTime: '24:00' })).toBe(logs[0])
  })
})
