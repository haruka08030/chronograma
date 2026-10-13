import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchLogLabels, pushLogLabels } from './supabaseData'
import { pendingAddsAfterImport, planLabelSync, settledLabelAdds, type LabelSyncPlan, type RemoteLabels } from './labelSync'
import { loadSettingSyncedAt, runSettingSync, settingSyncStep } from './settingSync'

type SettingsRow = { user_id: string; log_labels: unknown; updated_at: string; base_updated_at?: string | null }

/**
 * `user_settings` の偽物。書き込みは `007` のトリガー（settings_write_guard）と同じに振る舞う:
 * base_updated_at を送った書き込みはサーバーの行の updated_at と同じときだけ通し、updated_at をサーバーの時計にする。
 * 送らない書き込みは前の動き（updated_at が古ければ捨てる）。`noBaseColumn` は `007` を流す前の DB
 */
function fakeSettings(opts: { noBaseColumn?: boolean } = {}) {
  const rows = new Map<string, SettingsRow>()
  let tick = 0
  const serverNow = () => `2026-10-03T00:00:00.${String(++tick).padStart(6, '0')}+00:00`
  const ms = (iso: string) => Date.parse(iso)
  const client = {
    from: () => ({
      select: () => {
        let userId = ''
        const q = {
          eq: (_c: string, v: string) => ((userId = v), q),
          maybeSingle: async () => {
            const r = rows.get(userId)
            return { data: r ? { log_labels: r.log_labels, updated_at: r.updated_at } : null, error: null }
          },
        }
        return q
      },
      upsert: (body: SettingsRow, o?: { ignoreDuplicates?: boolean }) => ({
        select: async () => {
          if (o?.ignoreDuplicates && rows.has(body.user_id)) return { data: [], error: null }
          if (opts.noBaseColumn && 'base_updated_at' in body) {
            return { data: null, error: { message: "Could not find the 'base_updated_at' column of 'user_settings' in the schema cache" } }
          }
          const { base_updated_at: base, ...row } = body
          const old = rows.get(row.user_id)
          let next: SettingsRow
          if (base === undefined) {
            if (old && ms(row.updated_at) < ms(old.updated_at)) return { data: [], error: null }
            next = { ...row }
          } else {
            if (old ? base !== old.updated_at : base !== '-infinity') return { data: [], error: null }
            next = { ...row, updated_at: serverNow() }
          }
          rows.set(row.user_id, next)
          return { data: [{ updated_at: next.updated_at }], error: null }
        },
      }),
    }),
  }
  return { client: client as unknown as SupabaseClient, rows }
}

/** 1 台の端末（手元のラベル表と、その端末の時計） */
function device(clockMs: number, presets: string[]) {
  const d = {
    presets,
    updatedAt: null as string | null,
    clock: clockMs,
    edit(next: string[]) {
      d.presets = next
      d.updatedAt = new Date(d.clock).toISOString()
    },
  }
  return d
}

/** 端末ごとにもとにした版を覚える場所を分ける（同じ利用者でも端末は別の localStorage） */
async function sync(
  sb: SupabaseClient,
  d: ReturnType<typeof device>,
  deviceId: string,
  clockOffsetMs = 0,
  onPlan?: (p: LabelSyncPlan) => void,
  beforePush?: () => Promise<void>,
) {
  await runSettingSync<RemoteLabels, NonNullable<LabelSyncPlan['apply']>, NonNullable<LabelSyncPlan['push']>>(
    deviceId,
    {
      key: 'labels',
      fetch: () => fetchLogLabels(sb, 'u1'),
      plan: (remote, syncedAt, offset) => {
        const p = planLabelSync(
          { presets: d.presets, colors: {}, updatedAt: d.updatedAt, syncedAt },
          remote,
          new Date(d.clock).toISOString(),
          offset,
        )
        onPlan?.(p)
        return p
      },
      localUpdatedAt: () => d.updatedAt,
      applyLocal: (a) => {
        d.presets = a.presets
        d.updatedAt = a.updatedAt
      },
      setLocalUpdatedAt: (at) => {
        d.updatedAt = at
      },
      push: async (p) => {
        await beforePush?.()
        return pushLogLabels(sb, 'u1', p, p.base)
      },
    },
    { clockOffsetMs },
  )
}

