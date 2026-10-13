import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n from '../../i18n/config'
import { fromDateKey } from '../../lib/dateKey'
import { CalendarView } from '../CalendarView'
import { CalendarScheduleView } from '../CalendarScheduleView'
import { WeekCalendarView } from '../WeekCalendarView'

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

describe('カレンダーの祝日名（日本語の画面だけ）', () => {
  it('月のマス: 2026/10/12 の日付の横に「スポーツの日」', async () => {
    await i18n.changeLanguage('ja')
    const { container } = render(<CalendarView displayMonth={fromDateKey('2026-10-01')} />)
    // PC 幅は日付の横、スマホ幅はその下の行（片方は CSS で隠す）
    const labels = new Set([...container.querySelectorAll('[data-holiday]')].map((el) => el.textContent))
    // 10 月の格子（9/28〜11/1）に入る祝日は 10/12 だけ
    expect([...labels]).toEqual(['スポーツの日'])
  })

  it('3 日表示: 終日の行に祝日名（振替休日も）', async () => {
    await i18n.changeLanguage('ja')
    render(<WeekCalendarView anchor={fromDateKey('2026-05-04')} selectedDateKey="2026-05-04" threeDay />)
    expect(screen.getByText('みどりの日')).toBeInTheDocument()
    expect(screen.getByText('こどもの日')).toBeInTheDocument()
    expect(screen.getByText('振替休日')).toBeInTheDocument()
  })

  it('今日の計画（1 日表示）には出さない', async () => {
    await i18n.changeLanguage('ja')
    const { container } = render(<WeekCalendarView anchor={fromDateKey('2026-05-05')} selectedDateKey="2026-05-05" singleDay />)
    expect(container.querySelector('[data-holiday]')).toBeNull()
  })

  it('スケジュール: 予定の無い祝日も日付の行が出る', async () => {
    await i18n.changeLanguage('ja')
    render(<CalendarScheduleView startDateKey="2026-10-08" onOpenDay={() => {}} />)
    expect(screen.getByText('スポーツの日')).toBeInTheDocument()
    expect(screen.getByText('文化の日')).toBeInTheDocument()
  })

  it('英語の画面では出さない', async () => {
    await i18n.changeLanguage('en')
    const { container } = render(<CalendarView displayMonth={fromDateKey('2026-10-01')} />)
    expect(container.querySelector('[data-holiday]')).toBeNull()
  })
})
