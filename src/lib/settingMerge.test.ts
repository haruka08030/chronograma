import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { merge3, merge3ById, merge3Record, merge3Set } from './settingMerge'
import { DEFAULT_TIMETABLE, normalizeTimetable, planTimetableSync, withAbsence, withAbsenceLimit, type Timetable } from './timetable'
import { DEFAULT_ADDONS, planAddonsSync, withAddonOn, type Addons } from './addons'
import { planEventTemplateSync, type EventTemplate } from './eventTemplates'
import { planCourseLinkSync } from './courseLinks'
import { runSettingSync, saveSettingBase, saveSettingSyncedAt } from './settingSync'
import type { DueItem } from '../../supabase/functions/daily-reminders/dues.ts'

/**
 * 1 つの値に別々に足せる小さなものがたくさん入っている設定・項目は、2 台で別々に足したものをどちらも残す。
 * 前回合わせた版（S0）→ 手元（スマホ）とサーバー（PC が送った版 S1）の両方で変えた場面
 */
const S0 = '2026-10-01T00:00:00.000Z'
const S1 = '2026-10-01T01:00:00.000Z'
const LOCAL_EDIT = '2026-10-01T00:30:00.000Z'
const NOW = '2026-10-01T02:00:00.000Z'

const term: Timetable = normalizeTimetable({ ...DEFAULT_TIMETABLE, termStart: '2026-10-01', termEnd: '2027-01-31' })

const due = (id: string, title: string): DueItem => ({ id, title, date: '2026-10-27', repeat: 'monthly', notifyDays: 1 })

describe('三方向の合わせ方の部品', () => {
  it('1 つの値: 片方だけ変えたらその側、両方なら prefer の側', () => {
    expect(merge3(1, 1, 2, 'l')).toBe(2)
    expect(merge3(1, 3, 1, 'r')).toBe(3)
    const onConflict = vi.fn()
    expect(merge3(1, 3, 2, 'r', onConflict)).toBe(2)
    expect(onConflict).toHaveBeenCalledTimes(1)
    // 片方で消した（無い）も 1 つの値
    expect(merge3<number>(1, undefined, 1, 'r')).toBeUndefined()
  })

  it('集合: 片方で足したものは残し、前回にあって片方で外したものは外す。控えが無ければ両方', () => {
    expect(merge3Set(['a', 'b'], ['a', 'b', 'c'], ['b', 'd'], 'l')).toEqual(['b', 'c', 'd'])
    expect(merge3Set(null, ['a'], ['b'], 'l')).toEqual(['a', 'b'])
  })

  it('id ごと・キーごと', () => {
    const base = [{ id: '1', v: 1 }]
    expect(
      merge3ById(
        base,
        [{ id: '1', v: 2 }],
        [
          { id: '1', v: 1 },
          { id: '2', v: 1 },
        ],
        (x) => x.id,
        'r',
      ),
    ).toEqual([
      { id: '1', v: 2 },
      { id: '2', v: 1 },
    ])
    expect(merge3Record({ a: 1 }, { a: 1, b: 2 }, {}, 'l')).toEqual({ b: 2 })
  })
})

