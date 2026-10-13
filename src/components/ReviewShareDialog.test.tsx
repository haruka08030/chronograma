import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { toDateKey } from '../lib/dateKey'
import { zonedNow } from '../lib/timeZone'
import type { ReviewImageModel } from '../lib/reviewImage'
import type { Task } from '../types/task'
import { WeekReviewCard } from './WeekReviewCard'

// jsdom には canvas が無いので、画像はモデルを覚えておくだけの PNG に差し替える（描く中身は lib のテストで見る）
const rendered: ReviewImageModel[] = []
vi.mock('../lib/reviewImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/reviewImage')>()
  return {
    ...actual,
    renderReviewImage: vi.fn(async (model: ReviewImageModel) => {
      rendered.push(model)
      return new Blob(['png'], { type: 'image/png' })
    }),
  }
})
const downloadBlob = vi.fn()
vi.mock('../lib/downloadFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/downloadFile')>()),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

const SECRET = 'Final interview at Acme'

function seed() {
  const today = toDateKey(zonedNow())
  useTaskStore.setState({
    tasks: [
      task('l1', {
        kind: 'log',
        completed: true,
        title: SECRET,
        description: 'salary talk',
        category: 'Job hunt',
        tags: ['Job hunt'],
        dueDate: today,
        startTime: '00:10',
        endTime: '02:10',
      }),
    ],
    timeLogTagPresets: ['Job hunt'],
  })
}

const SHARE_KEY = 'chronograma-review-share-v1'
const URL_API = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }

beforeEach(() => {
  rendered.length = 0
  downloadBlob.mockReset()
  localStorage.removeItem(SHARE_KEY)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  URL.createObjectURL = URL_API.createObjectURL
  URL.revokeObjectURL = URL_API.revokeObjectURL
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('WeekReviewCard: 画像にして共有（#283）', () => {
  it('記録の無い期間は押せない', () => {
    useTaskStore.setState({ tasks: [] })
    render(<WeekReviewCard />)
    expect(screen.getByRole('button', { name: /Nothing logged in this period/ })).toBeDisabled()
  })

  it('見本を出し、題名・メモは画像にも共有の文にも入らない。共有できない環境は保存する', async () => {
    seed()
    render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Share as image' }))
    const dialog = await screen.findByRole('dialog')
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'blob:preview')
    expect(img.getAttribute('alt')).toMatch(/^Logged this week: 2h \(Job hunt 2h\)$/)
    expect(dialog).toHaveTextContent('To-do and record titles and notes are never included')

    const model = rendered.at(-1)!
    expect(JSON.stringify(model)).not.toContain(SECRET)
    expect(JSON.stringify(model)).not.toContain('salary')
    expect(model.labels.map((r) => r.name)).toEqual(['Job hunt'])

    fireEvent.click(screen.getByRole('button', { name: 'Save image' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(downloadBlob.mock.calls[0]![1]).toMatch(/^chronograma-review-\d{4}-\d{2}-\d{2}\.png$/)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('ラベル名を隠すと名前を入れず、その選択を端末に覚える', async () => {
    seed()
    const { unmount } = render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Share as image' }))
    fireEvent.click(await screen.findByRole('switch', { name: /Hide label names/ }))
    await waitFor(() => expect(rendered.at(-1)!.labels.map((r) => r.name)).toEqual([null]))
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Logged this week: 2h')
    expect(JSON.parse(localStorage.getItem(SHARE_KEY)!)).toEqual({ hideLabels: true })
    unmount()

    render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Share as image' }))
    expect(await screen.findByRole('switch', { name: /Hide label names/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('ファイルを共有できる端末は端末の共有に渡す', async () => {
    seed()
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share, canShare: () => true })
    render(<WeekReviewCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Share as image' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const data = share.mock.calls[0]![0] as ShareData
    expect(data.files![0]!.type).toBe('image/png')
    expect(data.text).not.toContain(SECRET)
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
