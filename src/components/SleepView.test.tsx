import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { useTaskStore } from '../store/taskStore'
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

  it('いつもの時刻は「決める」で前回の時刻から始まり、「前回の時刻を使う」で外せる', async () => {
    const user = userEvent.setup()
    useTaskStore.getState().logSleep(dayKey(0), '00:30', '07:30')
    render(<SleepView />)
    await user.click(screen.getByRole('button', { name: 'Set' }))
    expect(useTaskStore.getState().sleepPrefs).toMatchObject({ usualBed: '00:30', usualWake: '07:30' })
    await user.click(screen.getByRole('button', { name: 'Use last times' }))
    expect(useTaskStore.getState().sleepPrefs).toMatchObject({ usualBed: null, usualWake: null })
  })
})
