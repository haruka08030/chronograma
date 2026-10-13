import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadRawData, latestAutoBackup } from './crashRecovery'
import { useTaskStore } from '../store/taskStore'
import { PERSIST_STORAGE_KEY } from '../store/storeConstants'
import { listAutoBackups, loadAutoBackup } from './autoBackup'

vi.mock('./autoBackup', () => ({
  listAutoBackups: vi.fn(),
  loadAutoBackup: vi.fn(),
}))

/** 保存させたファイルの名前と中身 */
async function captureDownload(): Promise<{ name: string; body: string }> {
  let blob: Blob | null = null
  let name = ''
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    blob = b as Blob
    return 'blob:x'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    name = this.download
  })
  downloadRawData()
  return { name, body: await blob!.text() }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('落ちたときの書き出し（downloadRawData）', () => {
  it('ストアを通さず保存内容を書き出し、そのファイルは取り込みで全部読める', async () => {
    const s = useTaskStore.getState()
    const parent = s.addTask('親')!
    s.addTask('子', undefined, parent)
    s.addList('仕事', 'checklist')
    const before = useTaskStore.getState().tasks.map((t) => ({ id: t.id, title: t.title, parentId: t.parentId }))

    const { name, body } = await captureDownload()
    expect(name).toMatch(/^chronograma-rescue-\d{4}-\d{2}-\d{2}\.json$/)

    useTaskStore.getState().resetLocalData()
    expect(useTaskStore.getState().importData(body)).toBe(true)
    expect(useTaskStore.getState().tasks.map((t) => ({ id: t.id, title: t.title, parentId: t.parentId }))).toEqual(before)
    expect(useTaskStore.getState().lists.some((l) => l.name === '仕事')).toBe(true)
  })

  it('保存内容が JSON として読めなくても、中身をそのまま渡す（捨てない）', async () => {
    localStorage.setItem(PERSIST_STORAGE_KEY, '{"state":{"tasks":[{"id":"a"')
    const { body } = await captureDownload()
    expect(body).toBe('{"state":{"tasks":[{"id":"a"')
  })

  it('保存が無ければ空のバックアップを出す（落ちない）', async () => {
    localStorage.removeItem(PERSIST_STORAGE_KEY)
    const { body } = await captureDownload()
    expect(JSON.parse(body)).toMatchObject({ tasks: [], lists: [], habits: [], listSections: [] })
  })
})

describe('落ちたときの自動バックアップ（latestAutoBackup）', () => {
  const list = vi.mocked(listAutoBackups)
  const load = vi.mocked(loadAutoBackup)
  const meta = { id: 'b1', kind: 'daily' as const, savedAt: '2026-10-07T00:00:00.000Z', dateKey: '2026-10-07', todoCount: 1, logCount: 0 }

  it('ログイン中の人（Supabase のセッション）の控えだけを探す', async () => {
    localStorage.setItem('sb-proj-auth-token', JSON.stringify({ user: { id: 'user-1' } }))
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ state: { dataOwner: 'someone-else' }, version: 1 }))
    list.mockResolvedValue([meta])
    load.mockResolvedValue({ ...meta, json: '{"tasks":[]}' })
    expect(await latestAutoBackup()).toEqual({ savedAt: meta.savedAt, json: '{"tasks":[]}' })
    expect(list).toHaveBeenCalledWith('user-1')
    expect(load).toHaveBeenCalledWith('b1', 'user-1')
  })

  it('セッションが読めなければ保存したデータの持ち主、それも無ければログインしていない人として探す', async () => {
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ state: { dataOwner: 'owner-1' }, version: 1 }))
    list.mockResolvedValue([])
    expect(await latestAutoBackup()).toBeNull()
    expect(list).toHaveBeenLastCalledWith('owner-1')

    localStorage.setItem(PERSIST_STORAGE_KEY, '{broken')
    await latestAutoBackup()
    expect(list).toHaveBeenLastCalledWith(null)
  })

  it('一覧にあっても読めなければ null', async () => {
    list.mockResolvedValue([meta])
    load.mockResolvedValue(null)
    expect(await latestAutoBackup()).toBeNull()
  })
})
