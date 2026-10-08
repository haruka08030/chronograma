import { afterEach, describe, expect, it, vi } from 'vitest'
import { adoptOtherTabChanges, useTaskStore } from './taskStore'
import { INBOX_LIST_ID, PERSIST_STORAGE_KEY, STORE_VERSION } from './storeConstants'
import { loadImportRollback, saveImportRollback } from '../lib/importRollback'

type Saved = { state: Record<string, unknown> & { tasks: { id: string; title: string }[] }; version: number }

const readSaved = () => JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY)!) as Saved
const titles = () => useTaskStore.getState().tasks.map((t) => t.title)
/** もう一方のタブが保存した、という形で localStorage を書き換える（storage イベントは呼ぶ側） */
function otherTabWrites(edit: (s: Saved) => void) {
  const saved = readSaved()
  edit(saved)
  localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(saved))
}
/** もう一方のタブでタスクを 1 つ足す（今の保存内容の行を写して題名と id を替える） */
function otherTabAddsTask(id: string, title: string) {
  otherTabWrites((s) => {
    s.state.tasks = [...s.state.tasks, { ...s.state.tasks[0]!, id, title }]
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('他のタブの変更の取り込み（adoptOtherTabChanges）', () => {
  it('両方のタブで足したタスクが両方残る（古いタブの次の保存で、もう一方の分を消さない）', () => {
    useTaskStore.getState().addTask('このタブ')
    otherTabAddsTask('other-1', 'もう一方のタブ')
    window.dispatchEvent(new StorageEvent('storage', { key: PERSIST_STORAGE_KEY }))
    expect(titles()).toEqual(['このタブ', 'もう一方のタブ'])

    useTaskStore.getState().addTask('このタブ 2')
    expect(
      readSaved()
        .state.tasks.map((t) => t.title)
        .sort(),
    ).toEqual(['このタブ', 'このタブ 2', 'もう一方のタブ'].sort())
  })

  it('取り込んだ内容は書き戻さず、取り込む前の ⌘Z の履歴は捨てる', () => {
    useTaskStore.getState().addTask('A')
    otherTabAddsTask('other-1', 'B')
    const raw = localStorage.getItem(PERSIST_STORAGE_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    adoptOtherTabChanges()
    expect(setItem.mock.calls.filter(([k]) => k === PERSIST_STORAGE_KEY)).toEqual([])
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe(raw)
    // A を足した操作を ⌘Z で戻すと、もう一方のタブの B ごと取り込む前に戻ってしまう
    expect(useTaskStore.getState().undoLastOperation()).toBe(false)
    expect(titles()).toEqual(['A', 'B'])
  })

  it('同じ内容は 2 度取り込まない。別のキーの storage イベントでは読まない', () => {
    useTaskStore.getState().addTask('A')
    otherTabAddsTask('other-1', 'B')
    adoptOtherTabChanges()
    const tasks = useTaskStore.getState().tasks
    adoptOtherTabChanges()
    expect(useTaskStore.getState().tasks).toBe(tasks)

    otherTabAddsTask('other-2', 'C')
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(titles()).toEqual(['A', 'B'])
  })

  it('取り込むのはデータだけ。開いている画面はタブごと', () => {
    useTaskStore.getState().addTask('A')
    useTaskStore.setState({ selectedView: 'planner', searchQuery: 'abc' })
    otherTabWrites((s) => {
      s.state.selectedView = 'all'
      s.state.searchQuery = 'zzz'
      s.state.tasks = [...s.state.tasks, { ...s.state.tasks[0]!, id: 'b', title: 'B' }]
    })
    adoptOtherTabChanges()
    expect(titles()).toEqual(['A', 'B'])
    expect(useTaskStore.getState().selectedView).toBe('planner')
    expect(useTaskStore.getState().searchQuery).toBe('abc')
  })

  it('開いているリストがもう一方のタブで消されたら、未分類に移る', () => {
    useTaskStore.getState().addList('仕事', 'checklist')
    const list = useTaskStore.getState().lists.find((l) => l.name === '仕事')!
    useTaskStore.setState({ selectedListId: list.id })
    otherTabWrites((s) => {
      s.state.lists = (s.state.lists as { id: string }[]).filter((l) => l.id !== list.id)
    })
    adoptOtherTabChanges()
    expect(useTaskStore.getState().lists.some((l) => l.id === list.id)).toBe(false)
    expect(useTaskStore.getState().selectedListId).not.toBe(list.id)
    expect([INBOX_LIST_ID, null]).toContain(useTaskStore.getState().selectedListId)
  })

  it('新しい版のタブが書いたら読み込み直し、古い版・読めない中身は取り込まない', () => {
    useTaskStore.getState().addTask('A')
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location)

    otherTabWrites((s) => {
      s.version = STORE_VERSION - 1
      s.state.tasks = []
    })
    adoptOtherTabChanges()
    expect(titles()).toEqual(['A'])
    expect(reload).not.toHaveBeenCalled()

    otherTabWrites((s) => {
      s.version = STORE_VERSION + 1
      s.state.tasks = []
    })
    adoptOtherTabChanges()
    expect(titles()).toEqual(['A'])
    expect(reload).toHaveBeenCalledTimes(1)

    localStorage.setItem(PERSIST_STORAGE_KEY, '{not json')
    expect(() => adoptOtherTabChanges()).not.toThrow()
    expect(titles()).toEqual(['A'])
  })

  it('裏から戻ったとき・ページごと復元されたときも読み直す', () => {
    useTaskStore.getState().addTask('A')
    otherTabAddsTask('b', 'B')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(titles()).toEqual(['A', 'B'])

    otherTabAddsTask('c', 'C')
    const e = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(e, 'persisted', { value: true })
    window.dispatchEvent(e)
    expect(titles()).toEqual(['A', 'B', 'C'])
  })
})

describe('保存領域がいっぱいのとき', () => {
  const quota = () => {
    const real = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PERSIST_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
      real.call(this, k, v)
    })
    return () => spy.mockRestore()
  }

  it('取り込み前の控えを手放して書き直す（控えを消せば入るなら、編集は失わない）', async () => {
    useTaskStore.getState().addTask('A')
    saveImportRollback({ json: '{}', savedAt: '2026-10-01T00:00:00.000Z', taskCount: 0 })
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      // 控えが残っている間だけいっぱい
      if (k === PERSIST_STORAGE_KEY && loadImportRollback()) throw new DOMException('full', 'QuotaExceededError')
      real.call(this, k, v)
    })
    useTaskStore.getState().addTask('B')
    await Promise.resolve()
    expect(loadImportRollback()).toBeNull()
    expect(readSaved().state.tasks.map((t) => t.title)).toEqual(['A', 'B'])
    expect(useTaskStore.getState().storageFull).toBe(false)
  })

  it('書けなければ例外を出さずに知らせ、その間は他のタブの内容で手元を上書きしない。書けたら知らせを消す', async () => {
    useTaskStore.getState().addTask('A')
    const restore = quota()
    expect(() => useTaskStore.getState().addTask('いっぱいの後')).not.toThrow()
    await Promise.resolve()
    expect(useTaskStore.getState().storageFull).toBe(true)
    expect(titles()).toEqual(['A', 'いっぱいの後'])

    // もう一方のタブは「いっぱいの後」を知らない古い内容を書いた
    restore()
    otherTabAddsTask('other', 'もう一方')
    adoptOtherTabChanges()
    expect(titles()).toEqual(['A', 'いっぱいの後'])

    // 書けるようになったら、次の更新で手元を書き出し、知らせを消す
    useTaskStore.getState().addTask('C')
    await Promise.resolve()
    expect(useTaskStore.getState().storageFull).toBe(false)
    expect(readSaved().state.tasks.map((t) => t.title)).toEqual(['A', 'いっぱいの後', 'C'])
  })
})
