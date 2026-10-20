import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { legacyLabelId } from '../lib/labelIds'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * ラベルの id（#365）の同期を、本物のストアと PostgREST・DB の偽物（`fakeSupabaseDb`、`033` のトリガーも真似る）で回す。
 * もう 1 台の端末（この版・前の版）はサーバーの行を直接書いて真似る
 */
const env = vi.hoisted(() => ({
  client: null as unknown,
  user: null as { id: string } | null,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  getSupabase: () => env.client,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: env.user, loading: false }),
}))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportSyncError: vi.fn(),
}))
vi.mock('./useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useAutoBackup')>()),
  backupNow: vi.fn(async () => true),
}))

let db: ReturnType<typeof fakeDb>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  localStorage.clear()
  useTaskStore.getState().resetLocalData()
  db = fakeDb()
  db.tables.lists!.push({ ...inboxRow })
  env.client = db.client
  env.user = null
})

afterEach(() => {
  vi.useRealTimers()
})

async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 200; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

/** 待ち時間（1.8 秒）の後の同期が終わるまで */
async function afterDebounce() {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  await untilSynced(before)
}

function signIn(userId: string) {
  env.user = { id: userId }
  return renderHook(() => useSupabaseSync())
}

const MATH = legacyLabelId('数学')
const ENG = legacyLabelId('英語')
const PEACOCK = '#039BE5'
const T0 = '2026-10-01T00:00:00.000000+00:00'

/** サーバーに、この版の端末が作ったラベル表と行がある（数学の記録・To-Do、英語の記録） */
function seedServer() {
  db.tables.user_settings = [
    {
      user_id: 'u1',
      log_labels: [
        { id: MATH, name: '数学', color: 'peacock' },
        { id: ENG, name: '英語', color: 'sage' },
      ],
      updated_at: T0,
    },
  ]
  db.tables.tasks!.push(
    taskRow('r1', { is_time_log: true, category: '数学', tags: ['数学'], label_id: MATH, updated_at: T0 }),
    taskRow('t1', { color: PEACOCK, label_id: MATH, updated_at: T0 }),
    taskRow('r2', { is_time_log: true, category: '英語', tags: ['英語'], label_id: ENG, updated_at: T0 }),
  )
}

const serverRow = (id: string) => db.tables.tasks!.find((r) => r.id === id)!
const local = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)!
const settingsRow = () => db.tables.user_settings!.find((r) => r.user_id === 'u1')!

/** 別の端末の変更を取り込む（回線が戻った合図で同期させる） */
async function pullNow() {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
    window.dispatchEvent(new Event('online'))
  })
  await untilSynced(before)
}

describe('ラベルの id の同期（#365）', () => {
  it('この端末でラベルの名前・色を変えても、サーバーの記録・To-Do の行は書き直さない（ラベル表だけ送る）', async () => {
    seedServer()
    signIn('u1')
    await untilSynced()
    expect(useTaskStore.getState().timeLogTagPresets).toEqual(['数学', '英語'])
    expect(local('r1')).toMatchObject({ category: '数学', labelId: MATH })

    act(() =>
      useTaskStore.getState().saveLogLabels([
        { from: '数学', name: '数学II', color: 'tomato' },
        { from: '英語', name: '英語', color: 'sage' },
      ]),
    )
    await afterDebounce()
    // 行はそのまま（updated_at も名前・色も）
    for (const id of ['r1', 't1', 'r2']) expect(serverRow(id).updated_at).toBe(T0)
    expect(serverRow('r1').category).toBe('数学')
    // ラベル表は同じ id で新しい名前・色
    expect(settingsRow().log_labels).toEqual([
      { id: MATH, name: '数学II', color: 'tomato' },
      { id: ENG, name: '英語', color: 'sage' },
    ])
    // 手元は今の名前・色で読む
    expect(local('r1')).toMatchObject({ category: '数学II', labelId: MATH })
    expect(local('t1')).toMatchObject({ color: '#D50000', labelId: MATH })

    // 次の同期でも送り直さない
    await pullNow()
    for (const id of ['r1', 't1', 'r2']) expect(serverRow(id).updated_at).toBe(T0)
  })

  it('ほかの端末（この版）が名前・色を変えたら、行は古い名前・色のままでも今の名前・色で読み、送り直さない', async () => {
    seedServer()
    signIn('u1')
    await untilSynced()
    Object.assign(settingsRow(), {
      log_labels: [
        { id: MATH, name: '線形代数', color: 'grape' },
        { id: ENG, name: '英語', color: 'sage' },
      ],
      updated_at: '2026-10-03T08:00:00.000000+00:00',
    })
    await pullNow()
    expect(useTaskStore.getState().timeLogTagPresets).toEqual(['線形代数', '英語'])
    expect(local('r1')).toMatchObject({ category: '線形代数', labelId: MATH })
    expect(local('t1')).toMatchObject({ color: '#8E24AA', labelId: MATH })
    await pullNow()
    for (const id of ['r1', 't1', 'r2']) expect(serverRow(id).updated_at).toBe(T0)
  })

  it('前の版の端末と並べて使っても、ラベルが消えない・入れ替わらない', async () => {
    seedServer()
    signIn('u1')
    await untilSynced()
    // この端末で名前を変える（行は古い名前のまま）
    act(() =>
      useTaskStore.getState().saveLogLabels([
        { from: '数学', name: '数学II', color: 'peacock' },
        { from: '英語', name: '英語', color: 'sage' },
      ]),
    )
    await afterDebounce()

    // 前の版の端末: 記録 r1 の分類を「英語」に変える（label_id を知らないので送らない → サーバーが外す）
    const base = String(serverRow('r1').updated_at)
    await db.client
      .from('tasks')
      .upsert([{ ...serverRow('r1'), label_id: undefined, category: '英語', tags: ['英語'], base_updated_at: base }], {
        onConflict: 'user_id,id',
      })
      .select()
    expect(serverRow('r1').label_id).toBeNull()
    // 前の版の端末: ラベル表を id 無しで送る（英語 → English に名前を変え、行も書き直す）
    Object.assign(settingsRow(), {
      log_labels: [
        { name: '数学II', color: 'peacock' },
        { name: 'English', color: 'sage' },
      ],
      updated_at: '2026-10-03T08:00:00.000000+00:00',
    })
    // 前の版はラベル名を変えると、その名前の行を全部書き直す（r1 も r2 も English）
    for (const id of ['r1', 'r2']) {
      await db.client
        .from('tasks')
        .upsert(
          [
            {
              ...serverRow(id),
              label_id: undefined,
              category: 'English',
              tags: ['English'],
              base_updated_at: String(serverRow(id).updated_at),
            },
          ],
          {
            onConflict: 'user_id,id',
          },
        )
        .select()
    }
    await pullNow()

    const s = useTaskStore.getState()
    expect(s.timeLogTagPresets).toEqual(['数学II', 'English'])
    // 数学II は名前で手元の id に合わせる（To-Do は数学II のまま）
    expect(local('t1')).toMatchObject({ color: PEACOCK, labelId: MATH })
    // 前の版が分類を変えた記録（数学 → 英語 → English）は English。数学II には戻らない
    expect(local('r1')).toMatchObject({ category: 'English', labelId: legacyLabelId('English') })
    expect(local('r2')).toMatchObject({ category: 'English', labelId: legacyLabelId('English') })
  })
})
