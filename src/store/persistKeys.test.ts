import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null })
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')
const { DATA_KEYS, VIEW_KEYS, TRANSIENT_KEYS } = await import('./persistKeys')

describe('ストアの値の保存先', () => {
  it('どの値も、データ・画面の好み・保存しない のどれか 1 つに入っている（新しい値を足したらここで分かる）', () => {
    const state = useTaskStore.getState() as unknown as Record<string, unknown>
    const keys = Object.keys(state).filter((k) => typeof state[k] !== 'function').sort()
    const classified = [...DATA_KEYS, ...VIEW_KEYS, ...TRANSIENT_KEYS] as string[]
    expect(new Set(classified).size).toBe(classified.length)
    expect([...classified].sort()).toEqual(keys)
  })
})