describe('時間割の同期: 両方の端末で変えたら中身ごとに合わせる', () => {
  it('2 台で別々の授業に欠席を足しても、どちらも残る（同じ授業の別の日も）', () => {
    const base = withAbsence(term, '英語', '2026-10-05', true)
    const phone = withAbsence(withAbsence(base, '数学', '2026-10-06', true), '英語', '2026-10-12', true)
    const pc = withAbsence(withAbsenceLimit(base, '化学', 4), '英語', '2026-10-19', true)
    const plan = planTimetableSync(
      { timetable: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { timetable: pc, updatedAt: S1 },
      NOW,
      0,
      base,
    )
    const merged = plan.apply!.timetable
    expect(merged.absences).toEqual({ 英語: ['2026-10-05', '2026-10-12', '2026-10-19'], 数学: ['2026-10-06'] })
    expect(merged.absenceLimits).toEqual({ 化学: 4 })
    // サーバーとも違うので送る（もとにした版はサーバーの版）
    expect(plan.push).toEqual({ timetable: merged, updatedAt: NOW, base: S1 })
    expect(plan.conflicts).toBe(0)
  })

  it('片方で消した欠席は消えたまま（控えがあるとき）。両方が同じ項目を別の値にしたら新しいほう', () => {
    const base = withAbsence(withAbsence(term, '英語', '2026-10-05', true), '英語', '2026-10-12', true)
    const phone = { ...withAbsence(base, '英語', '2026-10-05', false), skipHolidays: true }
    const pc = { ...withAbsence(base, '数学', '2026-10-06', true), skipHolidays: false, termEnd: '2027-02-10' }
    const plan = planTimetableSync(
      { timetable: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { timetable: pc, updatedAt: S1 },
      NOW,
      0,
      base,
    )
    const merged = plan.apply!.timetable
    expect(merged.absences).toEqual({ 英語: ['2026-10-12'], 数学: ['2026-10-06'] })
    expect(merged.skipHolidays).toBe(true)
    expect(merged.termEnd).toBe('2027-02-10')
  })

  it('控えが無ければ、両方の欠席を残す', () => {
    const phone = withAbsence(term, '英語', '2026-10-05', true)
    const pc = withAbsence(term, '数学', '2026-10-06', true)
    const plan = planTimetableSync(
      { timetable: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { timetable: pc, updatedAt: S1 },
      NOW,
      0,
      null,
    )
    expect(Object.keys(plan.apply!.timetable.absences).sort()).toEqual(['数学', '英語'])
  })

  it('片方だけが変えていれば今までどおり（丸ごとその側）', () => {
    const base = withAbsence(term, '英語', '2026-10-05', true)
    const pc = withAbsence(base, '数学', '2026-10-06', true)
    expect(planTimetableSync({ timetable: base, updatedAt: S0, syncedAt: S0 }, { timetable: pc, updatedAt: S1 }, NOW, 0, base)).toEqual({
      apply: { timetable: pc, updatedAt: S1 },
    })
  })
})

describe('追加機能の同期: 両方の端末で変えたら中身ごとに合わせる', () => {
  const base: Addons = { ...DEFAULT_ADDONS, dues: [due('rent', '家賃')], absenceCourses: ['英語'] }

  it('2 台で別々の支払いを足しても、どちらも残る', () => {
    const phone = { ...base, dues: [...base.dues, due('phone', 'スマホ代')] }
    const pc = { ...base, dues: [...base.dues, due('gym', 'ジム')] }
    const plan = planAddonsSync({ addons: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 }, { addons: pc, updatedAt: S1 }, NOW, 0, base)
    expect(plan.apply!.addons.dues.map((d) => d.id)).toEqual(['rent', 'gym', 'phone'])
    expect(plan.push?.addons).toEqual(plan.apply!.addons)
  })

  it('片方で機能をオンにし、もう片方で支払いを足しても、どちらも残る', () => {
    const phone = withAddonOn(base, 'dues', true)
    const pc = { ...base, dues: [...base.dues, due('gym', 'ジム')] }
    const plan = planAddonsSync({ addons: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 }, { addons: pc, updatedAt: S1 }, NOW, 0, base)
    expect(plan.apply!.addons.enabled).toEqual({ dues: true })
    expect(plan.apply!.addons.dues.map((d) => d.id)).toEqual(['rent', 'gym'])
  })

  it('片方で消した支払いは消え、もう片方で直した支払いは直したまま', () => {
    const phone = { ...base, dues: [], googleSkip: ['バイト'] }
    const pc = { ...base, dues: [{ ...base.dues[0]!, notifyDays: 3 }], absenceCourses: ['英語', '数学'] }
    const plan = planAddonsSync({ addons: phone, updatedAt: LOCAL_EDIT, syncedAt: S0 }, { addons: pc, updatedAt: S1 }, NOW, 0, base)
    // 消した側と直した側がぶつかったら新しいほう（サーバー = PC）
    expect(plan.apply!.addons.dues).toEqual([{ ...base.dues[0]!, notifyDays: 3 }])
    expect(plan.apply!.addons.googleSkip).toEqual(['バイト'])
    expect(plan.apply!.addons.absenceCourses).toEqual(['英語', '数学'])
    expect(plan.conflicts).toBe(1)
  })

  it('欠席の一覧の授業（追加機能）と休んだ日（時間割）は、両方の表でどちらも残るので食い違わない', () => {
    const tBase = term
    const aBase = DEFAULT_ADDONS
    // スマホは「英語」を一覧に足して欠席、PC は「数学」を一覧に足して欠席
    const tPhone = withAbsence(tBase, '英語', '2026-10-05', true)
    const aPhone = { ...aBase, absenceCourses: ['英語'] }
    const tPc = withAbsence(tBase, '数学', '2026-10-06', true)
    const aPc = { ...aBase, absenceCourses: ['数学'] }
    const t = planTimetableSync(
      { timetable: tPhone, updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { timetable: tPc, updatedAt: S1 },
      NOW,
      0,
      tBase,
    )
    const a = planAddonsSync({ addons: aPhone, updatedAt: LOCAL_EDIT, syncedAt: S0 }, { addons: aPc, updatedAt: S1 }, NOW, 0, aBase)
    expect(Object.keys(t.apply!.timetable.absences).sort()).toEqual([...a.apply!.addons.absenceCourses].sort())
  })
})

describe('よく入れる予定・授業と科目のつながり: 両方で変えたら id・名前ごと', () => {
  const tpl = (id: string, title: string): EventTemplate => ({ id, title, startTime: '09:00', endTime: '15:00', color: null })

  it('2 台で別々に登録したよく入れる予定をどちらも残す', () => {
    const base = [tpl('a', '早番')]
    const plan = planEventTemplateSync(
      { templates: [...base, tpl('b', '遅番')], updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { templates: [...base, tpl('c', '夜勤')], updatedAt: S1 },
      NOW,
      0,
      base,
    )
    expect(plan.apply!.templates.map((t) => t.id)).toEqual(['a', 'c', 'b'])
    expect(plan.push?.templates).toEqual(plan.apply!.templates)
  })

  it('2 台で別々の授業につないだものをどちらも残す', () => {
    const base = [{ title: '英語', course: 'English I' }]
    const plan = planCourseLinkSync(
      { links: [...base, { title: '数学', course: 'Math' }], updatedAt: LOCAL_EDIT, syncedAt: S0 },
      { links: [...base, { title: '化学', course: 'Chem' }], updatedAt: S1 },
      NOW,
      0,
      base,
    )
    expect(plan.apply!.links.map((l) => l.title)).toEqual(['英語', '化学', '数学'])
  })
})

describe('設定の同期で片方を捨てた回数を数える', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('中身ごとに合わせた設定は、両方が別の値にした数だけ。合わせない設定は両方で変えたら 1 回', async () => {
    const note = vi.fn()
    const userId = 'u1'
    saveSettingSyncedAt(userId, 'timetable', S0)
    saveSettingBase(userId, 'timetable', S0, term)
    const local = { ...term, skipHolidays: true }
    const remote = { timetable: { ...term, skipHolidays: false, termEnd: '2027-02-10' }, updatedAt: S1 }
    let current = { timetable: local, updatedAt: LOCAL_EDIT as string }
    await runSettingSync(
      userId,
      {
        key: 'timetable',
        fetch: async () => remote,
        plan: (r, syncedAt, offset, base) => planTimetableSync({ ...current, syncedAt }, r, NOW, offset, base),
        baseOf: (synced) => synced.timetable,
        localUpdatedAt: () => current.updatedAt,
        applyLocal: (a) => {
          current = { timetable: a.timetable, updatedAt: a.updatedAt }
        },
        setLocalUpdatedAt: (at) => {
          current = { ...current, updatedAt: at }
        },
        push: async (p) => ({ updatedAt: `${p.updatedAt}#server` }),
      },
      { onConflicts: note },
    )
    // 祝日（手元だけ）と学期の終わり（サーバーだけ）はどちらも残り、捨てたものは無い
    expect(current.timetable.skipHolidays).toBe(true)
    expect(current.timetable.termEnd).toBe('2027-02-10')
    expect(note).not.toHaveBeenCalled()

    // 合わせない設定（他のタイムゾーン）: 両方で変えて新しいほうにしたら表の名前で 1 回
    saveSettingSyncedAt(userId, 'zones', S0)
    await runSettingSync(
      userId,
      {
        key: 'zones',
        fetch: async () => ({ updatedAt: S1 }),
        plan: () => ({ apply: { updatedAt: S1 } }),
        localUpdatedAt: () => LOCAL_EDIT,
        applyLocal: () => {},
        setLocalUpdatedAt: () => {},
        push: async () => ({ updatedAt: S1 }),
      },
      { onConflicts: note },
    )
    expect(note).toHaveBeenCalledWith({ 'settings.zones': 1 })
  })
})
