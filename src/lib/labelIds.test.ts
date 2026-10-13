import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { INBOX_ID } from '../store/storeConstants'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  compactLabelIds,
  effectiveLabelIds,
  fillLabelIds,
  labelIndex,
  legacyLabelId,
  relabelTasks,
  resolveIncomingLabels,
  type LabelTableState,
} from './labelIds'

const AT = '2026-10-01T00:00:00.000Z'
const PEACOCK = '#039BE5'
const SAGE = '#33B679'
const TOMATO = '#D50000'

function task(id: string, over: Partial<Task>): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: AT,
    updatedAt: AT,
    order: 0,
    listId: INBOX_ID,
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  } as Task
}
const log = (id: string, category: string | null, over: Partial<Task> = {}) =>
  task(id, { kind: 'log', category, tags: category ? [category] : [], ...over })
const todo = (id: string, color: string | null, over: Partial<Task> = {}) => task(id, { color, ...over })

const table = (presets: string[], colors: Record<string, string>, ids: Record<string, string> = {}): LabelTableState => ({
  timeLogTagPresets: presets,
  logCategoryColors: colors,
  logLabelIds: ids,
})
const MATH = legacyLabelId('数学')
const ENG = legacyLabelId('英語')

describe('ラベルの id（#365）', () => {
  it('名前から決まる id は uuid の形で、いつも同じ（033 の md5(...)::uuid と同じ）', () => {
    expect(legacyLabelId('授業')).toBe('96c4810d-5f65-f512-4cc6-339e5fbcf9ff')
    expect(legacyLabelId('数学')).toBe(MATH)
    expect(MATH).not.toBe(ENG)
  })

  it('名前を変えたラベルは書いておいた id のまま。元の名前で作り直したラベルは重ならない id になる', () => {
    const ids = effectiveLabelIds(['数学II', '数学'], { 数学II: MATH })
    expect(ids.get('数学II')).toBe(MATH)
    expect(ids.get('数学')).not.toBe(MATH)
    // 並びを変えても同じ
    expect(effectiveLabelIds(['数学', '数学II'], { 数学II: MATH }).get('数学')).toBe(ids.get('数学'))
    // 書いておくのは名前から決まる id と違うものだけ
    expect(compactLabelIds(['数学II', '数学', '英語'], effectiveLabelIds(['数学II', '数学', '英語'], { 数学II: MATH }))).toEqual({
      数学II: MATH,
      数学: ids.get('数学'),
    })
  })

  it('名前・色の変更では、行の名前・色をその id のラベルの今の名前・色にし、updatedAt は変えない', () => {
    const before = labelIndex(table(['数学', '英語'], { 数学: 'peacock', 英語: 'sage' }))
    const after = labelIndex(table(['数学II', '英語'], { 数学II: 'tomato', 英語: 'sage' }, { 数学II: MATH }))
    const tasks = [log('r1', '数学', { labelId: MATH }), todo('t1', PEACOCK, { labelId: MATH }), log('r2', '英語'), todo('t2', SAGE)]
    const out = relabelTasks(tasks, before, after)
    expect(out.map((t) => [t.category, t.color, t.labelId, t.updatedAt])).toEqual([
      ['数学II', null, MATH, AT],
      [null, TOMATO, MATH, AT],
      ['英語', null, ENG, AT],
      [null, SAGE, ENG, AT],
    ])
    expect(out[0]!.tags).toEqual(['数学II'])
    // 何も変わらなければ同じ配列
    expect(relabelTasks(out, after, after)).toBe(out)
  })

  it('名前・色を直したばかりの行（id と食い違う）は名前・色が正', () => {
    const idx = labelIndex(table(['数学', '英語'], { 数学: 'peacock', 英語: 'sage' }))
    const after = labelIndex(table(['数学', 'English'], { 数学: 'peacock', English: 'sage' }, { English: ENG }))
    const out = relabelTasks([log('r1', '英語', { labelId: MATH })], idx, after)
    expect(out[0]).toMatchObject({ category: 'English', labelId: ENG })
  })

  it('取得した行は id が正（古い名前・色のまま届いても今の名前・色で読む）。id の無い行は名前・色から付ける', () => {
    const idx = labelIndex(table(['数学II', '英語'], { 数学II: 'tomato', 英語: 'sage' }, { 数学II: MATH }))
    const out = resolveIncomingLabels(
      [log('r1', '数学', { labelId: MATH }), todo('t1', PEACOCK, { labelId: MATH }), log('r2', '英語'), todo('t2', '#123456')],
      idx,
    )
    expect(out.map((t) => [t.category, t.color, t.labelId])).toEqual([
      ['数学II', null, MATH],
      [null, TOMATO, MATH],
      ['英語', null, ENG],
      [null, '#123456', undefined],
    ])
    // まだ表に無い id（別の端末で作ったばかりのラベル）はそのまま。表が届いたら読み替える
    const fresh = legacyLabelId('物理')
    const early = resolveIncomingLabels([log('r3', '物理', { labelId: fresh })], idx)
    expect(early[0]!.labelId).toBe(fresh)
    const arrived = labelIndex(table(['数学II', '英語', '物理'], { 数学II: 'tomato', 英語: 'sage', 物理: 'grape' }, { 数学II: MATH }))
    expect(relabelTasks(early, idx, arrived)[0]).toMatchObject({ category: '物理', labelId: fresh })
  })

  it('id の付け忘れだけを名前・色から付ける（付いている id はそのまま）', () => {
    const idx = labelIndex(table(['数学'], { 数学: 'peacock' }))
    const tasks = [log('r1', '数学'), todo('t1', PEACOCK), todo('t2', null), log('r2', '数学', { labelId: ENG })]
    const out = fillLabelIds(tasks, idx)
    expect(out.map((t) => t.labelId)).toEqual([MATH, MATH, undefined, ENG])
    expect(out[2]).toBe(tasks[2])
    expect(fillLabelIds(out, idx)).toBe(out)
  })
})
