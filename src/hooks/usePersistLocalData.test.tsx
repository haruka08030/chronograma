import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  request: vi.fn(async () => {}),
}))
vi.mock('../lib/persistentStorage', () => ({ requestPersistentStorage: mocks.request }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.loading }) }))

const { usePersistLocalData } = await import('./usePersistLocalData')

beforeEach(() => {
  mocks.user = null
  mocks.loading = false
  mocks.request.mockClear()
})

describe('usePersistLocalData', () => {
  it('ログインしていなくて何か入っていれば、保存領域を消されにくくしてほしいと頼む', () => {
    useTaskStore.getState().addTask('Essay')
    renderHook(() => usePersistLocalData())
    expect(mocks.request).toHaveBeenCalledOnce()
  })

  it('何も入っていない・ログイン中・確かめている間は頼まない', () => {
    const r1 = renderHook(() => usePersistLocalData())
    r1.unmount()
    useTaskStore.getState().addTask('Essay')
    mocks.user = { id: 'u1' }
    const r2 = renderHook(() => usePersistLocalData())
    r2.unmount()
    mocks.user = null
    mocks.loading = true
    renderHook(() => usePersistLocalData())
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
