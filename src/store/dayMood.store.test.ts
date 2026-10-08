import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ストアを node で読み込むための最小限の localStorage
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))
vi.mock('../lib/webPush', () => ({ detachWebPush: vi.fn(async () => {}), resyncWebPush: vi.fn(async () => {}) }))
vi.mock('../hooks/useAutoBackup', () => ({ backupNow: vi.fn() }))

const { useTaskStore } = await import('./taskStore')
const { DATA_KEYS } = await import('./persistKeys')
const { clearLocalAccountState, clearPreviousAccount } = await import('../lib/accountBoundary')

const S = () => useTaskStore.getState()
const DAY = '2026-10-08'

beforeEach(() => {
  useTaskStore.setState({ dayMoods: {} })
})

describe('1 日の気分（#324）', () => {
  it('記号を押すと付き、別の記号で替わり、もう一度同じ記号（null）で外れる', () => {
    S().setDayMood(DAY, { mood: 4 })
    expect(S().dayMoods[DAY]).toMatchObject({ mood: 4, note: '', syncedAt: null })
    S().setDayMood(DAY, { mood: 2 })
    expect(S().dayMoods[DAY]?.mood).toBe(2)
    S().setDayMood(DAY, { mood: null })
    expect(S().dayMoods[DAY]?.mood).toBeNull()
  })

  it('一言は 1 行にそろえて残し、記号を外しても一言はそのまま', () => {
    S().setDayMood(DAY, { mood: 5 })
    S().setDayMood(DAY, { note: '  よく\n寝た ' })
    expect(S().dayMoods[DAY]).toMatchObject({ mood: 5, note: 'よく 寝た' })
    S().setDayMood(DAY, { mood: null })
    expect(S().dayMoods[DAY]).toMatchObject({ mood: null, note: 'よく 寝た' })
    S().setDayMood(DAY, { note: '' })
    expect(S().dayMoods[DAY]).toMatchObject({ mood: null, note: '' })
  })

  it('変えたら時刻を付け、もとにしたサーバーの版は残す。同じ中身・空のままでは何もしない', () => {
    useTaskStore.setState({ dayMoods: { [DAY]: { mood: 3, note: '', updatedAt: 'S1', syncedAt: 'S1' } } })
    const before = S().dayMoods
    S().setDayMood(DAY, { mood: 3 })
    expect(S().dayMoods).toBe(before)
    S().setDayMood('2026-10-07', { mood: null, note: '  ' })
    expect(S().dayMoods['2026-10-07']).toBeUndefined()
    S().setDayMood(DAY, { mood: 4 })
    expect(S().dayMoods[DAY]?.syncedAt).toBe('S1')
    expect(S().dayMoods[DAY]?.updatedAt).not.toBe('S1')
  })

  it('端末に保存する（データとして）', () => {
    expect(DATA_KEYS).toContain('dayMoods')
  })

  it('ログアウト・アカウントが替わったら前の人の気分は手元から消える', () => {
    S().setDayMood(DAY, { mood: 1, note: '内緒' })
    clearLocalAccountState('u1')
    expect(S().dayMoods).toEqual({})
    S().setDayMood(DAY, { mood: 1, note: '内緒' })
    clearPreviousAccount()
    expect(S().dayMoods).toEqual({})
  })
})
