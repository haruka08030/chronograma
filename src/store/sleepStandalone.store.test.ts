import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/** 睡眠は睡眠の入力からだけ作る（#519）。題名・ラベルが「睡眠」の記録は記録のまま */
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

const { useTaskStore } = await import('./taskStore')

beforeEach(() => {
  useTaskStore.setState({ tasks: [], activeTimer: null, completePromptTaskId: null, labelPromptLogId: null })
})

describe('睡眠は題名で判別しない', () => {
  it('後から記録で題名・ラベルを「睡眠」「sleep」にしても記録のまま', () => {
    const s = useTaskStore.getState()
    s.addTimeLog('睡眠', '2026-10-07', '23:30', '07:00', [], undefined, '2026-10-08')
    s.addTimeLog('夜', '2026-10-07', '01:00', '02:00', ['sleep'])
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['log', 'log'])
  })

  it('睡眠の入力（logSleep）からは睡眠になる', () => {
    useTaskStore.getState().logSleep('2026-10-08', '23:30', '07:00')
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['sleep'])
  })
})
