import { describe, expect, it } from 'vitest'
import { layoutOverlaps, layoutPlanAndLog } from './overlapLayout'

describe('layoutOverlaps', () => {
  it('時間が重なる項目は列を分ける', () => {
    const slots = layoutOverlaps([
      { id: 'a', top: 0, height: 60 },
      { id: 'b', top: 30, height: 60 },
    ])
    expect(slots.get('a')).toEqual({ col: 0, cols: 2 })
    expect(slots.get('b')).toEqual({ col: 1, cols: 2 })
  })

  it('最小高さで見た目が重なっても、時間が重ならなければ全幅のまま', () => {
    // 5 分の記録（実際 4px）を 18px に引き伸ばして描き、その直後に次の記録がある
    const slots = layoutOverlaps([
      { id: 'short', top: 0, height: 18, span: 4 },
      { id: 'next', top: 4, height: 60, span: 60 },
    ])
    expect(slots.get('short')).toEqual({ col: 0, cols: 1 })
    expect(slots.get('next')).toEqual({ col: 0, cols: 1 })
  })
})

describe('layoutPlanAndLog', () => {
  it('見た目がかぶる後の記録を上に出す', () => {
    const styles = layoutPlanAndLog(
      [],
      [
        { id: 'short', top: 0, height: 18, span: 4 },
        { id: 'next', top: 4, height: 60, span: 60 },
      ],
      'columns',
    )
    expect(styles.get('log:short')?.width).toBe('calc(100% - 4px)')
    expect(styles.get('log:next')?.width).toBe('calc(100% - 4px)')
    expect(Number(styles.get('log:next')?.zIndex)).toBeGreaterThan(Number(styles.get('log:short')?.zIndex ?? 0))
  })
})

describe('layoutPlanAndLog: 予定と記録の左右分け', () => {
  // バイト 18:00–21:00 と ES を書く 20:00–21:00（1 時間 = 60px）
  const plans = [
    { id: 'shift', top: 0, height: 180 },
    { id: 'es', top: 120, height: 60 },
  ]

  it('記録の無い時間帯の予定は全幅を使い、重なりはずらし重ね', () => {
    const styles = layoutPlanAndLog(plans, [], 'cascade')
    expect(styles.get('plan:shift')).toMatchObject({ left: 'calc(0% + 2px)', width: 'calc(100% - 4px)' })
    expect(styles.get('plan:es')).toMatchObject({ left: 'calc(0% + 16px)', width: 'calc(100% - 18px)' })
  })

  it('記録と重なる塊だけ 予定=左半分 / 記録=右半分 に分ける', () => {
    const styles = layoutPlanAndLog([...plans, { id: 'morning', top: 600, height: 60 }], [{ id: 'log', top: 30, height: 60 }], 'cascade')
    expect(styles.get('plan:shift')).toMatchObject({ left: 'calc(0% + 2px)', width: 'calc(50% - 4px)' })
    expect(styles.get('plan:es')).toMatchObject({ left: 'calc(0% + 16px)', width: 'calc(50% - 18px)' })
    expect(styles.get('log:log')).toMatchObject({ left: 'calc(50% + 2px)', width: 'calc(50% - 4px)' })
    // 記録と重ならない予定は全幅
    expect(styles.get('plan:morning')).toMatchObject({ left: 'calc(0% + 2px)', width: 'calc(100% - 4px)' })
  })

  it('fixedLanes（今日の計画の 1 日表示）は記録が無くても 予定=左半分', () => {
    const styles = layoutPlanAndLog(plans, [], 'columns', true)
    expect(styles.get('plan:shift')).toMatchObject({ left: 'calc(0% + 2px)', width: 'calc(25% - 4px)' })
    expect(styles.get('plan:es')).toMatchObject({ left: 'calc(25% + 2px)', width: 'calc(25% - 4px)' })
  })
})
