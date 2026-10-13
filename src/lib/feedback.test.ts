import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({
  configured: true,
  insert: vi.fn<(row: unknown) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null })),
}))
vi.mock('./supabase', () => ({
  getSupabase: () => (sb.configured ? { from: () => ({ insert: sb.insert }) } : null),
}))

const { buildFeedbackRow, MAX_FEEDBACK_LENGTH, sendFeedback } = await import('./feedback')

beforeEach(() => {
  sb.configured = true
  sb.insert.mockReset()
  sb.insert.mockResolvedValue({ error: null })
})

describe('buildFeedbackRow', () => {
  it('trims the message and cuts it to the DB limit', () => {
    expect(buildFeedbackRow('  hi \n').message).toBe('hi')
    expect(buildFeedbackRow('あ'.repeat(MAX_FEEDBACK_LENGTH + 5)).message).toHaveLength(MAX_FEEDBACK_LENGTH)
  })
})

describe('sendFeedback', () => {
  it('inserts the row into feedback', async () => {
    expect(await sendFeedback('Bug')).toEqual({ ok: true })
    expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bug' }))
  })
  it('does not send an empty message or without Supabase', async () => {
    expect(await sendFeedback('   ')).toEqual({ ok: false, reason: 'failed' })
    sb.configured = false
    expect(await sendFeedback('Bug')).toEqual({ ok: false, reason: 'failed' })
    expect(sb.insert).not.toHaveBeenCalled()
  })
  it('tells the rate limit and network failures apart', async () => {
    sb.insert.mockResolvedValue({ error: { message: 'feedback_rate_limited' } })
    expect(await sendFeedback('Bug')).toEqual({ ok: false, reason: 'rateLimited' })
    sb.insert.mockResolvedValue({ error: { message: 'TypeError: Failed to fetch' } })
    expect(await sendFeedback('Bug')).toEqual({ ok: false, reason: 'network' })
    sb.insert.mockResolvedValue({ error: { message: 'permission denied for table feedback' } })
    expect(await sendFeedback('Bug')).toEqual({ ok: false, reason: 'failed' })
    sb.insert.mockRejectedValue(new Error('Load failed'))
    expect(await sendFeedback('Bug')).toEqual({ ok: false, reason: 'network' })
  })
})
