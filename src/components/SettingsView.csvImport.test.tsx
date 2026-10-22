import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SettingsView } from './SettingsView'
import { useTaskStore } from '../store/taskStore'

const st = () => useTaskStore.getState()

function csvInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"][accept=".csv,text/csv"]')!
}

describe('設定 › データ「ほかのアプリから取り込む」', () => {
  it('ラベルの無いリスト名があれば、件数を見せてラベルを作るかを先に聞く', async () => {
    st().setTimeLogTagPresets(['勉強'])
    const user = userEvent.setup()
    render(<SettingsView />)
    await user.click(screen.getByRole('button', { name: 'Backup, import and export' }))
    expect(screen.getByText('Import from other apps (TickTick, Todoist, CSV)')).toBeInTheDocument()

    const file = new File(['title,list\nA,勉強\nB,趣味\nC,趣味\nD,Inbox\n'], 'tasks.csv', { type: 'text/csv' })
    await user.upload(csvInput(), file)
    expect(await screen.findByText(/1 list\(s\) have no label with the same name \(2 tasks\): 趣味/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create labels' }))

    await waitFor(() => expect(st().tasks.some((t) => t.title === 'C')).toBe(true))
    expect(st().timeLogTagPresets).toEqual(['勉強', '趣味'])
    expect(st().tasks.find((t) => t.title === 'B')!.color).not.toBeNull()
  })

  it('「ラベルなしで入れる」ならラベルは作らない。取消なら何も入れない', async () => {
    st().setTimeLogTagPresets([])
    const user = userEvent.setup()
    render(<SettingsView />)
    await user.click(screen.getByRole('button', { name: 'Backup, import and export' }))
    const before = st().tasks.length

    await user.upload(csvInput(), new File(['title,list\nX,趣味\n'], 'a.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(st().tasks.length).toBe(before)

    await user.upload(csvInput(), new File(['title,list\nY,趣味\n'], 'b.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('button', { name: 'Import without labels' }))
    await waitFor(() => expect(st().tasks.some((t) => t.title === 'Y')).toBe(true))
    expect(st().tasks.find((t) => t.title === 'Y')!.color).toBeNull()
    expect(st().timeLogTagPresets).toEqual([])
  })
})
