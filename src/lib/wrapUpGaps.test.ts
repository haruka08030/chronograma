// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { gapKey, loadIdleGaps, pickWrapUpGaps, saveIdleGaps } from './wrapUpGaps'

const g = (start: number, end: number) => ({ start, end })

describe('pickWrapUpGaps', () => {
  it('5 つまでは全部を時刻の順に出す', () => {
    const gaps = [g(600, 660), g(480, 540)]
    expect(pickWrapUpGaps(gaps, new Set())).toEqual({ shown: [g(480, 540), g(600, 660)], more: 0 })
  })

  it('5 つを超えたら長い順に 5 つ選び、時刻の順に並べて残りを数える', () => {
    const gaps = [g(0, 30), g(60, 180), g(200, 240), g(300, 400), g(420, 450), g(500, 560), g(600, 700)]
    const { shown, more } = pickWrapUpGaps(gaps, new Set())
    expect(shown).toEqual([g(60, 180), g(200, 240), g(300, 400), g(500, 560), g(600, 700)])
    expect(more).toBe(2)
  })

  it('「何もしていない」にした抜けは出さず、数にも入れない', () => {
    const gaps = [g(480, 540), g(600, 660)]
    expect(pickWrapUpGaps(gaps, new Set([gapKey(g(480, 540))]))).toEqual({ shown: [g(600, 660)], more: 0 })
  })
})

describe('何もしていない の印', () => {
  afterEach(() => localStorage.clear())

  it('その日の分だけ残す（別の日には使わない）', () => {
    saveIdleGaps('2026-10-14', new Set(['540-600']))
    expect(loadIdleGaps('2026-10-14')).toEqual(new Set(['540-600']))
    expect(loadIdleGaps('2026-10-15')).toEqual(new Set())
  })

  it('壊れた中身は空として読む', () => {
    localStorage.setItem('chronograma-wrapup-idle-v1', '{')
    expect(loadIdleGaps('2026-10-14')).toEqual(new Set())
  })
})
