import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null })
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { DATA_KEYS } = await import('./persistKeys')
const { BACKUP_KEYS, BACKUP_EXCLUDED } = await import('./slices/data')

describe('書き出しに入れる値', () => {
  it('保存する値（DATA_KEYS）はどれも、書き出しに入れるか・入れない理由があるかのどちらか 1 つ（新しい値を足したらここで分かる）', () => {
    const included = new Set<string>(BACKUP_KEYS)
    const excluded = new Set(Object.keys(BACKUP_EXCLUDED))
    for (const k of included) expect(excluded.has(k), k).toBe(false)
    const unclassified = DATA_KEYS.filter((k) => !included.has(k) && !excluded.has(k))
    expect(unclassified).toEqual([])
    // 書き出す値・理由を書いた値は、どれも保存する値
    const data = new Set<string>(DATA_KEYS)
    expect([...included, ...excluded].filter((k) => !data.has(k))).toEqual([])
    for (const reason of Object.values(BACKUP_EXCLUDED)) expect(reason.length).toBeGreaterThan(0)
  })
})
