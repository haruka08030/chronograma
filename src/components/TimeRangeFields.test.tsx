import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimeRangeFields } from './TimeRangeFields'

const pickStart = async (time: RegExp) => {
  await userEvent.click(screen.getByRole('combobox', { name: 'Start' }))
  await userEvent.click(screen.getByRole('option', { name: time }))
}

describe('TimeRangeFields', () => {
  it('予定は開始を動かすと長さを保って終わりもずらし、日をまたげない予定は 23:59 で止める', async () => {
    const onChange = vi.fn()
    const first = render(<TimeRangeFields startTime="10:00" endTime="11:30" onChange={onChange} />)
    await pickStart(/^13:00/)
    expect(onChange).toHaveBeenLastCalledWith({ startTime: '13:00', endTime: '14:30' })
    first.unmount()

    render(<TimeRangeFields startTime="22:00" endTime="23:30" onChange={onChange} />)
    await pickStart(/^23:00/)
    expect(onChange).toHaveBeenLastCalledWith({ startTime: '23:00', endTime: '23:59' })
  })

  it('日をまたげる予定（習慣）は 24 時間で回す', async () => {
    const onChange = vi.fn()
    render(<TimeRangeFields startTime="22:00" endTime="23:30" overnight onChange={onChange} />)
    await pickStart(/^23:00/)
    expect(onChange).toHaveBeenLastCalledWith({ startTime: '23:00', endTime: '00:30' })
  })

  it('記録・睡眠は実際の時刻なので開始だけ直す', async () => {
    const onChange = vi.fn()
    render(<TimeRangeFields kind="log" startTime="10:00" endTime="11:30" onChange={onChange} />)
    await pickStart(/^13:00/)
    expect(onChange).toHaveBeenLastCalledWith({ startTime: '13:00', endTime: '11:30' })
  })

  it('終わりの候補に長さを添え、durations={false} なら添えない', async () => {
    const first = render(<TimeRangeFields startTime="10:00" endTime="11:00" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'End' }))
    // 開始の 15 分後から、長さつき
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/^10:15.*15/)
    first.unmount()

    render(<TimeRangeFields startTime="10:00" endTime="11:00" durations={false} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'End' }))
    // ふつうの候補（0 時から、長さなし）
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/^00:00/)
  })

  it('時刻だけ（withEnd={false}）なら終わりの欄を出さない', () => {
    render(<TimeRangeFields startTime="10:00" endTime="" withEnd={false} onChange={() => {}} />)
    expect(screen.queryByRole('combobox', { name: 'End' })).toBeNull()
  })
})