const REAL = Date.parse('2026-10-03T00:00:00Z')
const DAY = 86_400_000

beforeEach(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})

describe('設定（1 行）の同期: サーバーの時計で版を付ける (#197)', () => {
  it('時計が進んだ端末の古いラベル表が、あとで別の端末が変えた内容を上書きし続けない', async () => {
    const { client, rows } = fakeSettings()
    const fast = device(REAL + 30 * DAY, ['授業'])
    const ok = device(REAL, ['授業'])
    fast.edit(['授業', 'バイト'])
    await sync(client, fast, 'fast')
    await sync(client, ok, 'ok')
    expect(ok.presets).toEqual(['授業', 'バイト'])

    // 正しい時計の端末があとで変える（手元の時刻は進んだ端末の時刻より前）
    ok.edit(['授業', 'バイト', 'ジム'])
    await sync(client, ok, 'ok')
    expect((rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)).toEqual(['授業', 'バイト', 'ジム'])

    // 進んだ端末は手元を変えていないので、送らずにサーバーに合わせる（前は手元の時刻が新しいので送り返していた）
    await sync(client, fast, 'fast')
    expect(fast.presets).toEqual(['授業', 'バイト', 'ジム'])
    expect((rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)).toEqual(['授業', 'バイト', 'ジム'])
  })

  it('送れたらサーバーが付けた版を手元の時刻ともとにした版にする', async () => {
    const { client, rows } = fakeSettings()
    const d = device(REAL, ['授業'])
    d.edit(['授業', 'ジム'])
    await sync(client, d, 'd')
    expect(d.updatedAt).toBe(rows.get('u1')!.updated_at)
    expect(loadSettingSyncedAt('d', 'labels')).toBe(rows.get('u1')!.updated_at)
    // 次の同期では何も送らない
    const plans: LabelSyncPlan[] = []
    await sync(client, d, 'd', 0, (p) => plans.push(p))
    expect(plans).toEqual([{}])
  })

  it('取得した後に他の端末が変えていたら、サーバーが断り、取り直して合わせ直す', async () => {
    const { client, rows } = fakeSettings()
    const a = device(REAL, ['授業'])
    a.edit(['授業'])
    await sync(client, a, 'a')
    const b = device(REAL, [])
    await sync(client, b, 'b')

    // a が取得した直後（送る前）に b が送る
    a.clock = REAL + 60_000
    a.edit(['授業', 'A の追加'])
    b.edit(['授業', 'B の追加'])
    let interleaved = false
    const plans: LabelSyncPlan[] = []
    await sync(
      client,
      a,
      'a',
      0,
      (p) => plans.push(p),
      async () => {
        if (interleaved) return
        interleaved = true
        await sync(client, b, 'b')
      },
    )
    expect((plans[0].push?.labels ?? []).map((l) => l.name)).toEqual(['授業', 'A の追加'])
    // 1 回目は古い版をもとにしていて断られ、取り直した 2 回目は b の版をもとに送る（a の編集のほうが新しい）
    expect(plans).toHaveLength(2)
    expect(plans[1].push?.base).toBe(b.updatedAt)
    // 両方が足したラベルは名前ごとに合わせて両方残す（並びは新しいほう＝a が先）
    expect((rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)).toEqual(['授業', 'A の追加', 'B の追加'])
    expect(a.updatedAt).toBe(rows.get('u1')!.updated_at)
  })

  it('両方で変えて、ほかの端末の編集のほうが新しければ、断られた後にそちらの並びで両方のラベルを残す', async () => {
    const { client, rows } = fakeSettings()
    const a = device(REAL - 60_000, ['授業'])
    a.edit(['授業'])
    await sync(client, a, 'a')
    const b = device(REAL + 60_000, [])
    await sync(client, b, 'b')
    a.edit(['授業', 'A の追加'])
    b.edit(['授業', 'B の追加'])
    let interleaved = false
    await sync(client, a, 'a', 0, undefined, async () => {
      if (interleaved) return
      interleaved = true
      await sync(client, b, 'b')
    })
    // 名前ごとに合わせて両方残す（並びは新しいほう＝b が先）
    expect(a.presets).toEqual(['授業', 'B の追加', 'A の追加'])
    expect((rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)).toEqual(['授業', 'B の追加', 'A の追加'])
  })

  it('版の列が無いと言われても、版を外して送り直さない（失敗として返す）', async () => {
    const { client, rows } = fakeSettings({ noBaseColumn: true })
    const res = await pushLogLabels(client, 'u1', { labels: [{ name: 'A', color: '' }], updatedAt: new Date(REAL).toISOString() }, null)
    expect(res).toMatchObject({ error: expect.stringContaining('base_updated_at') })
    expect(rows.has('u1')).toBe(false)
  })

  it('サーバーに行が無いはずの書き込み（-infinity）は、ほかの端末が先に行を作っていれば断られる', async () => {
    const { client } = fakeSettings()
    const res1 = await pushLogLabels(client, 'u1', { labels: [], updatedAt: new Date(REAL).toISOString() }, null)
    expect('updatedAt' in res1).toBe(true)
    const res2 = await pushLogLabels(client, 'u1', { labels: [{ name: 'x', color: '' }], updatedAt: new Date(REAL).toISOString() }, null)
    expect(res2).toEqual({ stale: true })
  })
})

