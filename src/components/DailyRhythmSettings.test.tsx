import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyRhythmSettings } from './DailyRhythmSettings'

const env = vi.hoisted(() => ({ ios: false, standalone: false }))
vi.mock('../lib/pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/pwa')>()),
  isIos: () => env.ios,
  isStandalone: () => env.standalone,
}))

const NEED_INSTALL = 'Add to your Home Screen to use notifications'
const UNSUPPORTED = 'This browser does not support notifications.'

const hadNotification = 'Notification' in window
const originalNotification = (window as { Notification?: unknown }).Notification

function withoutNotification() {
  delete (window as { Notification?: unknown }).Notification
}

beforeEach(() => {
  env.ios = false
  env.standalone = false
})

afterEach(() => {
  if (hadNotification) (window as { Notification?: unknown }).Notification = originalNotification
  else delete (window as { Notification?: unknown }).Notification
})

describe('設定「通知」で通知が使えないとき', () => {
  it('iPhone の Safari（ホーム画面に未追加）では「対応していません」ではなく、追加すれば使えると案内し、アプリの行へ飛べる', async () => {
    withoutNotification()
    env.ios = true
    const target = document.createElement('section')
    target.id = 'settings-app'
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    try {
      render(<DailyRhythmSettings />)
      expect(screen.queryByText(UNSUPPORTED)).toBeNull()
      await userEvent.setup().click(screen.getByRole('button', { name: new RegExp(NEED_INSTALL) }))
      expect(scrollIntoView).toHaveBeenCalled()
      // 追加するまでは押せないまま
      expect(screen.getByRole('switch', { name: 'Morning summary' })).toBeDisabled()
    } finally {
      target.remove()
    }
  })

  it('通知の無いほかのブラウザでは今の文言のまま', () => {
    withoutNotification()
    render(<DailyRhythmSettings />)
    expect(screen.getByText(UNSUPPORTED)).toBeInTheDocument()
    expect(screen.queryByText(NEED_INSTALL)).toBeNull()
  })

  it('iPhone でもホーム画面から開いて通知が使えるなら案内は出さない', () => {
    env.ios = true
    env.standalone = true
    ;(window as { Notification?: unknown }).Notification = { permission: 'default' }
    render(<DailyRhythmSettings />)
    expect(screen.queryByText(NEED_INSTALL)).toBeNull()
    expect(screen.queryByText(UNSUPPORTED)).toBeNull()
  })
})
