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
    useTaskStore.setState({ addons: { enabled: { timetable: true }, dues: [] } })
    render(<AddonsSettingsGroup />)
    await user.click(screen.getByRole('switch', { name: '時間割・欠席を使う' }))
    expect(useTaskStore.getState().addons.enabled).toEqual({ timetable: false })
    await user.click(screen.getByRole('button', { name: '追加機能の画面を開く' }))
    expect(useTaskStore.getState().selectedView).toBe('addons')
  })
})

describe('引き落とし・期限の日（#454）', () => {
  it('オンにして開き、足すと一覧に出る。今日の計画には近いものだけ出る', async () => {
    const user = userEvent.setup()
    const { PlannerDues } = await import('../today/PlannerDues')
    useTaskStore.setState({ addons: { enabled: { dues: true }, dues: [] } })
    const today = (await import('../../lib/timeZone')).appTodayKey()
    render(
      <>
        <AddonsView />
        <PlannerDues dateKey={today} />
      </>,
    )
    await user.click(screen.getAllByRole('button', { name: '開く' })[0]!)
    await user.click(screen.getByRole('button', { name: '足す' }))
    await user.type(screen.getByLabelText('名前'), '家賃の引き落とし')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(useTaskStore.getState().addons.dues).toMatchObject([{ title: '家賃の引き落とし', date: today, repeat: 'none', notifyDays: 1 }])
    expect(screen.getByRole('list', { name: '引き落とし・期限' }).textContent).toContain('家賃の引き落とし今日')
  })

  it('オフなら今日の計画に出さない', async () => {
    const { PlannerDues } = await import('../today/PlannerDues')
    const today = (await import('../../lib/timeZone')).appTodayKey()
    useTaskStore.setState({
      addons: { enabled: { dues: false }, dues: [{ id: 'a', title: '家賃', date: today, repeat: 'none', notifyDays: 0 }] },
    })
    render(<PlannerDues dateKey={today} />)
    expect(screen.queryByRole('list', { name: '引き落とし・期限' })).toBeNull()
  })
})
