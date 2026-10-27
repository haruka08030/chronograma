import { describe, expect, it } from 'vitest'
import { sleepFromTimer } from './sleepTimer'
import { planSleepTimerSync } from './settingPlans'

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()

describe('sleepFromTimer（寝た時刻から今までを 1 晩の睡眠に）', () => {
  it('日をまたいだら、起きた日の朝の睡眠にする', () => {
    expect(sleepFromTimer({ startedAt: local(7, 23, 30) }, local(8, 7, 5))).toEqual({
      wakeDateKey: '2026-10-08',
      bedTime: '23:30',
      wakeTime: '07:05',
    })
  })

  it('0 時を過ぎてから寝ても同じ日の朝', () => {
    expect(sleepFromTimer({ startedAt: local(8, 1, 0) }, local(8, 6, 30))).toEqual({
      wakeDateKey: '2026-10-08',
      bedTime: '01:00',
      wakeTime: '06:30',
    })
  })

  it('1 分未満（押し間違い）と、16 時間より長い（止め忘れ）は睡眠にしない', () => {
    expect(sleepFromTimer({ startedAt: local(8, 1, 0) }, new Date(new Date(2026, 9, 8, 1, 0, 30)).toISOString())).toBeNull()
    expect(sleepFromTimer({ startedAt: local(7, 23, 0) }, local(8, 15, 30))).toBeNull()
  })
})

describe('planSleepTimerSync', () => {
  const T = { startedAt: '2026-10-07T14:30:00.000Z' }
  it('一度も押していなければ送らない', () => {
    expect(planSleepTimerSync({ timer: null, updatedAt: null }, null)).toEqual({})
  })

  it('サーバーに行が無く、手元で寝たら送る', () => {
    expect(planSleepTimerSync({ timer: T, updatedAt: 'a' }, null)).toEqual({ push: { timer: T, updatedAt: 'a', base: null } })
  })

  it('ほかの端末で寝た・起きたら合わせる（手元は前回から変えていない）', () => {
    const synced = { timer: null, updatedAt: 's1', syncedAt: 's1' }
    expect(planSleepTimerSync(synced, { timer: T, updatedAt: 's2' })).toEqual({ apply: { timer: T, updatedAt: 's2' } })
    expect(planSleepTimerSync({ ...synced, timer: T }, { timer: null, updatedAt: 's2' })).toEqual({
      apply: { timer: null, updatedAt: 's2' },
    })
  })

  it('手元だけで起きたら送る', () => {
    expect(
      planSleepTimerSync({ timer: null, updatedAt: '2026-10-08T00:00:00.000Z', syncedAt: 's1' }, { timer: T, updatedAt: 's1' }),
    ).toEqual({
      push: { timer: null, updatedAt: '2026-10-08T00:00:00.000Z', base: 's1' },
    })
  })
})