describe('ラベル表を 2 台で別々に変えたとき（#261）', () => {
  it('2 台で別々に足したラベルはどちらも残る', async () => {
    const { client, rows } = fakeSettings()
    const phone = device(REAL, ['授業'])
    const pc = device(REAL, ['授業'])
    phone.edit(['授業'])
    await sync(client, phone, 'phone')
    await sync(client, pc, 'pc')
    phone.clock += 1000
    pc.clock += 2000
    phone.edit(['授業', 'ゼミ'])
    pc.edit(['授業', 'バイト'])
    await sync(client, phone, 'phone')
    await sync(client, pc, 'pc')
    await sync(client, phone, 'phone')
    const names = (rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)
    expect(names.sort()).toEqual(['ゼミ', 'バイト', '授業'].sort())
    expect([...phone.presets].sort()).toEqual(names)
    expect([...pc.presets].sort()).toEqual(names)
  })
})

describe('settingSyncStep', () => {
  const S1 = '2026-10-01T00:00:00.000001+00:00'
  const S2 = '2026-10-01T00:00:00.000002+00:00'
  it('どちらも変えていなければ何もしない', () => {
    expect(settingSyncStep({ updatedAt: S1, syncedAt: S1 }, { updatedAt: S1 }, true)).toEqual({ kind: 'none' })
  })
  it('サーバーだけ変わったら合わせる（中身が同じなら版だけ）', () => {
    expect(settingSyncStep({ updatedAt: S1, syncedAt: S1 }, { updatedAt: S2 }, false)).toEqual({ kind: 'apply' })
    expect(settingSyncStep({ updatedAt: S1, syncedAt: S1 }, { updatedAt: S2 }, true)).toEqual({ kind: 'adopt' })
  })
  it('手元だけ変えたら、もとにした版を付けて送る', () => {
    expect(settingSyncStep({ updatedAt: '2030-01-01T00:00:00.000Z', syncedAt: S1 }, { updatedAt: S1 }, false)).toEqual({
      kind: 'push',
      base: S1,
    })
  })
  it('サーバーに行が無ければ送る', () => {
    expect(settingSyncStep({ updatedAt: null, syncedAt: null }, null, false)).toEqual({ kind: 'push', base: null })
  })
})

