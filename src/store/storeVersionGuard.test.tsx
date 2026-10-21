import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from './taskStore'
import { PERSIST_STORAGE_KEY, STORE_VERSION } from './storeConstants'
import { persistBlocked, unblockPersistingForTests } from '../lib/persistStorage'
import { BEFORE_MIGRATION_COPY_PREFIX, UNREADABLE_COPY_PREFIX, latestStorageCopy } from '../lib/deviceCleanup'
import { StorageFullBanner } from '../components/StorageFullBanner'
import i18n from '../i18n/config'

const download = vi.hoisted(() => vi.fn())
vi.mock('../lib/downloadFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/downloadFile')>()),
  downloadTextFile: download,
}))

const task = (id: string) => ({
  id,
  title: id,
  listId: '__inbox__',
  order: 0,
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  tags: [],
})

afterEach(() => {
  unblockPersistingForTests()
  download.mockClear()
})

describe('保存データの版と読み込みの失敗（#485）', () => {
  it('新しい版のアプリが書いたデータは書き戻さず、再読み込みを促す', async () => {
    const raw = JSON.stringify({ state: { tasks: [task('t1')], lists: [], futureField: { x: 1 } }, version: STORE_VERSION + 1 })
    localStorage.setItem(PERSIST_STORAGE_KEY, raw)
    await useTaskStore.persist.rehydrate()

    expect(persistBlocked()).toBe('newer')
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(['t1'])
    useTaskStore.getState().addTask('edited in the old app')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe(raw)

    render(<StorageFullBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('storageFull.newer'))
  })

  it('古い版のデータは、移す前の本体を写してから移す', async () => {
    const raw = JSON.stringify({ state: { tasks: [task('t1')], lists: [] }, version: STORE_VERSION - 1 })
    localStorage.setItem(PERSIST_STORAGE_KEY, raw)
    await useTaskStore.persist.rehydrate()

    expect(persistBlocked()).toBeNull()
    expect(latestStorageCopy(BEFORE_MIGRATION_COPY_PREFIX)).toBe(raw)
    expect((JSON.parse(localStorage.getItem(PERSIST_STORAGE_KEY)!) as { version: number }).version).toBe(STORE_VERSION)
  })

  it('読み込めなければ保存を止め、元のデータを書き出せる', async () => {
    const raw = '{"state": {"tasks": [' // 途中で切れている
    localStorage.setItem(PERSIST_STORAGE_KEY, raw)
    await useTaskStore.persist.rehydrate()

    expect(persistBlocked()).toBe('unreadable')
    useTaskStore.getState().addTask('new')
    expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBe(raw)

    render(<StorageFullBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('storageFull.unreadable'))
    fireEvent.click(screen.getByRole('button', { name: i18n.t('storageFull.export') }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0]![0]).toBe(raw)
    expect(latestStorageCopy(UNREADABLE_COPY_PREFIX)).toBe(raw)
  })
})
