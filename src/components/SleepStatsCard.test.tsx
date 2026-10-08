import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays } from 'date-fns'
import { beforeAll, describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { sleepEndingOn } from '../lib/sleep'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
import { SleepStatsCard } from './SleepStatsCard'

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

const dayKey = (offset: number) => toDateKey(addDays(appToday(), offset))

/** 3 日前の朝（23:00–06:00）と今日の朝（23:30–07:00）に起きた睡眠。昨日などは抜けている */
function seedNights() {
  const { logSleep } = useTaskStore.getState()
  logSleep(dayKey(-3), '23:00', '06:00')
  logSleep(dayKey(0), '23:30', '07:00')
}

/** 入力欄（寝た・起きた）に時刻を入れて確定する */
async function typeTimes(user: ReturnType<typeof userEvent.setup>, editor: HTMLElement, bed: string, wake: string) {
  const [bedInput, wakeInput] = within(editor).getAllByRole('combobox')
  await user.clear(bedInput!)
  await user.type(bedInput!, bed)
  await user.tab()
  await user.clear(wakeInput!)
  await user.type(wakeInput!, wake)
  await user.tab()
}

const editorOf = () => screen.getByRole('button', { name: 'Save' }).closest('div')!

describe('統計の睡眠: 夜を押して直す・埋める', () => {
  it('記録のある夜の帯を押すと、その夜の時刻が入った入力欄で直せ、平均もすぐ変わる', async () => {
    seedNights()
    const user = userEvent.setup()
    render(<SleepStatsCard />)
    expect(screen.getByText('7h 15m')).toBeInTheDocument() // 平均（7h と 7h30m）

    await user.click(screen.getByRole('button', { name: /23:00–06:00/ }))
    const editor = editorOf()
    const [bedInput, wakeInput] = within(editor).getAllByRole('combobox')
    expect(bedInput).toHaveValue('23:00')
    expect(wakeInput).toHaveValue('06:00')

    await typeTimes(user, editor, '22:00', '06:00')
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    const r = sleepEndingOn(useTaskStore.getState().tasks, dayKey(-3))!
    expect([r.startTime, r.endTime]).toEqual(['22:00', '06:00'])
    // 8h と 7h30m の平均
    expect(screen.getByText('7h 45m')).toBeInTheDocument()
    expect(useTaskStore.getState().tasks.filter((t) => t.kind === 'sleep')).toHaveLength(2)
  })

  it('記録の無い夜の点線の枠を押すと、前回の時刻が入った入力欄でその夜を埋められる', async () => {
    seedNights()
    const user = userEvent.setup()
    render(<SleepStatsCard />)
    expect(screen.getByText(/\(2 logged\)/)).toBeInTheDocument()

    // いちばん右の抜けた夜＝昨日の朝
    const missing = screen.getAllByRole('button', { name: /^Log sleep for/ })
    await user.click(missing[missing.length - 1]!)
    const editor = editorOf()
    const [bedInput, wakeInput] = within(editor).getAllByRole('combobox')
    // 前回（今日の朝）の時刻
    expect(bedInput).toHaveValue('23:30')
    expect(wakeInput).toHaveValue('07:00')

    await typeTimes(user, editor, '00:30', '08:00')
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    const r = sleepEndingOn(useTaskStore.getState().tasks, dayKey(-1))!
    expect([r.startTime, r.endTime, r.dueDate]).toEqual(['00:30', '08:00', dayKey(-1)])
    expect(screen.getByText(/\(3 logged\)/)).toBeInTheDocument()
  })

  it('直した・埋めた睡眠は ⌘Z（取り消し）で元に戻る', async () => {
    seedNights()
    const user = userEvent.setup()
    render(<SleepStatsCard />)

    const missing = screen.getAllByRole('button', { name: /^Log sleep for/ })
    await user.click(missing[missing.length - 1]!)
    await user.click(within(editorOf()).getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/\(3 logged\)/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /23:00–06:00/ }))
    await typeTimes(user, editorOf(), '21:00', '06:00')
    await user.click(within(editorOf()).getByRole('button', { name: 'Save' }))
    expect(sleepEndingOn(useTaskStore.getState().tasks, dayKey(-3))?.startTime).toBe('21:00')

    useTaskStore.getState().undoLastOperation()
    expect(sleepEndingOn(useTaskStore.getState().tasks, dayKey(-3))?.startTime).toBe('23:00')
    useTaskStore.getState().undoLastOperation()
    expect(sleepEndingOn(useTaskStore.getState().tasks, dayKey(-1))).toBeNull()
    expect(await screen.findByText(/\(2 logged\)/)).toBeInTheDocument()
  })

  it('× や Esc でやめると何も変わらず入力欄が閉じる', async () => {
    seedNights()
    const user = userEvent.setup()
    render(<SleepStatsCard />)
    const before = useTaskStore.getState().tasks

    await user.click(screen.getByRole('button', { name: /23:00–06:00/ }))
    await typeTimes(user, editorOf(), '20:00', '05:00')
    await user.click(within(editorOf()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    const missing = screen.getAllByRole('button', { name: /^Log sleep for/ })
    await user.click(missing[0]!)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    await user.click(within(editorOf()).getAllByRole('combobox')[0]!)
    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    expect(useTaskStore.getState().tasks).toBe(before)
  })
})
