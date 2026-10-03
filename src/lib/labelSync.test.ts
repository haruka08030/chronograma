import { describe, expect, it } from 'vitest'
import { planLabelSync } from './labelSync'

const T1 = '2026-10-01T00:00:00.000Z'
const T2 = '2026-10-02T00:00:00.000Z'
const NOW = '2026-10-03T00:00:00.000Z'

describe('ラベル表の同期', () => {
  it('サーバーに無ければ手元を送る', () => {
    const plan = planLabelSync({ presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1 }, null, NOW)
    expect(plan).toEqual({ push: { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 } })
  })

  it('サーバーが新しければ、ほかの端末で変えた名前・色に合わせる（PC で名前を変えたらスマホも）', () => {
    const plan = planLabelSync(
      { presets: ['勉強'], colors: { 勉強: 'sage' }, updatedAt: T1 },
      { labels: [{ name: 'Study', color: 'sage' }], updatedAt: T2 },
      NOW,
    )
    expect(plan.apply).toEqual({ presets: ['Study'], colors: { Study: 'sage' }, updatedAt: T2 })
    expect(plan.push).toBeUndefined()
  })

  it('手元が新しければ送る', () => {
    const plan = planLabelSync(
      { presets: ['授業', 'バイト'], colors: { 授業: 'sage', バイト: 'peacock' }, updatedAt: T2 },
      { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 },
      NOW,
    )
    expect(plan.push?.labels.map((l) => l.name)).toEqual(['授業', 'バイト'])
  })

  it('この端末で初めてなら両方を合わせ、どちらのラベルも消さない', () => {
    const plan = planLabelSync(
      { presets: ['授業', 'ジム'], colors: { 授業: 'tomato', ジム: 'basil' }, updatedAt: null },
      { labels: [{ name: '授業', color: 'sage' }, { name: 'バイト', color: 'peacock' }], updatedAt: T1 },
      NOW,
    )
    expect(plan.apply?.presets).toEqual(['授業', 'バイト', 'ジム'])
    // 同じ名前の色はサーバーの色
    expect(plan.apply?.colors).toMatchObject({ 授業: 'sage', バイト: 'peacock', ジム: 'basil' })
    expect(plan.push?.labels.map((l) => l.name)).toEqual(['授業', 'バイト', 'ジム'])
  })

  it('同じなら何もしない', () => {
    expect(
      planLabelSync({ presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1 }, { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 }, NOW),
    ).toEqual({})
  })
})
