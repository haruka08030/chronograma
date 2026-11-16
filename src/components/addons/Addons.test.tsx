import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/config'
import { useTaskStore } from '../../store/taskStore'
import { DEFAULT_ADDONS } from '../../lib/addons'
import { AddonsView } from './AddonsView'
import { AddonsSettingsGroup } from './AddonsSettingsGroup'
import { OverlayHost } from '../OverlayHost'
import { useOverlays } from '../../lib/overlays'

beforeEach(async () => {
  await i18n.changeLanguage('ja')
  useTaskStore.setState({ tasks: [], addons: DEFAULT_ADDONS, addonsUpdatedAt: null })
})

describe('追加機能の画面と設定（#453）', () => {
  it('学校は最初はオフ。オンにするとカードから学校のページへ進め、時間割はそこで開く（#617・#702）', async () => {
    const user = userEvent.setup()
    render(<AddonsView />)
    expect(screen.queryByRole('switch', { name: '時間割・欠席を使う' })).toBeNull()
    const sw = screen.getByRole('switch', { name: '学校を使う' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('button', { name: '学校' })).toBeNull()

    await user.click(sw)
    expect(useTaskStore.getState().addons.enabled).toEqual({ school: true })
    expect(useTaskStore.getState().addonsUpdatedAt).not.toBeNull()

    // 中身のページ: 時間割と授業の欠席が 1 ページに。戻ると一覧
    await user.click(screen.getByRole('button', { name: '学校' }))
    expect(screen.getByRole('heading', { level: 1, name: '学校' })).toBeTruthy()
    // 学期がまだ無ければ学期を足すところから
    expect(screen.getByRole('button', { name: '学期を追加' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '追加機能' }))
    expect(screen.getByRole('heading', { level: 1, name: '追加機能' })).toBeTruthy()
  })

  it('ⓘ で説明のポップアップが出る（オフでも）', async () => {
    const user = userEvent.setup()
    render(<AddonsView />)
    await user.click(screen.getByRole('button', { name: '学校の説明' }))
    const dialog = screen.getByRole('dialog', { name: '学校' })
    expect(dialog.textContent).toContain('休んだ回数')
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('学校の説明の「使い方」で、使い方を学校の節から開き、記事を開いて戻れ、検索で記事を探せる（#670・#673・#675）', async () => {
    Element.prototype.scrollIntoView = () => {}
    const user = userEvent.setup()
    render(
      <>
        <AddonsView />
        <OverlayHost />
      </>,
    )
    await user.click(screen.getByRole('button', { name: '学校の説明' }))
    await user.click(screen.getByRole('button', { name: '使い方' }))
    const guide = await screen.findByRole('dialog', { name: '使い方' })
    expect(useOverlays.getState().help).toBe('school')
    // 節は画面の並び（上から）
    const sections = within(guide)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(sections.slice(0, 5)).toEqual(['基本の操作', '今日の計画', 'To-Do', 'カレンダー', '習慣'])
    expect(sections).toContain('学校')

    await user.click(within(guide).getByRole('button', { name: '欠席を記録する' }))
    const article = within(guide).getByRole('article', { name: '欠席を記録する' })
    expect(within(article).getAllByRole('listitem').length).toBeGreaterThan(1)
    expect(article.textContent).toContain('「欠席にする」')
    await user.click(within(guide).getByRole('button', { name: '使い方' }))
    expect(within(guide).queryByRole('article')).toBeNull()

    await user.type(within(guide).getByRole('searchbox', { name: '使い方を検索' }), 'ラベル名')
    expect(within(guide).getByRole('button', { name: /授業の課題を表示する/ })).toBeTruthy()
    await user.clear(within(guide).getByRole('searchbox', { name: '使い方を検索' }))
    await user.type(within(guide).getByRole('searchbox', { name: '使い方を検索' }), 'zzzz')
    expect(within(guide).getByText('「zzzz」に合う記事は見つかりませんでした')).toBeTruthy()

    await user.click(within(guide).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('設定には追加機能の画面へ進む 1 行だけ（オン・オフは無い）', async () => {
    const user = userEvent.setup()
    render(<AddonsSettingsGroup />)
    expect(screen.queryByRole('switch')).toBeNull()
    await user.click(screen.getByRole('button', { name: '追加機能' }))
    expect(useTaskStore.getState().selectedView).toBe('addons')
  })
})

describe('引き落とし・期限の日（#454）', () => {
  it('オンにして開き、足すと一覧に出る。今日の計画には近いものだけ出る', async () => {
    const user = userEvent.setup()
    const { PlannerDues } = await import('../today/PlannerDues')
    useTaskStore.setState({ addons: { enabled: { dues: true }, dues: [], googleSkip: [], absenceCourses: [], school: null } })
    const today = (await import('../../lib/timeZone')).appTodayKey()
    render(
      <>
        <AddonsView />
        <PlannerDues dateKey={today} />
      </>,
    )
    await user.click(screen.getByRole('button', { name: '引き落とし・期限' }))
    await user.click(screen.getByRole('button', { name: '追加' }))
    await user.type(screen.getByLabelText('名前'), '家賃の引き落とし')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(useTaskStore.getState().addons.dues).toMatchObject([{ title: '家賃の引き落とし', date: today, repeat: 'none', notifyDays: 1 }])
    expect(screen.getByRole('list', { name: '引き落とし・期限' }).textContent).toContain('家賃の引き落とし今日')
  })

  it('オフなら今日の計画に出さない', async () => {
    const { PlannerDues } = await import('../today/PlannerDues')
    const today = (await import('../../lib/timeZone')).appTodayKey()
    useTaskStore.setState({
      addons: {
        enabled: { dues: false },
        dues: [{ id: 'a', title: '家賃', date: today, repeat: 'none', notifyDays: 0 }],
        googleSkip: [],
        absenceCourses: [],
        school: null,
      },
    })
    render(<PlannerDues dateKey={today} />)
    expect(screen.queryByRole('list', { name: '引き落とし・期限' })).toBeNull()
  })
})