describe('取り込みで足したラベルは、ほかの端末のラベルの編集を上書きしない（#357）', () => {
  /** 手元の表・取り込みで足した名前を持つ端末（useSupabaseSync と同じつなぎ方） */
  function labelDevice(presets: string[]) {
    return { presets, colors: {} as Record<string, string>, updatedAt: null as string | null, pending: [] as string[] }
  }
  type LabelDevice = ReturnType<typeof labelDevice>

  async function syncLabels(sb: SupabaseClient, d: LabelDevice, deviceId: string) {
    await runSettingSync<RemoteLabels, NonNullable<LabelSyncPlan['apply']>, NonNullable<LabelSyncPlan['push']>>(deviceId, {
      key: 'labels',
      fetch: () => fetchLogLabels(sb, 'u1'),
      plan: (remote, syncedAt, offset) => {
        const settled = settledLabelAdds(d.pending, d.presets, remote)
        d.pending = d.pending.filter((n) => !settled.includes(n))
        return planLabelSync(
          { presets: d.presets, colors: d.colors, updatedAt: d.updatedAt, syncedAt, pendingAdds: d.pending },
          remote,
          new Date(REAL).toISOString(),
          offset,
        )
      },
      localUpdatedAt: () => d.updatedAt,
      applyLocal: (a) => {
        d.presets = a.presets
        d.colors = a.colors
        d.updatedAt = a.updatedAt
      },
      setLocalUpdatedAt: (at) => {
        d.updatedAt = at
      },
      push: (p) => pushLogLabels(sb, 'u1', p, p.base),
      onPushed: (p) => {
        d.pending = d.pending.filter((n) => !p.labels.some((l) => l.name === n))
      },
    })
  }

  it('PC で名前・色を変えたあと、スマホで Notion がラベルを足しても PC の編集が残る', async () => {
    const { client, rows } = fakeSettings()
    const pc = labelDevice(['授業', 'バイト'])
    const phone = labelDevice(['授業', 'バイト'])
    pc.colors = { 授業: 'sage', バイト: 'peacock' }
    phone.colors = { 授業: 'sage', バイト: 'peacock' }
    pc.updatedAt = new Date(REAL).toISOString()
    await syncLabels(client, pc, 'pc')
    await syncLabels(client, phone, 'phone')
    expect(phone.presets).toEqual(['授業', 'バイト'])

    // PC: バイト → アルバイト、授業の色を変えて先頭へ
    pc.presets = ['アルバイト', '授業']
    pc.colors = { アルバイト: 'peacock', 授業: 'tomato' }
    pc.updatedAt = new Date(REAL + 60_000).toISOString()
    await syncLabels(client, pc, 'pc')

    // スマホ: まだ PC の変更を受け取る前に、取り込みで「経済学」を足す（変えた時刻は進めない）
    const before = phone.presets
    phone.presets = [...phone.presets, '経済学']
    phone.colors = { ...phone.colors, 経済学: 'grape' }
    phone.pending = pendingAddsAfterImport(phone.pending, before, phone.presets)
    await syncLabels(client, phone, 'phone')

    const expected = ['アルバイト', '授業', '経済学']
    expect(phone.presets).toEqual(expected)
    expect(phone.colors).toEqual({ アルバイト: 'peacock', 授業: 'tomato', 経済学: 'grape' })
    expect(phone.pending).toEqual([])
    expect((rows.get('u1')!.log_labels as { name: string }[]).map((l) => l.name)).toEqual(expected)

    // PC は送られた表に合わせるだけ（何も送り返さない）
    const version = rows.get('u1')!.updated_at
    await syncLabels(client, pc, 'pc')
    expect(pc.presets).toEqual(expected)
    expect(rows.get('u1')!.updated_at).toBe(version)
    // スマホももう何も送らない
    await syncLabels(client, phone, 'phone')
    expect(rows.get('u1')!.updated_at).toBe(version)
  })
})
