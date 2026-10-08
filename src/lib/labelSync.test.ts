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
      {
        labels: [
          { name: '授業', color: 'sage' },
          { name: 'バイト', color: 'peacock' },
        ],
        updatedAt: T1,
      },
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
      {
        labels: [
          { name: '授業', color: 'lavender' },
          { name: '勉強', color: 'amethyst' },
        ],
        updatedAt: T1,
      },
      NOW,
    )
    expect(plan.apply).toEqual({ presets: ['授業', '勉強'], colors: { 授業: 'lavender', 勉強: 'amethyst' }, updatedAt: T1 })
    expect(plan.push).toBeUndefined()
  })

  it('同じ中身なら、もとにした版をそろえるだけ', () => {
    expect(
      planLabelSync(
        { presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1 },
        { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 },
        NOW,
      ),
    ).toEqual({ adopt: T1 })
  })

  it('もとにした版のままで手元も変えていなければ何もしない', () => {
    expect(
      planLabelSync(
        { presets: ['授業'], colors: { 授業: 'sage' }, updatedAt: T1, syncedAt: T1 },
        { labels: [{ name: '授業', color: 'sage' }], updatedAt: T1 },
        NOW,
      ),
    ).toEqual({})
  })
})

describe('ラベル表の同期（サーバーの時計の版）', () => {
  const S1 = '2026-10-01T00:00:00.123456+00:00'
  const S2 = '2026-10-01T00:05:00.654321+00:00'
  const FAST = '2027-01-01T00:00:00.000Z' // 時計が進んだ端末で変えた時刻

  it('手元で変えていて、サーバーがもとにした版のままなら、その版を付けて送る', () => {
    const plan = planLabelSync(
      { presets: ['授業', 'ジム'], colors: {}, updatedAt: T2, syncedAt: S1 },
      { labels: [{ name: '授業', color: '' }], updatedAt: S1 },
      NOW,
    )
    expect(plan.push).toEqual({
      labels: [
        { name: '授業', color: '' },
        { name: 'ジム', color: '' },
      ],
      updatedAt: T2,
      base: S1,
    })
  })

  it('ほかの端末が変えていて手元は変えていなければ、手元の時計が進んでいてもサーバーに合わせる', () => {
    // 前は手元の時刻（時計が進んでいる）とサーバーの時刻を比べ、進んだ端末の古い値がいつも勝っていた
    const plan = planLabelSync(
      { presets: ['授業'], colors: {}, updatedAt: S1, syncedAt: S1 },
      { labels: [{ name: 'Study', color: '' }], updatedAt: S2 },
      NOW,
    )
    expect(plan.apply).toEqual({ presets: ['Study'], colors: {}, updatedAt: S2 })
    expect(plan.push).toBeUndefined()
  })

  it('時計が進んだ端末でも、手元で変えていなければ送らない（サーバーが付けた版のほうが前でも）', () => {
    const plan = planLabelSync(
      { presets: ['授業'], colors: {}, updatedAt: S2, syncedAt: S2 },
      { labels: [{ name: '授業', color: '' }], updatedAt: S2 },
      FAST,
    )
    expect(plan).toEqual({})
  })

  it('両方で変えたときは名前ごとに合わせ、並びは手元の編集時刻をサーバーの時計に直して新しいほう', () => {
    const local = { presets: ['手元'], colors: {}, updatedAt: FAST, syncedAt: S1 }
    const remote = { labels: [{ name: '他端末', color: '' }], updatedAt: S2 }
    // 時計が進んでいなければ手元が新しい（手元の並びが先）
    const p0 = planLabelSync(local, remote, NOW, 0)
    expect(p0.push?.base).toBe(S2)
    expect(p0.apply?.presets).toEqual(['手元', '他端末'])
    // 3 か月進んでいる端末なら、直すとサーバーのほうが新しい（サーバーの並びが先）
    const offset = Date.parse(S2) - Date.parse(FAST) - 1000
    expect(planLabelSync(local, remote, NOW, offset).apply?.presets).toEqual(['他端末', '手元'])
  })
})

