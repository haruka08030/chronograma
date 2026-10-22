import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { setAppTimeZoneSetting } from '../lib/timeZone'
import { RecordPanel } from './RecordPanel'

/** 記録の名前の候補と、打っている間のラベルの推定（#415） */
const NOW = '2026-10-08T06:00:00.000Z' // 東京 15:00

beforeAll(async () => {
  await i18n.changeLanguage('ja')
})
afterAll(async () => {
  await i18n.changeLanguage('en')
  setAppTimeZoneSetting(null)
})
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(NOW))
  useTaskStore.setState({
    appTimeZone: 'Asia/Tokyo',
    tasks: [],
    activeTimer: null,
    timeLogTagPresets: ['課題', 'バイト'],
    logCategoryColors: { 課題: 'peacock', バイト: 'tomato' },
  })
  const add = useTaskStore.getState().addTimeLog
  add('STAT 勉強', '2026-10-05', '10:00', '11:30', ['課題'])
  add('STAT 勉強', '2026-10-06', '10:00', '11:30', ['課題'])
  add('カフェ', '2026-10-06', '17:00', '21:00', ['バイト'])
})
afterEach(() => vi.useRealTimers())

const openLater = () => {
  render(<RecordPanel dateKey="2026-10-08" viewingToday reviewing={false} />)
  fireEvent.click(screen.getByRole('button', { name: '後から記録' }))
  const input = screen.getByPlaceholderText(/何をした？/)
  fireEvent.focus(input)
  return input
}

describe('記録の名前の候補', () => {
  it('打つと過去の記録が出て、選ぶとラベルが入り、始まりはいつもの長さだけ前になる', () => {
    const input = openLater()
    fireEvent.change(input, { target: { value: 'st' } })
    fireEvent.click(screen.getByRole('option', { name: /STAT 勉強/ }))
    expect(input).toHaveValue('STAT 勉強')
    expect(screen.getByRole('button', { name: '色とラベル' })).toHaveTextContent('課題')
    fireEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(useTaskStore.getState().tasks.at(-1)).toMatchObject({
      title: 'STAT 勉強',
      category: '課題',
      startTime: '13:30',
      endTime: '15:00',
    })
  })

  it('空欄では出さない。打った名前から推定したラベルを先に選び、自分で選び直したら上書きしない', () => {
    const input = openLater()
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'STAT HW' } })
    const picker = screen.getByRole('button', { name: '色とラベル' })
    expect(picker).toHaveTextContent('課題')
    fireEvent.click(picker)
    fireEvent.click(screen.getByRole('radio', { name: /^バイト（/ }))
    fireEvent.change(input, { target: { value: 'STAT HW2' } })
    expect(picker).toHaveTextContent('バイト')
  })

  it('ラベルは色の一覧で選ぶ。候補は設定のラベルだけ（記録にだけ残る古いラベルは出さない）、名前の無い色は色だけ付く', () => {
    useTaskStore.getState().addTimeLog('昔', '2026-10-01', '10:00', '11:00', ['消したラベル'])
    const input = openLater()
    fireEvent.change(input, { target: { value: '散歩' } })
    fireEvent.click(screen.getByRole('button', { name: '色とラベル' }))
    expect(screen.getByRole('radio', { name: /^課題（/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /消したラベル/ })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'セージ' }))
    expect(screen.getByRole('button', { name: '色とラベル' })).toHaveTextContent('セージ')
    fireEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(useTaskStore.getState().tasks.at(-1)).toMatchObject({ title: '散歩', category: null, color: '#33B679' })
  })

  it('Esc は候補だけ閉じ、何も選んでいない Enter はそのまま記録する', () => {
    const input = openLater()
    fireEvent.change(input, { target: { value: 'カ' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useTaskStore.getState().tasks.at(-1)).toMatchObject({ title: 'カ' })
  })

  it('後から記録で、重なる予定を空欄のまま出し、選ぶと予定の時間で記録する（#416）', () => {
    useTaskStore.setState((st) => ({
      tasks: [
        ...st.tasks,
        {
          ...st.tasks[0]!,
          id: 'ev',
          kind: 'event',
          title: 'ゼミ',
          completed: false,
          category: null,
          tags: [],
          dueDate: null,
          scheduledDate: '2026-10-08',
          startTime: '13:00',
          endTime: '14:30',
        },
      ],
    }))
    openLater()
    fireEvent.click(screen.getByRole('option', { name: /ゼミ/ }))
    fireEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(useTaskStore.getState().tasks.at(-1)).toMatchObject({ title: 'ゼミ', kind: 'log', startTime: '13:00', endTime: '14:30' })
  })

  it('打った文字に合う今日の To-Do を選ぶと、その To-Do に紐づいた記録になる（#416）', () => {
    useTaskStore.getState().addTaskWithTime('STAT HW#3', '2026-10-08', '20:00', '21:00')
    const todo = useTaskStore.getState().tasks.at(-1)!
    const input = openLater()
    fireEvent.change(input, { target: { value: 'hw' } })
    fireEvent.click(screen.getByRole('option', { name: /STAT HW#3/ }))
    fireEvent.click(screen.getByRole('button', { name: '記録する' }))
    expect(useTaskStore.getState().tasks.at(-1)).toMatchObject({ title: 'STAT HW#3', kind: 'log', sourceTaskId: todo.id })
  })
})
