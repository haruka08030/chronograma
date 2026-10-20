import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { backupNow } from './useAutoBackup'
import { saveAutoBackup } from '../lib/autoBackup'

vi.mock('../lib/autoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/autoBackup')>()),
  saveAutoBackup: vi.fn(async () => true),
}))

afterEach(() => {
  vi.mocked(saveAutoBackup).mockClear()
})

describe('backupNow（#486）', () => {
  it('To-Do が 0 件でも習慣があれば控え、取れたかを返す', async () => {
    useTaskStore.getState().addHabit({ title: 'ジム' } as never)
    expect(useTaskStore.getState().tasks).toEqual([])
    expect(await backupNow('beforeSignOut', 'u1')).toBe(true)
    expect(saveAutoBackup).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveAutoBackup).mock.calls[0]![5]).toBe(true)

    vi.mocked(saveAutoBackup).mockResolvedValueOnce(false)
    expect(await backupNow('beforeSignOut', 'u1')).toBe(false)
  })

  it('最初からあるリストしか無ければ、控えずに true（消してよい）', async () => {
    expect(await backupNow('beforeSignOut', 'u1')).toBe(true)
    expect(saveAutoBackup).not.toHaveBeenCalled()
  })
})
