import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { clearAccountData, clearLocalAccountState } from './accountBoundary'
import { backupNow } from '../hooks/useAutoBackup'
import { askConfirm } from './confirmDialog'

vi.mock('../hooks/useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useAutoBackup')>()),
  backupNow: vi.fn(async () => true),
}))
vi.mock('./confirmDialog', () => ({ askConfirm: vi.fn(async () => false) }))
// 通知の購読（Service Worker）は jsdom に無い
vi.mock('./webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webPush')>()),
  detachWebPush: vi.fn(async () => {}),
  resyncWebPush: vi.fn(async () => {}),
}))

afterEach(() => {
  vi.mocked(backupNow).mockReset()
  vi.mocked(backupNow).mockResolvedValue(true)
  vi.mocked(askConfirm).mockReset()
  vi.mocked(askConfirm).mockResolvedValue(false)
})

const titles = () => useTaskStore.getState().tasks.map((t) => t.title)

describe('ログアウト・アカウントが替わる前の控え（#486）', () => {
  it('控えを取り終えるまで消さない', async () => {
    useTaskStore.getState().addTask('mine')
    let finish: (ok: boolean) => void = () => {}
    vi.mocked(backupNow).mockReturnValue(new Promise<boolean>((r) => (finish = r)))

    const done = clearAccountData('u1')
    await Promise.resolve()
    expect(titles()).toEqual(['mine'])
    finish(true)
    expect(await done).toBe(true)
    expect(titles()).toEqual([])
    expect(askConfirm).not.toHaveBeenCalled()
  })

  it('控えを取れず、取消を選んだら消さない', async () => {
    useTaskStore.getState().addTask('mine')
    useTaskStore.getState().setDataOwner('u1')
    vi.mocked(backupNow).mockResolvedValue(false)

    await clearLocalAccountState('u1')

    expect(askConfirm).toHaveBeenCalledTimes(1)
    expect(titles()).toEqual(['mine'])
    expect(useTaskStore.getState().dataOwner).toBe('u1')
  })

  it('控えを取れず、書き出すと答えたら書き出してから消す', async () => {
    useTaskStore.getState().addTask('mine')
    vi.mocked(backupNow).mockResolvedValue(false)
    vi.mocked(askConfirm).mockResolvedValue(true)
    const exportData = vi.fn()
    useTaskStore.setState({ exportData })

    expect(await clearAccountData('u1')).toBe(true)
    expect(exportData).toHaveBeenCalledTimes(1)
    expect(titles()).toEqual([])
  })

  it('ログアウトのボタンと SIGNED_OUT から続けて来ても、控えと確認は 1 回', async () => {
    useTaskStore.getState().addTask('mine')
    vi.mocked(backupNow).mockResolvedValue(false)
    vi.mocked(askConfirm).mockResolvedValue(true)
    useTaskStore.setState({ exportData: vi.fn() })

    await Promise.all([clearLocalAccountState('u1'), clearLocalAccountState('u1')])
    expect(backupNow).toHaveBeenCalledTimes(1)
    expect(askConfirm).toHaveBeenCalledTimes(1)
    expect(titles()).toEqual([])
  })
})
