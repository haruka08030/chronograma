import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { PERSIST_STORAGE_KEY } from '../store/storeConstants'
import {
  BEFORE_RECOVERY_COPY_PREFIX,
  UNREADABLE_COPY_PREFIX,
  clearSignedOutLeftovers,
  keepStorageCopy,
  pruneStorageCopies,
} from './deviceCleanup'
import { hasOtherUsersBaseline, loadBaseline, saveBaseline } from './syncMerge'
import { clearDeletedAccount, clearLocalAccountState } from './accountBoundary'

vi.mock('./webPush', () => ({ detachWebPush: vi.fn(() => Promise.resolve()), resyncWebPush: vi.fn(() => Promise.resolve()) }))
vi.mock('../hooks/useAutoBackup', () => ({ backupNow: vi.fn(async () => true) }))

const keys = (prefix: string) =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .sort()
const baseline = { lists: {}, tasks: { t1: 1 }, habits: {}, sections: {} } as never

describe('保存データの写し（#256）', () => {
  it('写しは種類ごとに新しい 1 つだけ残す', () => {
    keepStorageCopy(UNREADABLE_COPY_PREFIX, 'first', 1000)
    keepStorageCopy(UNREADABLE_COPY_PREFIX, 'second', 2000)
    keepStorageCopy(BEFORE_RECOVERY_COPY_PREFIX, 'before', 1500)
    expect(keys(UNREADABLE_COPY_PREFIX)).toEqual([`${UNREADABLE_COPY_PREFIX}2000`])
    expect(localStorage.getItem(`${UNREADABLE_COPY_PREFIX}2000`)).toBe('second')
    // 別の種類の写しは消さない
    expect(keys(BEFORE_RECOVERY_COPY_PREFIX)).toEqual([`${BEFORE_RECOVERY_COPY_PREFIX}1500`])
  })

  it('前の版で溜まった写しは、起動時に新しい 1 つだけにする', () => {
    for (const at of [100, 300, 200]) localStorage.setItem(`${UNREADABLE_COPY_PREFIX}${at}`, `copy ${at}`)
    localStorage.setItem(PERSIST_STORAGE_KEY, 'main')
    expect(pruneStorageCopies()).toBe(true)
    expect(keys(UNREADABLE_COPY_PREFIX)).toEqual([`${UNREADABLE_COPY_PREFIX}300`])
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe('main')
    expect(pruneStorageCopies()).toBe(false)
  })

  it('読み込みのたびに壊れた行があっても、写しは 1 つまで', async () => {
    const broken = JSON.stringify({ state: { tasks: [{ id: 'bad', title: 1 }], lists: [], habits: [], sections: [] }, version: 40 })
    for (let i = 0; i < 3; i++) {
      localStorage.setItem(PERSIST_STORAGE_KEY, broken)
      await useTaskStore.persist.rehydrate()
      await new Promise((r) => setTimeout(r, 2))
    }
    expect(keys(UNREADABLE_COPY_PREFIX)).toHaveLength(1)
  })
})

describe('ログアウトの片付け（#256）', () => {
  function seedLeftovers() {
    localStorage.setItem(`${UNREADABLE_COPY_PREFIX}1`, '{"state":{"tasks":[{"title":"前の人のタスク"}]}}')
    localStorage.setItem(`${BEFORE_RECOVERY_COPY_PREFIX}1`, '{"state":{}}')
    localStorage.setItem('chronograma-canvas-pulled-v1:u1', '{"a":{"title":"前の人の課題"}}')
    localStorage.setItem('chronograma-notion-pulled-v1:u1', '{"b":{"title":"前の人のページ"}}')
    localStorage.setItem('chronograma-canvas-pulled-v1:u0', '{}')
    // 連携への送り待ち（Notion・Canvas への書き戻し、Google カレンダーに送る予定）
    localStorage.setItem('chronograma-writeback-v1:notion:u1', '{"t":{"payload":{"pageId":"p","status":"前の人"}}}')
    localStorage.setItem('chronograma.googlePush.u1', '{"t1":{"at":1,"tries":0}}')
    localStorage.setItem('chronograma-lang', 'ja')
    saveBaseline('u1', baseline)
    saveBaseline('u0', baseline)
  }

  it('写し・連携の前回取り込んだ値は消え、前回同期の控えは中身を消して印だけ残す', () => {
    seedLeftovers()
    clearSignedOutLeftovers()
    expect(keys(`${PERSIST_STORAGE_KEY}-`)).toEqual([])
    expect(keys('chronograma-canvas-pulled')).toEqual([])
    expect(keys('chronograma-notion-pulled')).toEqual([])
    expect(keys('chronograma-writeback-v1:')).toEqual([])
    expect(keys('chronograma.googlePush.')).toEqual([])
    expect(localStorage.getItem('chronograma-lang')).toBe('ja')
    // 控えは使わない（次にログインしたら両方を残す合わせ方）が、ほかの人として同期したことは分かる
    expect(loadBaseline('u1')).toBeNull()
    expect(loadBaseline('u0')).toBeNull()
    expect(hasOtherUsersBaseline('u2')).toBe(true)
    expect(hasOtherUsersBaseline('u1')).toBe(true)
    for (const id of ['u0', 'u1']) expect(localStorage.getItem(`chronograma-sync-baseline-v1:${id}`)).toBe('null')
  })

  it('ログアウトすると、前の人の題名を含むものが端末に残らない', async () => {
    useTaskStore.getState().setDataOwner('u1')
    seedLeftovers()
    await clearLocalAccountState('u1')
    const rest = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k) ?? '')
      .join('\n')
    expect(rest).not.toMatch(/前の人/)
    expect(hasOtherUsersBaseline('u2')).toBe(true)
  })

  it('アカウントを消すと、その人の連携への送り待ちが端末に残らない', async () => {
    useTaskStore.getState().setDataOwner('u1')
    seedLeftovers()
    await clearDeletedAccount('u1')
    expect(keys('chronograma-writeback-v1:')).toEqual([])
    expect(keys('chronograma.googlePush.')).toEqual([])
  })
})

describe('容量が足りないとき（#256）', () => {
  it('写しとログイン中の人以外の控えの中身を手放して、本体を書き直す', () => {
    useTaskStore.getState().setDataOwner('u1')
    saveBaseline('u1', baseline)
    saveBaseline('u0', baseline)
    localStorage.setItem(`${UNREADABLE_COPY_PREFIX}1`, 'x')
    const real = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PERSIST_STORAGE_KEY && localStorage.getItem(`${UNREADABLE_COPY_PREFIX}1`) !== null) {
        throw new DOMException('full', 'QuotaExceededError')
      }
      real.call(this, k, v)
    })
    useTaskStore.getState().addTask('saved')
    vi.restoreAllMocks()
    expect(useTaskStore.getState().storageFull).toBe(false)
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toContain('saved')
    expect(keys(UNREADABLE_COPY_PREFIX)).toEqual([])
    expect(loadBaseline('u1')).not.toBeNull()
    expect(loadBaseline('u0')).toBeNull()
    expect(hasOtherUsersBaseline('u1')).toBe(true)
  })
})
