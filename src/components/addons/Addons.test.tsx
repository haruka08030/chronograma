import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_ADDONS } from '../../lib/addons'
import { AddonsView } from './AddonsView'
import { AddonsSettingsGroup } from './AddonsSettingsGroup'
import { TimetableButton } from '../calendar/TimetableButton'

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  useTaskStore.setState({ tasks: [], addons: DEFAULT_ADDONS, addonsUpdatedAt: null })
})

describe('追加機能の画面と設定（#453）', () => {
  it('時間割は最初はオフで、カレンダーの「時間割」ボタンも出ない。オンにすると「開く」とボタンが出る', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AddonsView />
        <TimetableButton />
      </>,
    )
    const sw = screen.getByRole('switch', { name: '時間割・欠席を使う' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('button', { name: '時間割' })).toBeNull()
    expect(screen.queryByRole('button', { name: '開く' })).toBeNull()

    await user.click(sw)
    expect(useTaskStore.getState().addons.enabled).toEqual({ timetable: true })
    expect(useTaskStore.getState().addonsUpdatedAt).not.toBeNull()
    expect(screen.getByRole('button', { name: '時間割' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '開く' }))
    expect(screen.getByRole('dialog', { name: '時間割' })).toBeTruthy()
  })

  it('設定でも同じオン・オフで、最後の行から追加機能の画面へ', async () => {
    const user = userEvent.setup()
    useTaskStore.setState({ addons: { enabled: { timetable: true } } })
    render(<AddonsSettingsGroup />)
    await user.click(screen.getByRole('switch', { name: '時間割・欠席を使う' }))
    expect(useTaskStore.getState().addons.enabled).toEqual({ timetable: false })
    await user.click(screen.getByRole('button', { name: '追加機能の画面を開く' }))
    expect(useTaskStore.getState().selectedView).toBe('addons')
  })
})
