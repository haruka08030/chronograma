import { act, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { toDateKey } from '../../lib/dateKey'
import { appToday } from '../../lib/timeZone'
import { TodayPlannerView } from '../TodayPlannerView'

/** ログインの状態（user・loading）だけ差し替える */
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }))
vi.mock('../../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contexts/AuthContext')>()),
  useAuth: () => ({ session: null, user: auth.user, loading: auth.loading }),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})

beforeEach(() => {
  auth.user = null
  auth.loading = false
})

const guide = () => screen.queryByRole('region', { name: 'Getting started' })

function openToday() {
  useTaskStore.getState().setSelectedCalendarDateKey(toDateKey(appToday()))
  return render(<TodayPlannerView />)
}

describe('はじめの 3 ステップと初めての同期', () => {
  it('ログインしていない（この端末だけで使う）人には、すぐに出す', () => {
    openToday()
    expect(guide()).toBeInTheDocument()
  })

  it('ログインを確かめている間は出さない', () => {
    auth.loading = true
    openToday()
    expect(guide()).toBeNull()
  })

  it('新しい端末でログインしたら、初めての同期が終わるまで出さない。アカウントにデータがあればそのまま出ない', () => {
    auth.user = { id: 'u1' }
    openToday()
    expect(guide()).toBeNull()

    // 同期でアカウントのデータが届き、案内を終わらせてから持ち主をこの人にする（useSupabaseSync と同じ順）
    act(() => {
      useTaskStore.getState().finishOnboarding()
      useTaskStore.getState().setDataOwner('u1')
    })
    expect(guide()).toBeNull()
  })

  it('アカウントが空なら、初めての同期が終わったところで出す', () => {
    auth.user = { id: 'u1' }
    openToday()
    expect(guide()).toBeNull()

    act(() => useTaskStore.getState().setDataOwner('u1'))
    expect(guide()).toBeInTheDocument()
  })

  it('前の人のデータが残る端末で別の人がログインしても、同期が終わるまで出さない', () => {
    useTaskStore.setState({ dataOwner: 'someone-else' })
    auth.user = { id: 'u1' }
    openToday()
    expect(guide()).toBeNull()
  })
})
