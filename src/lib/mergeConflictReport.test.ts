// @vitest-environment jsdom
// ためた回数を localStorage に残すので jsdom で回す
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportSyncError } from './errorReport'
import {
  MERGE_CONFLICTS_KEY,
  MERGE_CONFLICT_REPORT_INTERVAL_MS,
  noteMergeConflicts,
  resetMergeConflictReportForTests,
} from './mergeConflictReport'

vi.mock('./errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errorReport')>()),
  reportSyncError: vi.fn(),
}))

const T0 = new Date('2026-10-03T00:00:00Z')
const later = (ms: number) => new Date(T0.getTime() + ms)

beforeEach(() => {
  localStorage.clear()
  resetMergeConflictReportForTests()
  vi.mocked(reportSyncError).mockClear()
})

describe('両方で同じ項目を変えて片方を捨てた回数の記録（#357）', () => {
  it('最初は送り、そのあと 1 日はためておいて、1 日経ったらまとめて送る（表.項目と回数だけ）', () => {
    noteMergeConflicts({ 'tasks.title': 1 }, T0)
    expect(reportSyncError).toHaveBeenCalledTimes(1)
    expect(reportSyncError).toHaveBeenLastCalledWith('merge-conflicts', expect.any(String), {
      conflicts: { 'tasks.title': 1 },
      total: 1,
      since: T0.toISOString(),
    })

    noteMergeConflicts({ 'tasks.title': 2, 'lists.name': 1 }, later(60_000))
    noteMergeConflicts({}, later(2 * 60_000))
    noteMergeConflicts({ 'tasks.priority': 1 }, later(60 * 60_000))
    expect(reportSyncError).toHaveBeenCalledTimes(1)

    noteMergeConflicts({}, later(MERGE_CONFLICT_REPORT_INTERVAL_MS))
    expect(reportSyncError).toHaveBeenCalledTimes(2)
    expect(reportSyncError).toHaveBeenLastCalledWith('merge-conflicts', expect.any(String), {
      conflicts: { 'lists.name': 1, 'tasks.priority': 1, 'tasks.title': 2 },
      total: 4,
      since: later(60_000).toISOString(),
    })
    // 送ったぶんは消える。何も無ければ送らない
    noteMergeConflicts({}, later(3 * MERGE_CONFLICT_REPORT_INTERVAL_MS))
    expect(reportSyncError).toHaveBeenCalledTimes(2)
  })

  it('ためた回数はページを開き直しても残る', () => {
    noteMergeConflicts({ 'tasks.title': 1 }, T0)
    noteMergeConflicts({ 'habits.title': 3 }, later(1000))
    resetMergeConflictReportForTests()
    expect(JSON.parse(localStorage.getItem(MERGE_CONFLICTS_KEY)!).counts).toEqual({ 'habits.title': 3 })
    noteMergeConflicts({}, later(MERGE_CONFLICT_REPORT_INTERVAL_MS))
    expect(reportSyncError).toHaveBeenLastCalledWith('merge-conflicts', expect.any(String), expect.objectContaining({ total: 3 }))
  })

  it('表.項目の形でない名前は送らない（中身が混ざらない）', () => {
    noteMergeConflicts({ 'tasks.title': 1, 'tasks.レポート提出': 1, 'secret stuff': 2, 'notes.title': 1 }, T0)
    expect(reportSyncError).toHaveBeenLastCalledWith('merge-conflicts', expect.any(String), {
      conflicts: { 'tasks.title': 1 },
      total: 1,
      since: T0.toISOString(),
    })
  })

  it('回線が無いときは送らずにためておく', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    noteMergeConflicts({ 'tasks.title': 1 }, T0)
    expect(reportSyncError).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    noteMergeConflicts({}, later(1000))
    expect(reportSyncError).toHaveBeenCalledTimes(1)
    online.mockRestore()
  })

  it('端末の保存が使えなくても投げない', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => noteMergeConflicts({ 'tasks.title': 1 }, T0)).not.toThrow()
    set.mockRestore()
  })
})
