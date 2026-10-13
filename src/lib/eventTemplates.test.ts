import { describe, expect, it } from 'vitest'
import {
  EVENT_TEMPLATE_MAX,
  EVENT_TEMPLATE_TITLE_MAX,
  isValidTemplateRange,
  normalizeEventTemplates,
  planEventTemplateSync,
  templateDays,
  templateEventOnDay,
  templateTimeLabel,
  type EventTemplate,
} from './eventTemplates'
import { TASK_DEFAULTS } from './taskDefaults'
import type { Task } from '../types/task'

const T1 = '2026-10-01T00:00:00.000Z'
const T2 = '2026-10-02T00:00:00.000Z'
const NOW = '2026-10-03T00:00:00.000Z'

const early: EventTemplate = { id: 'e', title: 'バイト 早番', startTime: '09:00', endTime: '15:00', color: null }
const late: EventTemplate = { id: 'l', title: 'バイト 遅番', startTime: '17:00', endTime: '22:00', color: '#039BE5' }

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: late.title,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: T1,
    updatedAt: T1,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: null,
    scheduledDate: '2026-10-06',
    startTime: late.startTime,
    endTime: late.endTime,
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'event',
    ...over,
  }) as Task

describe('よく入れる予定の読み込み', () => {
  it('名前が空・時刻が使えない・id が重なる行は外す。名前は前後の空白を落とす', () => {
    expect(
      normalizeEventTemplates([
        { ...early, title: '  バイト 早番  ' },
        { ...late, title: '   ' },
        { ...late, id: 'x', startTime: '25:00' },
        { ...late, id: 'y', startTime: '18:00', endTime: '17:00' },
        { ...early, title: '重なり' },
        null,
        'x',
        late,
      ]),
    ).toEqual([early, late])
  })

  it('色は #RRGGBB だけ（大文字にそろえる）。それ以外はラベルなし', () => {
    const [a, b] = normalizeEventTemplates([
      { ...early, color: '#039be5' },
      { ...late, color: 'blue' },
    ])
    expect(a!.color).toBe('#039BE5')
    expect(b!.color).toBeNull()
  })

  it('名前は上限で切り、数は上限まで', () => {
    const [one] = normalizeEventTemplates([{ ...early, title: 'あ'.repeat(EVENT_TEMPLATE_TITLE_MAX + 10) }])
    expect(one!.title).toHaveLength(EVENT_TEMPLATE_TITLE_MAX)
    const many = Array.from({ length: EVENT_TEMPLATE_MAX + 5 }, (_, i) => ({ ...early, id: `t${i}` }))
    expect(normalizeEventTemplates(many)).toHaveLength(EVENT_TEMPLATE_MAX)
  })

  it('配列でなければ空', () => {
    expect(normalizeEventTemplates(undefined)).toEqual([])
    expect(normalizeEventTemplates({})).toEqual([])
  })
})

describe('時刻', () => {
  it('終わりは始まりより後。0:00 終わりはその日の終わりまで（日はまたげない）', () => {
    expect(isValidTemplateRange('17:00', '22:00')).toBe(true)
    expect(isValidTemplateRange('22:00', '00:00')).toBe(true)
    expect(isValidTemplateRange('22:00', '02:00')).toBe(false)
    expect(isValidTemplateRange('09:00', '09:00')).toBe(false)
    expect(isValidTemplateRange('', '09:00')).toBe(false)
    expect(isValidTemplateRange('9:00', '10:00')).toBe(false)
  })

  it('一覧に出す時刻は先頭の 0 を落とす', () => {
    expect(templateTimeLabel(early)).toBe('9:00–15:00')
    expect(templateTimeLabel(late, '〜')).toBe('17:00〜22:00')
  })
})

describe('その日に入っているか', () => {
  it('名前と時刻が同じ予定だけ。To-Do・消した予定・時刻の違う予定は数えない', () => {
    const tasks = [
      task('todo', { kind: 'todo' }),
      task('gone', { deletedAt: T2 }),
      task('other', { startTime: '18:00' }),
      task('hit', { title: ' バイト 遅番 ' }),
      task('next', { scheduledDate: '2026-10-08' }),
    ]
    expect(templateEventOnDay(tasks, late, '2026-10-06')?.id).toBe('hit')
    expect(templateEventOnDay(tasks, late, '2026-10-07')).toBeUndefined()
    expect([...templateDays(tasks, late)].sort()).toEqual(['2026-10-06', '2026-10-08'])
  })
})

describe('よく入れる予定の同期', () => {
  it('サーバーに行が無ければ送る（行が無いはずの版）', () => {
    expect(planEventTemplateSync({ templates: [late], updatedAt: T1, syncedAt: null }, null, NOW)).toEqual({
      push: { templates: [late], updatedAt: T1, base: null },
    })
  })

  it('この端末で初めて合わせるときは、サーバーの並びのあとに手元にしか無いものを足して送る', () => {
    expect(
      planEventTemplateSync({ templates: [late, early], updatedAt: null }, { templates: [{ ...late, title: '遅番' }], updatedAt: T1 }, NOW),
    ).toEqual({
      apply: { templates: [{ ...late, title: '遅番' }, early], updatedAt: NOW },
      push: { templates: [{ ...late, title: '遅番' }, early], updatedAt: NOW, base: T1 },
    })
  })

  it('この端末でまだ一度も合わせていないのに手元で登録していた（ログインする前など）: 新しいほうで上書きせず両方を残す', () => {
    expect(planEventTemplateSync({ templates: [early], updatedAt: T2, syncedAt: null }, { templates: [late], updatedAt: T1 }, NOW)).toEqual(
      {
        apply: { templates: [late, early], updatedAt: NOW },
        push: { templates: [late, early], updatedAt: NOW, base: T1 },
      },
    )
  })

  it('手元を変えていなくてサーバーが変わっていたら合わせる', () => {
    expect(planEventTemplateSync({ templates: [late], updatedAt: T1, syncedAt: T1 }, { templates: [early], updatedAt: T2 }, NOW)).toEqual({
      apply: { templates: [early], updatedAt: T2 },
    })
  })

  it('手元だけ変えていたら、もとにした版を付けて送る', () => {
    expect(
      planEventTemplateSync({ templates: [late, early], updatedAt: T2, syncedAt: T1 }, { templates: [late], updatedAt: T1 }, NOW),
    ).toEqual({ push: { templates: [late, early], updatedAt: T2, base: T1 } })
  })

  it('中身が同じなら時刻だけそろえる', () => {
    expect(planEventTemplateSync({ templates: [late], updatedAt: T2, syncedAt: T1 }, { templates: [late], updatedAt: T2 }, NOW)).toEqual({
      adopt: T2,
    })
  })
})
