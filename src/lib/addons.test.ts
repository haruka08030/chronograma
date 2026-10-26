import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { DEFAULT_ADDONS, addonsWithEventColors, isAddonOn, mergeAddons, normalizeAddons, splitEventColors, withAddonOn } from './addons'
import { planAddonsSync } from './settingPlans'

const NOW = '2026-10-08T00:00:00.000Z'
const weekly = (extra: Partial<Task> = {}) =>
  ({
    ...TASK_DEFAULTS,
    id: 'c1',
    title: '経済学入門',
    kind: 'event',
    scheduledDate: '2026-10-12',
    startTime: '09:00',
    endTime: '10:30',
    series: { id: 's', weekdays: [1], until: '2027-01-31', skipHolidays: false },
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }) as Task

describe('追加機能（#453）', () => {
  it('学校は、決めていなければ毎週の予定がある人だけオン。決めたらその値', () => {
    expect(isAddonOn(DEFAULT_ADDONS, 'school', [])).toBe(false)
    expect(isAddonOn(DEFAULT_ADDONS, 'school', [weekly()])).toBe(true)
    expect(isAddonOn(DEFAULT_ADDONS, 'school', [weekly({ deletedAt: NOW })])).toBe(false)
    expect(isAddonOn(withAddonOn(DEFAULT_ADDONS, 'school', false), 'school', [weekly()])).toBe(false)
    expect(isAddonOn(withAddonOn(DEFAULT_ADDONS, 'school', true), 'school', [])).toBe(true)
  })

  it('前の版の時間割のオン・オフは学校に移す。どちらかがオンなら学校はオン（#617）', () => {
    const school = (enabled: Record<string, boolean>) => normalizeAddons({ enabled }).enabled
    expect(school({ timetable: true })).toEqual({ school: true })
    expect(school({ timetable: false })).toEqual({ school: false })
    expect(school({ timetable: true, school: false })).toEqual({ school: true })
    expect(school({ timetable: false, school: true })).toEqual({ school: true })
    expect(school({ dues: true })).toEqual({ dues: true })
  })

  it('読んだ値は知らない機能・形の合わない値を落とし、知らない項目は残す', () => {
    expect(normalizeAddons(null)).toEqual({ enabled: {}, dues: [], googleSkip: [], absenceCourses: [], school: null })
    expect(normalizeAddons({ enabled: { dues: true, x: true, y: 'on' }, dues: [1], later: { a: 1 } })).toEqual({
      enabled: { dues: true },
      dues: [],
      googleSkip: [],
      absenceCourses: [],
      school: null,
      later: { a: 1 },
    })
  })

  it('同期: 一度も変えていなければ送らず、サーバーが新しければ合わせ、手元だけ変えていれば送る', () => {
    const on = withAddonOn(DEFAULT_ADDONS, 'school', true)
    expect(planAddonsSync({ addons: DEFAULT_ADDONS, updatedAt: null }, null)).toEqual({})
    expect(planAddonsSync({ addons: on, updatedAt: NOW }, null)).toEqual({ push: { addons: on, updatedAt: NOW, base: null } })
    expect(planAddonsSync({ addons: DEFAULT_ADDONS, updatedAt: null }, { addons: on, updatedAt: NOW })).toEqual({
      apply: { addons: on, updatedAt: NOW },
    })
    const later = '2026-10-09T00:00:00.000Z'
    expect(planAddonsSync({ addons: on, updatedAt: later, syncedAt: NOW }, { addons: DEFAULT_ADDONS, updatedAt: NOW })).toEqual({
      push: { addons: on, updatedAt: later, base: NOW },
    })
  })

  it('Google の予定に付けた色（#639）: 同期の値に入れて送り、届いた値から分ける。前の版の値（色が無い）なら手元のまま', () => {
    const colors = { 'e:g1': { hex: '#33B679', title: '説明会' } }
    const sent = addonsWithEventColors(DEFAULT_ADDONS, colors)
    expect(normalizeAddons(JSON.parse(JSON.stringify(sent)))).toEqual(sent)
    expect(splitEventColors(sent)).toEqual({ addons: DEFAULT_ADDONS, googleEventColors: colors })
    expect(splitEventColors(normalizeAddons({ enabled: {} })).googleEventColors).toBeNull()
    expect(splitEventColors(addonsWithEventColors(DEFAULT_ADDONS, {})).googleEventColors).toEqual({})
  })

  it('両方の端末で変えた色は予定・繰り返しごとに合わせる（片方で外したものは外す）', () => {
    const a = { hex: '#33B679', title: 'ゼミ' }
    const b = { hex: '#D50000', title: 'バイト' }
    const c = { hex: '#7986CB', title: '説明会' }
    const base = addonsWithEventColors(DEFAULT_ADDONS, { 's:x': a, 'e:y': b })
    const l = addonsWithEventColors(DEFAULT_ADDONS, { 's:x': a, 'e:y': b, 'e:z': c })
    const r = addonsWithEventColors(DEFAULT_ADDONS, { 's:x': a })
    expect(mergeAddons(base, l, r, 'r').googleEventColors).toEqual({ 's:x': a, 'e:z': c })
  })
})
