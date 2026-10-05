import { describe, expect, it } from 'vitest'
import { planLabelSync } from './labelSync'

const T1 = '2026-10-01T00:00:00.000Z'
const T2 = '2026-10-02T00:00:00.000Z'
const NOW = '2026-10-03T00:00:00.000Z'

describe('ラベル表の同期', () => {
  it('サーバーに無ければ手元を送る', () => {
    const plan = planLabelSync({ presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1 }, null, NOW)
    expect(plan).toEqual({ push: { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1, base: null } })
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

  it('この端末で初めてでも、手元が別の言語の初期ラベルのままならサーバーに合わせる（英語の Study… を足さない）', () => {
    const en = ['Study', 'Assignments', 'Job hunting', 'Work', 'Exercise', 'Chores', 'Break']
    const plan = planLabelSync(
      { presets: en, colors: Object.fromEntries(en.map((n) => [n, 'sage'])), updatedAt: null },
      { labels: [{ name: '授業', color: 'lavender' }, { name: '勉強', color: 'amethyst' }], updatedAt: T1 },
      NOW,
    )
    expect(plan.apply).toEqual({ presets: ['授業', '勉強'], colors: { 授業: 'lavender', 勉強: 'amethyst' }, updatedAt: T1 })
    expect(plan.push).toBeUndefined()
  })

  it('同じ中身なら、もとにした版をそろえるだけ', () => {
    expect(
      planLabelSync({ presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1 }, { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 }, NOW),
    ).toEqual({ adopt: T1 })
  })

  it('もとにした版のままで手元も変えていなければ何もしない', () => {
    expect(
      planLabelSync({ presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1, syncedAt: T1 }, { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 }, NOW),
    ).toEqual({})
  })
})

describe('ラベル表の同期（サーバーの時計の版）', () => {
  const S1 = '2026-10-01T00:00:00.123456+00:00'
  const S2 = '2026-10-01T00:05:00.654321+00:00'
  const FAST = '2027-01-01T00:00:00.000Z' // 時計が進んだ端末で変えた時刻

  it('手元で変えていて、サーバーがもとにした版のままなら、その版を付けて送る', () => {
    const plan = planLabelSync({ presets: ['授業', 'ジム'], colors: {}, updatedAt: T2, syncedAt: S1 }, { labels: [{ name: '授業', color: '' }], updatedAt: S1 }, NOW)
    expect(plan.push).toEqual({ labels: [{ name: '授業', color: '' }, { name: 'ジム', color: '' }], updatedAt: T2, base: S1 })
  })

  it('ほかの端末が変えていて手元は変えていなければ、手元の時計が進んでいてもサーバーに合わせる', () => {
    // 前は手元の時刻（時計が進んでいる）とサーバーの時刻を比べ、進んだ端末の古い値がいつも勝っていた
    const plan = planLabelSync({ presets: ['授業'], colors: {}, updatedAt: S1, syncedAt: S1 }, { labels: [{ name: 'Study', color: '' }], updatedAt: S2 }, NOW)
    expect(plan.apply).toEqual({ presets: ['Study'], colors: {}, updatedAt: S2 })
    expect(plan.push).toBeUndefined()
  })

  it('時計が進んだ端末でも、手元で変えていなければ送らない（サーバーが付けた版のほうが前でも）', () => {
    const plan = planLabelSync({ presets: ['授業'], colors: {}, updatedAt: S2, syncedAt: S2 }, { labels: [{ name: '授業', color: '' }], updatedAt: S2 }, FAST)
    expect(plan).toEqual({})
  })

  it('両方で変えたときは、手元の編集時刻をサーバーの時計に直して比べる', () => {
    const local = { presets: ['手元'], colors: {}, updatedAt: FAST, syncedAt: S1 }
    const remote = { labels: [{ name: '他端末', color: '' }], updatedAt: S2 }
    // 時計が進んでいなければ手元が新しい
    expect(planLabelSync(local, remote, NOW, 0).push?.base).toBe(S2)
    // 3 か月進んでいる端末なら、直すとサーバーのほうが新しい
    const offset = Date.parse(S2) - Date.parse(FAST) - 1000
    expect(planLabelSync(local, remote, NOW, offset).apply?.presets).toEqual(['他端末'])
  })
})
