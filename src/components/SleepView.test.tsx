import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { isSleepTask } from '../types/task'
import { toDateKey } from '../lib/dateKey'
import { appToday } from '../lib/timeZone'
import { SleepView } from './SleepView'

const dayKey = (offset: number) => toDateKey(addDays(appToday(), offset))

describe('睡眠のページ（#628）', () => {
  it('目標を決めると、届かなかった夜に差を出し、週と月の平均に目標との差の列が付く', async () => {
    const user = userEvent.setup()
    const { logSleep } = useTaskStore.getState()
    logSleep(dayKey(0), '01:00', '07:00')
    logSleep(dayKey(-1), '23:00', '07:00')
    render(<SleepView />)
    expect(screen.queryByText('Goal −1h')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: /Sleep goal/ }), '420')
    expect(useTaskStore.getState().sleepPrefs.goalMinutes).toBe(420)
    expect(screen.getByText('Goal −1h')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'vs goal' })).toBeInTheDocument()
  })

  it('夜ごとの一覧から記録を消せる（確認なし・「元に戻す」で戻る）', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().logSleep(dayKey(0), '01:00', '07:00')
    const liveSleep = () => useTaskStore.getState().tasks.filter((x) => isSleepTask(x) && !x.deletedAt)
    expect(liveSleep()).toHaveLength(1)
    render(<SleepView />)
    // 一覧の行（上の図にも同じ名前のボタンがあるので最後のもの）
    await user.click(screen.getAllByRole('button', { name: /01:00–07:00/ }).at(-1)!)
    await user.click(screen.getByRole('button', { name: 'Delete sleep' }))
    expect(liveSleep()).toHaveLength(0)
    const batch = useTaskStore.getState().recentDeletes.at(-1)!
    expect(batch.label).toMatchObject({ key: 'undo.sleepDeleted' })
    useTaskStore.getState().undoOperation(batch.undoId!)
    expect(liveSleep()).toHaveLength(1)
  })
})

describe('睡眠の予定（#652）', () => {
  it('「寝る時間を決める」で前回の時刻を全部の曜日に入れ、「毎日」の 1 行で出す（#659）。曜日ごとに分けて外せ、⌘Z で戻る', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().logSleep(dayKey(0), '00:30', '07:30')
    render(<SleepView />)
    await user.click(screen.getByRole('button', { name: 'Set bedtimes' }))
    const schedule = () => useTaskStore.getState().addons.sleepSchedule ?? {}
    expect(Object.keys(schedule())).toHaveLength(7)
    expect(schedule()[1]).toEqual({ bed: '00:30', wake: '07:30' })
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Monday morning' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Different time per day' }))
    await user.click(screen.getByRole('button', { name: 'Remove Monday morning' }))
    expect(schedule()[1]).toBeUndefined()
    useTaskStore.getState().undoLastOperation()
    expect(schedule()[1]).toEqual({ bed: '00:30', wake: '07:30' })
  })

  it('曜日で違う予定は 7 行で出し、「毎日同じ時間にする」でいちばん多い時刻にそろえて 1 行に戻す', async () => {
    const user = userEvent.setup()
    const a = { bed: '23:30', wake: '07:00' }
    const b = { bed: '01:00', wake: '09:00' }
    useTaskStore.getState().setSleepSchedule({ 1: a, 2: a, 3: a, 4: a, 5: a, 6: b, 7: b })
    render(<SleepView />)
    expect(screen.getByRole('button', { name: 'Remove Saturday morning' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Same time every day' }))
    expect(useTaskStore.getState().addons.sleepSchedule?.[7]).toEqual(a)
    expect(screen.getByText('Every day')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove sleep schedule' }))
    expect(useTaskStore.getState().addons.sleepSchedule).toEqual({})
  })
})
