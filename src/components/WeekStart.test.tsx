import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { PERSIST_STORAGE_KEY, STORE_VERSION } from '../store/storeConstants'
import { DATA_KEYS } from '../store/persistKeys'
import { fromDateKey } from '../lib/dateKey'
import { appWeekStartsOn } from '../lib/weekStart'
import { CalendarView } from './CalendarView'
import { WeekCalendarView } from './WeekCalendarView'
import { DatePickerBody } from './DatePickerBody'
import { TimeZoneSettings } from './settings/TimeZoneSettings'

beforeAll(() => {
  // jsdom には無いもの（タイムラインの大きさ・スクロール）
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterAll(() => i18n.changeLanguage('en'))

/** 月の格子（曜日の見出しの次の格子）の、最初の 7 マスの日付 */
function firstRowDates(container: HTMLElement): string[] {
  const grids = container.querySelectorAll('.grid.grid-cols-7')
  return [...grids[1]!.children].slice(0, 7).map((cell) => cell.textContent!.match(/^\d+/)?.[0] ?? '')
}

function headerLabels(container: HTMLElement): string[] {
  return [...container.querySelector('.grid.grid-cols-7')!.children].map((c) => c.textContent ?? '')
}

describe('週の開始日: 既定は月曜のまま（前からの利用者）', () => {
  it('初期状態は月曜', () => {
    expect(useTaskStore.getState().weekStartsOn).toBe(1)
    expect(appWeekStartsOn()).toBe(1)
  })

  it('項目の無い前の版の保存データを読んでも月曜。知らない値も月曜に直す', async () => {
    localStorage.setItem(
      PERSIST_STORAGE_KEY,
      JSON.stringify({ state: { tasks: [], lists: [], habits: [], sections: [] }, version: STORE_VERSION }),
    )
    await useTaskStore.persist.rehydrate()
    expect(useTaskStore.getState().weekStartsOn).toBe(1)
    localStorage.setItem(
      PERSIST_STORAGE_KEY,
      JSON.stringify({ state: { tasks: [], lists: [], habits: [], sections: [], weekStartsOn: 3 }, version: STORE_VERSION }),
    )
    await useTaskStore.persist.rehydrate()
    expect(useTaskStore.getState().weekStartsOn).toBe(1)
  })

  it('端末に保存する設定（データと同じ保存先・他のタブと共有）で、選んだ値は読み直しても残る', async () => {
    expect(DATA_KEYS).toContain('weekStartsOn')
    useTaskStore.getState().setWeekStartsOn(0)
    await useTaskStore.persist.rehydrate()
    expect(useTaskStore.getState().weekStartsOn).toBe(0)
    expect(appWeekStartsOn()).toBe(0)
  })

  it('月表示は月曜から（2026 年 10 月: 9/28 〜）', async () => {
    await i18n.changeLanguage('ja')
    const { container } = render(<CalendarView displayMonth={fromDateKey('2026-10-01')} />)
    expect(headerLabels(container)).toEqual(['月', '火', '水', '木', '金', '土', '日'])
    expect(firstRowDates(container)).toEqual(['28', '29', '30', '1', '2', '3', '4'])
  })
})

describe('週の開始日: 日曜はじまり', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('月表示: 見出しは 日〜土、格子は 9/27（日）から。祝日名もそのまま', async () => {
    await i18n.changeLanguage('ja')
    useTaskStore.getState().setWeekStartsOn(0)
    const { container } = render(<CalendarView displayMonth={fromDateKey('2026-10-01')} />)
    expect(headerLabels(container)).toEqual(['日', '月', '火', '水', '木', '金', '土'])
    expect(firstRowDates(container)).toEqual(['27', '28', '29', '30', '1', '2', '3'])
    // 10/31（土）で終わる（11/1 は次の月の格子）
    expect(container.querySelectorAll('.grid.grid-cols-7')[1]!.children.length).toBe(35)
    expect(screen.getAllByText('スポーツの日').length).toBeGreaterThan(0)
  })

  it('週表示（PC）: 10/7（水）を含む週は 10/4（日）〜10/10（土）', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
    useTaskStore.getState().setWeekStartsOn(0)
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-10-07')} selectedDateKey="2026-10-07" />)
    const cols = [...container.querySelectorAll<HTMLElement>('[data-datekey]')].map((el) => el.dataset.datekey)
    expect(cols).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
  })

  it('日付ピッカー: 見出しは Sun から、格子は 9/27 から。Home で週の頭（日曜）へ', async () => {
    await i18n.changeLanguage('en')
    useTaskStore.getState().setWeekStartsOn(0)
    const { container } = render(<DatePickerBody value="2026-10-07" onPick={() => {}} autoFocus />)
    expect(headerLabels(container)[0]).toBe('Sun')
    expect(container.querySelector('[data-day]')!.getAttribute('data-day')).toBe('2026-09-27')
    await userEvent.keyboard('{Home}')
    expect(document.activeElement?.getAttribute('data-day')).toBe('2026-10-04')
    await userEvent.keyboard('{End}')
    expect(document.activeElement?.getAttribute('data-day')).toBe('2026-10-10')
  })
})

describe('設定の「週の開始日」', () => {
  it('土曜・日曜・月曜から選べ、既定は月曜。選ぶとストアに入る', async () => {
    await i18n.changeLanguage('ja')
    render(<TimeZoneSettings />)
    const group = screen.getByRole('radiogroup', { name: '週の開始日' })
    expect([...group.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(['土曜日', '日曜日', '月曜日'])
    expect(screen.getByRole('radio', { name: '月曜日' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: '日曜日' }))
    expect(useTaskStore.getState().weekStartsOn).toBe(0)
    expect(screen.getByRole('radio', { name: '日曜日' })).toHaveAttribute('aria-checked', 'true')
  })
})
