import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from './MobileBottomNav'

afterEach(() => {
  vi.useRealTimers()
})

describe('スマホの下のタブ', () => {
  it('真ん中のカレンダーのアイコンに今日の日付の数字を入れる（名前は「カレンダー」のまま）', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 30, 13, 0, 0))
    render(<MobileBottomNav />)
    const tab = screen.getByRole('button', { name: 'Calendar' })
    expect(tab).toHaveTextContent('30')
    // 数字は飾り（読み上げはタブの名前だけ）
    expect(tab.querySelector('[aria-hidden]')).toHaveTextContent('30')
  })
})