describe('ラベルの週の目安の同期（#291）', () => {
  const S1 = '2026-10-01T00:00:00.123456+00:00'
  const S2 = '2026-10-01T00:05:00.654321+00:00'
  const L1 = '2026-10-01T00:03:00.000Z'

  it('目安のある行だけ weeklyTargetMinutes を足して送る（目安の無い行は前の版と同じ形）', () => {
    const plan = planLabelSync(
      { presets: ['勉強', 'バイト'], colors: { 勉強: 'sage', バイト: 'peacock' }, targets: { 勉強: 900 }, updatedAt: T1 },
      null,
      NOW,
    )
    expect(plan.push?.labels).toEqual([
      { name: '勉強', color: 'sage', weeklyTargetMinutes: 900 },
      { name: 'バイト', color: 'peacock' },
    ])
  })

  it('送った行を別の端末で読むと目安も届き、サーバーで外されていれば手元も外れる', () => {
    const pushed = planLabelSync(
      { presets: ['勉強', 'ES'], colors: { 勉強: 'sage', ES: 'tomato' }, targets: { 勉強: 900, ES: 300 }, updatedAt: T1 },
      null,
      NOW,
    ).push!
    // jsonb を通しても形が変わらない
    const remote = { labels: JSON.parse(JSON.stringify(pushed.labels)), updatedAt: T2 }
    const b = planLabelSync({ presets: ['勉強', 'ES'], colors: { 勉強: 'sage', ES: 'tomato' }, updatedAt: T1, syncedAt: T1 }, remote, NOW)
    expect(b.apply).toEqual({
      presets: ['勉強', 'ES'],
      colors: { 勉強: 'sage', ES: 'tomato' },
      targets: { 勉強: 900, ES: 300 },
      updatedAt: T2,
    })
    // 目安だけ違っても「同じ中身」にはしない（サーバーで外されたら手元も外れる）
    const cleared = planLabelSync(
      { presets: ['勉強'], colors: { 勉強: 'sage' }, targets: { 勉強: 900 }, updatedAt: S1, syncedAt: S1 },
      { labels: [{ name: '勉強', color: 'sage' }], updatedAt: S2 },
      NOW,
    )
    expect(cleared.apply).toEqual({ presets: ['勉強'], colors: { 勉強: 'sage' }, updatedAt: S2 })
  })

  it('2 台で別々に変えても、名前ごとの合わせで目安は残る（同じ名前は新しいほう、外したのも新しいほう）', () => {
    // 手元: 勉強に 15 時間を付け、ES の目安を外した。サーバー（もう 1 台）: ゼミを足して 3 時間、ES は 5 時間のまま
    const plan = planLabelSync(
      { presets: ['勉強', 'ES'], colors: { 勉強: 'sage', ES: 'tomato' }, targets: { 勉強: 900 }, updatedAt: L1, syncedAt: S1 },
      {
        labels: [
          { name: '勉強', color: 'sage' },
          { name: 'ES', color: 'tomato', weeklyTargetMinutes: 300 },
          { name: 'ゼミ', color: 'grape', weeklyTargetMinutes: 180 },
        ],
        updatedAt: S2,
      },
      NOW,
      // 手元の編集のほうが新しい
      Date.parse(S2) - Date.parse(L1) + 60_000,
    )
    expect(plan.apply?.presets).toEqual(['勉強', 'ES', 'ゼミ'])
    expect(plan.apply?.targets).toEqual({ 勉強: 900, ゼミ: 180 })
    expect(plan.push?.labels).toEqual([
      { name: '勉強', color: 'sage', weeklyTargetMinutes: 900 },
      { name: 'ES', color: 'tomato' },
      { name: 'ゼミ', color: 'grape', weeklyTargetMinutes: 180 },
    ])
    expect(plan.push?.base).toBe(S2)
  })

  it('2 台で変えてサーバーのほうが新しければ、同じ名前の目安はサーバー、手元にしか無いラベルの目安は残す', () => {
    const plan = planLabelSync(
      {
        presets: ['勉強', '読書'],
        colors: { 勉強: 'sage', 読書: 'basil' },
        targets: { 勉強: 600, 読書: 120 },
        updatedAt: L1,
        syncedAt: S1,
      },
      { labels: [{ name: '勉強', color: 'sage', weeklyTargetMinutes: 900 }], updatedAt: S2 },
      NOW,
    )
    expect(plan.apply?.presets).toEqual(['勉強', '読書'])
    expect(plan.apply?.targets).toEqual({ 勉強: 900, 読書: 120 })
    expect(plan.push?.labels.find((l) => l.name === '読書')).toMatchObject({ weeklyTargetMinutes: 120 })
  })

  it('この端末で初めてなら、どちらかに付いている目安を残す（両方にあればサーバー）', () => {
    const plan = planLabelSync(
      { presets: ['勉強', 'ジム'], colors: {}, targets: { 勉強: 300, ジム: 120 }, updatedAt: null },
      {
        labels: [
          { name: '勉強', color: 'sage', weeklyTargetMinutes: 900 },
          { name: 'ES', color: 'tomato' },
        ],
        updatedAt: T1,
      },
      NOW,
    )
    expect(plan.apply?.targets).toEqual({ 勉強: 900, ジム: 120 })
    expect(plan.push?.labels.find((l) => l.name === 'ジム')).toMatchObject({ weeklyTargetMinutes: 120 })
  })

  it('壊れた目安（0・文字）は読まない', () => {
    const plan = planLabelSync(
      { presets: ['勉強'], colors: {}, updatedAt: T1, syncedAt: T1 },
      {
        labels: [
          { name: '勉強', color: 'sage', weeklyTargetMinutes: 0 },
          { name: 'ES', color: 'tomato', weeklyTargetMinutes: 'x' as unknown as number },
        ],
        updatedAt: T2,
      },
      NOW,
    )
    expect(plan.apply?.targets).toBeUndefined()
  })
})
