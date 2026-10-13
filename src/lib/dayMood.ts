/**
 * 1 日の気分とひとこと（#324）。今日の計画の「1 日を締める」で 5 つの記号から 1 つ押し、任意で一言を残す。
 * 過ぎた日の今日の計画の見出しに小さく出る。睡眠・記録と日付で突き合わせて読む（#326）。
 *
 * サーバーには利用者ごと・日ごとに 1 行（`day_moods`、`025`）。行は消さない（記号を外す・一言を消すのは null / '' の更新）ので、
 * 消えた行の印は要らない。日ごとに `settingSync.ts` と同じ合わせ方をする:
 * 手元は日ごとに「変えた時刻」（`updatedAt`、端末の時計）と「もとにしたサーバーの版」（`syncedAt`、サーバーの `updated_at`）を持ち、
 * 手元だけ変えていればその版を `base_updated_at` に付けて送る、サーバーだけ変わっていれば合わせる、両方なら新しいほう
 */
import { settingSyncStep } from './settingSync'
import { reportSyncError } from './errorReport'

/** 1 とても悪い 〜 5 とても良い */
export type Mood = 1 | 2 | 3 | 4 | 5
export const MOODS: readonly Mood[] = [1, 2, 3, 4, 5]

export type DayMood = {
  /** null は選んでいない（押した記号を外した） */
  mood: Mood | null
  note: string
  /** 手元で最後に変えた時刻。同期で合わせたらサーバーの版 */
  updatedAt: string
  /** 手元の値のもとになったサーバーの版。まだ一度も合わせていなければ null */
  syncedAt: string | null
}

/** 日付（`yyyy-MM-dd`、アプリのタイムゾーンの日）→ その日の気分 */
export type DayMoods = Record<string, DayMood>

/** ひとことの長さの上限（DB は 500 字まで） */
export const DAY_MOOD_NOTE_MAX = 140

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export const isMood = (v: unknown): v is Mood => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5

/** 入力したひとことをそろえる（1 行・前後の空白を落とす・上限で切る） */
export function cleanMoodNote(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, DAY_MOOD_NOTE_MAX)
}

/** 気分も一言も無い（選んでいない日と同じ） */
export const isEmptyDayMood = (m: Pick<DayMood, 'mood' | 'note'> | undefined) => !m || (m.mood === null && m.note === '')

/** 保存から読んだ値をそろえる。日付・時刻が読めない日は外す */
export function normalizeDayMoods(raw: unknown): DayMoods {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: DayMoods = {}
  for (const [day, v] of Object.entries(raw as Record<string, unknown>)) {
    const x = v as Partial<Record<keyof DayMood, unknown>> | null
    if (!DAY_KEY.test(day) || !x || typeof x.updatedAt !== 'string') continue
    out[day] = {
      mood: isMood(x.mood) ? x.mood : null,
      note: typeof x.note === 'string' ? x.note.slice(0, DAY_MOOD_NOTE_MAX) : '',
      updatedAt: x.updatedAt,
      syncedAt: typeof x.syncedAt === 'string' ? x.syncedAt : null,
    }
  }
  return out
}

/** サーバーの 1 行（`updatedAt` はサーバーの時計の版） */
export type RemoteDayMood = { day: string; mood: Mood | null; note: string; updatedAt: string }
/** 送る 1 行。`updatedAt` は手元で変えた時刻、`base` はもとにしたサーバーの版（行が無いはずなら null） */
export type DayMoodPush = { day: string; mood: Mood | null; note: string; updatedAt: string; base: string | null }

export type DayMoodSyncPlan = {
  /** サーバーに合わせる日 */
  apply: DayMoods
  /** 中身は同じ。手元の時刻ともとにした版をこのサーバーの版にそろえる日 */
  adopt: Record<string, string>
  push: DayMoodPush[]
}

const sameMood = (a: Pick<DayMood, 'mood' | 'note'>, b: Pick<DayMood, 'mood' | 'note'>) => a.mood === b.mood && a.note === b.note

/**
 * 日ごとにどちらに合わせるかを決める。`remote` は取得した行だけ（差分なら前回より後に変わった行）。
 * 取得に無い日は「サーバーは変わっていない」とみて、手元で変えていれば手元がもとにした版で送る
 * （実はサーバーで変わっていたら断られ、取り直して合わせ直す）
 */
