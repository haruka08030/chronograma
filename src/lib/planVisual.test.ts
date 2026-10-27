import { describe, expect, it } from 'vitest'
import { NEUTRAL_HEX } from './googleColors'
import { googleEventVisualState, planDotClass, planDotHex, PASSED_HEX, planTileClass, planVisualState } from './planVisual'

describe('planVisual: 予定の見せ方（#641）', () => {
  const now = new Date(2026, 9, 7, 12, 0)

  it('時間が過ぎた予定は完了・未完了とも灰色、これからはラベルの色。ラベルなしは塗らずに縁だけで、過ぎた灰色と分ける', () => {
    expect(planTileClass(planVisualState({ completed: false, startTime: '09:00', endTime: '10:00' }, '2026-10-07', now), '#039BE5')).toBe(
      'gc-missed',
    )
    expect(planTileClass(planVisualState({ completed: true, startTime: '15:00', endTime: '16:00' }, '2026-10-07', now), '#039BE5')).toBe(
      'gc-missed',
    )
    expect(planTileClass(planVisualState({ completed: false, startTime: '15:00', endTime: '16:00' }, '2026-10-07', now), '#039BE5')).toBe(
      'gc-plan',
    )
    expect(planTileClass('upcoming', NEUTRAL_HEX)).toBe('gc-plan-none')
    expect(planTileClass('missed', NEUTRAL_HEX)).toBe('gc-missed')
    expect(planDotClass('upcoming', NEUTRAL_HEX)).toBe('gc-dot-none')
    expect(planDotClass('missed', NEUTRAL_HEX)).toBe('gc-dot')
    expect(planDotHex('missed', '#039BE5')).toBe(PASSED_HEX)
  })

  it('Google の予定も同じ条件（終日はその日の終わりを過ぎたら）', () => {
    expect(googleEventVisualState({ startTime: '09:00', endTime: '10:00' }, '2026-10-07', now)).toBe('missed')
    expect(googleEventVisualState({ startTime: null, endTime: null }, '2026-10-07', now)).toBe('upcoming')
    expect(googleEventVisualState({ startTime: null, endTime: null }, '2026-10-06', now)).toBe('missed')
  })
})
