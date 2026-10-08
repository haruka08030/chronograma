import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 容量を決められる localStorage の代わり（unit は node で動くので localStorage が無い） */
function fakeStorage() {
  const map = new Map<string, string>()
  const ctl = { full: false, writes: 0 }
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (ctl.full) throw new DOMException('quota', 'QuotaExceededError')
      ctl.writes++
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
  }
  return { storage, map, ctl }
}

/** 覚えている文字列・失敗中かはモジュールの中にあるので、テストごとに読み込み直す */
async function load() {
  vi.resetModules()
  return import('./persistStorage')
}

const KEY = 'k'
let fake: ReturnType<typeof fakeStorage>

beforeEach(() => {
  fake = fakeStorage()
  vi.stubGlobal('localStorage', fake.storage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('persistStorage の書き込み', () => {
  it('容量不足: 場所を空けられたらもう一度だけ書き、失敗を知らせない', async () => {
    const m = await load()
    const onFailed = vi.fn()
    const freeSpace = vi.fn(() => {
      fake.ctl.full = false
      return true
    })
    m.setPersistWriteHandlers({ freeSpace, onFailed, onRecovered: vi.fn() })
    fake.ctl.full = true
    m.persistStorage.setItem(KEY, 'v1')
    expect(freeSpace).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
    expect(fake.map.get(KEY)).toBe('v1')
  })

  it('容量不足: 空けられなければ例外を投げずに失敗を知らせ、前の保存内容は残る', async () => {
    const m = await load()
    const onFailed = vi.fn()
    m.setPersistWriteHandlers({ freeSpace: () => false, onFailed, onRecovered: vi.fn() })
    m.persistStorage.setItem(KEY, 'old')
    fake.ctl.full = true
    expect(() => m.persistStorage.setItem(KEY, 'new')).not.toThrow()
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect((onFailed.mock.calls[0]![0] as DOMException).name).toBe('QuotaExceededError')
    expect(fake.map.get(KEY)).toBe('old')
  })

  it('容量不足: 空けてもまだ足りなければ失敗を知らせる（書き直しは 1 回だけ）', async () => {
    const m = await load()
    const onFailed = vi.fn()
    const freeSpace = vi.fn(() => true)
    m.setPersistWriteHandlers({ freeSpace, onFailed, onRecovered: vi.fn() })
    fake.ctl.full = true
    m.persistStorage.setItem(KEY, 'v')
    expect(freeSpace).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledTimes(1)
  })

  it('失敗のあとは、同じ中身でも書き直し、書けたら戻ったことを知らせる', async () => {
    const m = await load()
    const onRecovered = vi.fn()
    m.setPersistWriteHandlers({ freeSpace: () => false, onFailed: vi.fn(), onRecovered })
    fake.ctl.full = true
    m.persistStorage.setItem(KEY, 'v')
    fake.ctl.full = false
    // 失敗した中身をもう一度渡す（画面の状態だけの更新でも、保存できていない手元を書き出す）
    m.persistStorage.setItem(KEY, 'v')
    expect(fake.map.get(KEY)).toBe('v')
    expect(onRecovered).toHaveBeenCalledTimes(1)
    // 戻ったあとは、同じ中身なら書かない
    const writes = fake.ctl.writes
    m.persistStorage.setItem(KEY, 'v')
    expect(fake.ctl.writes).toBe(writes)
  })

  it('中身が同じなら書かない。withoutPersisting の間は書かない', async () => {
    const m = await load()
    m.persistStorage.setItem(KEY, 'a')
    const writes = fake.ctl.writes
    m.persistStorage.setItem(KEY, 'a')
    expect(fake.ctl.writes).toBe(writes)
    m.withoutPersisting(() => m.persistStorage.setItem(KEY, 'b'))
    expect(fake.map.get(KEY)).toBe('a')
    // 例外で抜けても、そのあとは書ける
    expect(() =>
      m.withoutPersisting(() => {
        throw new Error('x')
      }),
    ).toThrow('x')
    m.persistStorage.setItem(KEY, 'c')
    expect(fake.map.get(KEY)).toBe('c')
  })
})

describe('他のタブの書き込みの見分け（readChangedRaw）', () => {
  it('自分が書いた・読んだ・取り込んだ文字列は他のタブの変更と見なさない', async () => {
    const m = await load()
    m.persistStorage.setItem(KEY, 'mine')
    expect(m.readChangedRaw(KEY)).toBeNull()

    fake.map.set(KEY, 'other-tab')
    expect(m.readChangedRaw(KEY)).toBe('other-tab')
    m.markRawKnown('other-tab')
    expect(m.readChangedRaw(KEY)).toBeNull()

    fake.map.set(KEY, 'read')
    expect(m.persistStorage.getItem(KEY)).toBe('read')
    expect(m.readChangedRaw(KEY)).toBeNull()
  })

  it('保存が消えた（null）ときは取り込まない', async () => {
    const m = await load()
    m.persistStorage.setItem(KEY, 'mine')
    fake.map.delete(KEY)
    expect(m.readChangedRaw(KEY)).toBeNull()
  })

  it('保存に失敗している間は、手元のほうが新しいので他のタブの内容を取り込まない', async () => {
    const m = await load()
    m.setPersistWriteHandlers({ freeSpace: () => false, onFailed: vi.fn(), onRecovered: vi.fn() })
    m.persistStorage.setItem(KEY, 'mine')
    fake.ctl.full = true
    m.persistStorage.setItem(KEY, 'mine-newer')
    fake.map.set(KEY, 'other-tab')
    expect(m.readChangedRaw(KEY)).toBeNull()
    // 書けるようになったら、また見分ける
    fake.ctl.full = false
    m.persistStorage.setItem(KEY, 'mine-newer')
    fake.map.set(KEY, 'other-tab-2')
    expect(m.readChangedRaw(KEY)).toBe('other-tab-2')
  })

  it('localStorage が読めないときは null（落ちない）', async () => {
    const m = await load()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(m.readChangedRaw(KEY)).toBeNull()
    expect(m.persistStorage.getItem(KEY)).toBeNull()
  })
})

describe('createPersistStorage（zustand の persist に渡す保存先）', () => {
  it('保存する値がどれも前と同じ参照なら、文字列にもしない（検索欄の 1 文字などで全データを文字列にしない）', async () => {
    const m = await load()
    const storage = m.createPersistStorage<{ tasks: string[]; n: number }>()
    const tasks = ['a', 'b']
    const stringify = vi.spyOn(JSON, 'stringify')
    void storage.setItem(KEY, { state: { tasks, n: 1 }, version: 1 })
    expect(stringify).toHaveBeenCalledTimes(1)
    // persist は毎回 partialize で新しい入れ物を作るが、中身の参照は同じ
    for (let i = 0; i < 20; i++) void storage.setItem(KEY, { state: { tasks, n: 1 }, version: 1 })
    expect(stringify).toHaveBeenCalledTimes(1)
    expect(fake.ctl.writes).toBe(1)
    // 1 つでも変われば書く
    void storage.setItem(KEY, { state: { tasks: [...tasks, 'c'], n: 1 }, version: 1 })
    expect(stringify).toHaveBeenCalledTimes(2)
    stringify.mockRestore()
    expect(JSON.parse(fake.map.get(KEY)!)).toEqual({ state: { tasks: ['a', 'b', 'c'], n: 1 }, version: 1 })
    expect(storage.getItem(KEY)).toEqual({ state: { tasks: ['a', 'b', 'c'], n: 1 }, version: 1 })
  })

  it('withoutPersisting の間は書かず、保存に失敗している間は同じ参照でも書き直す', async () => {
    const m = await load()
    m.setPersistWriteHandlers({ freeSpace: () => false, onFailed: vi.fn(), onRecovered: vi.fn() })
    const storage = m.createPersistStorage<{ tasks: string[] }>()
    const tasks = ['a']
    m.withoutPersisting(() => void storage.setItem(KEY, { state: { tasks }, version: 1 }))
    expect(fake.map.has(KEY)).toBe(false)
    fake.ctl.full = true
    void storage.setItem(KEY, { state: { tasks }, version: 1 })
    expect(fake.map.has(KEY)).toBe(false)
    fake.ctl.full = false
    void storage.setItem(KEY, { state: { tasks }, version: 1 })
    expect(JSON.parse(fake.map.get(KEY)!)).toEqual({ state: { tasks: ['a'] }, version: 1 })
  })
})