export function planDayMoodSync(local: DayMoods, remote: readonly RemoteDayMood[], clockOffsetMs = 0): DayMoodSyncPlan {
  const plan: DayMoodSyncPlan = { apply: {}, adopt: {}, push: [] }
  const remoteByDay = new Map(remote.map((r) => [r.day, r]))
  const fromServer = (r: RemoteDayMood): DayMood => ({ mood: r.mood, note: r.note, updatedAt: r.updatedAt, syncedAt: r.updatedAt })
  const push = (day: string, l: DayMood, base: string | null) =>
    plan.push.push({ day, mood: l.mood, note: l.note, updatedAt: l.updatedAt, base })
  for (const r of remote) {
    const l = local[r.day]
    if (!l) {
      plan.apply[r.day] = fromServer(r)
      continue
    }
    const step = settingSyncStep(l, r, sameMood(l, r), clockOffsetMs)
    if (step.kind === 'apply') plan.apply[r.day] = fromServer(r)
    else if (step.kind === 'adopt') plan.adopt[r.day] = r.updatedAt
    else if (step.kind === 'push') push(r.day, l, step.base)
  }
  for (const [day, l] of Object.entries(local)) {
    if (remoteByDay.has(day) || l.updatedAt === l.syncedAt) continue
    push(day, l, l.syncedAt)
  }
  return plan
}

/** 送った結果。`written` はサーバーに通った日と付いた版（入っていない日は、取得した後に他の端末が変えていて断られた） */
export type DayMoodPushResult = { written: { day: string; updatedAt: string }[] } | { error: string }

/** 取得の目印（このログインの間だけ。最初は全部を取る） */
export type DayMoodPullState = { cursor: string | null; forceFull: boolean }
export const createDayMoodPullState = (): DayMoodPullState => ({ cursor: null, forceFull: true })

/** 前回の取得の目印から、どれだけ前までさかのぼって取り直すか（`syncPull.ts` と同じ。now() はトランザクションの開始時刻） */
const OVERLAP_MS = 5 * 60_000

export interface DayMoodSyncIo {
  /** `since` より後に変わった行（null なら全部） */
  fetch: (since: string | null) => Promise<RemoteDayMood[] | { error: string }>
  push: (rows: DayMoodPush[]) => Promise<DayMoodPushResult>
  get: () => DayMoods
  /** 同期で届いた変更として手元に入れる（この端末の編集として時刻を付けない） */
  set: (next: DayMoods) => void
}

const laterStamp = (a: string | null, b: string) => (a === null || Date.parse(b) > Date.parse(a) ? b : a)

/**
 * 気分を 1 回合わせる。失敗してもタスクの同期は止めない（ログに出し、次の同期でまた合わせる）。
 * 断られた日があれば全部を取り直して合わせ直す（`maxStaleRetries` 回まで）
 */
export async function runDayMoodSync(
  io: DayMoodSyncIo,
  state: DayMoodPullState,
  opts: { isCancelled?: () => boolean; clockOffsetMs?: number; maxStaleRetries?: number } = {},
): Promise<void> {
  const cancelled = opts.isCancelled ?? (() => false)
  const retries = opts.maxStaleRetries ?? 3
  for (let attempt = 0; attempt <= retries; attempt++) {
    const full = state.forceFull || state.cursor === null
    const since = full ? null : new Date(Date.parse(state.cursor!) - OVERLAP_MS).toISOString()
    const remote = await io.fetch(since)
    if (cancelled()) return
    if ('error' in remote) {
      console.error('[sync] moods', remote.error)
      reportSyncError('moods', remote.error)
      return
    }
    state.forceFull = false
    for (const r of remote) state.cursor = laterStamp(state.cursor, r.updatedAt)

    // 取得の後は await を挟まずに決めて入れる（この間の手元の編集を取りこぼさない）
    const before = io.get()
    const plan = planDayMoodSync(before, remote, opts.clockOffsetMs ?? 0)
    const days = [...Object.keys(plan.apply), ...Object.keys(plan.adopt)]
    if (days.length > 0) {
      const next = { ...before }
      for (const [day, m] of Object.entries(plan.apply)) next[day] = m
      for (const [day, at] of Object.entries(plan.adopt)) next[day] = { ...before[day]!, updatedAt: at, syncedAt: at }
      io.set(next)
    }
    if (plan.push.length === 0) return

    const res = await io.push(plan.push)
    if (cancelled()) return
    if ('error' in res) {
      console.error('[sync] moods', res.error)
      reportSyncError('moods', res.error)
      return
    }
    const written = new Map(res.written.map((w) => [w.day, w.updatedAt]))
    // 送れた行の版も目印にする（全部を取って 0 行だった後も、次からは差分で取れる。送るのは取得のすぐ後なので、さかのぼる 5 分で足りる）
    for (const at of written.values()) state.cursor = laterStamp(state.cursor, at)
    if (written.size > 0) {
      const cur = io.get()
      const next = { ...cur }
      for (const p of plan.push) {
        const at = written.get(p.day)
        const m = cur[p.day]
        if (at === undefined || !m) continue
        // 送っている間に手元で変えていたら、手元の時刻はそのまま（次の同期でこの版をもとに送る）
        next[p.day] = m.updatedAt === p.updatedAt ? { ...m, updatedAt: at, syncedAt: at } : { ...m, syncedAt: at }
      }
      io.set(next)
    }
    if (plan.push.every((p) => written.has(p.day))) return
    // 取得した後に他の端末が変えていた日がある。全部を取り直して合わせ直す
    state.forceFull = true
  }
  reportSyncError('moods', `still stale after ${retries} retries`)
}
