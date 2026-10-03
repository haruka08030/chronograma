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
