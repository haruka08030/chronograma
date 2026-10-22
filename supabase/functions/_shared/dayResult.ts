/**
 * その日の結果「予定 N 件中 M 件・予定外 ◯時間」の数え方。アプリ（今日の計画の見出し・週のふりかえり・タブを開いている間の通知）と
 * Edge Function（夜のまとめ・朝のまとめの「昨日」）で同じものを使う。依存は持たない（どちらからも読めるように）。
 * - 予定 N 件: 時間に置いた To-Do（その日から別の日へ移したものも）と、時間を決めた習慣の枠。予定（授業・バイト）は入れない
 *   （突き合わせには入れて、その時間の記録を「予定外」にしない）。今日はまだ終わっていない予定を入れない（先に記録できたものは入れる）
 * - M 件: そのうち記録と組になった（時刻のずれは問わない）・✓ で終えたもの
 * - 予定外: どの予定とも組にならなかった記録の時間
 */
import {
  habitDayStatus,
  isoWeekdayOf,
  plannedRecordTimes,
  type HabitRecordIndex,
  type TimingHabit,
  type TimingRecord,
} from './habitTiming.ts'

/** 突き合わせる予定の出どころ（Google / 自分で置いた To-Do / 予定（授業・バイト） / 習慣の枠） */
export type PlannedSource = 'google' | 'scheduled-task' | 'scheduled-event' | 'habit'

/** 記録と突き合わせる予定 */
export interface PlanSlot {
  id: string
  summary: string
  startTime: string
  endTime: string
  source: PlannedSource
  /** 自分で置いた To-Do・予定の id。▶ で始めた記録（`sourceTaskId`）と題名に関係なく組にする */
  taskId?: string
  /** ✓ で完了にした To-Do（記録が無くても予定どおりにやったものとして数える） */
  completed?: boolean
}

/** 突き合わせる記録 */
export interface LogSlot {
  id: string
  title: string
  startTime?: string | null
  endTime?: string | null
  sourceTaskId?: string | null
}

export type MatchStatus = 'matched' | 'time-drift' | 'planned-only' | 'actual-only'

export interface MatchedPair<P extends PlanSlot = PlanSlot, A extends LogSlot = LogSlot> {
  status: MatchStatus
  planned?: P
  actual?: A
  driftMinutes?: number
}

/** `HH:MM` → 0 時からの分（欠けた分は 0） */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8

  const wordsA = new Set(na.split(/\s+/))
  const wordsB = new Set(nb.split(/\s+/))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

function timeOverlapRatio(pStart: string, pEnd: string, aStart: string, aEnd: string): number {
  const ps = timeToMinutes(pStart)
  const pe = timeToMinutes(pEnd)
  const as_ = timeToMinutes(aStart)
  const ae = timeToMinutes(aEnd)

  const overlapStart = Math.max(ps, as_)
  const overlapEnd = Math.min(pe, ae)
  const overlap = Math.max(0, overlapEnd - overlapStart)

  const union = Math.max(pe, ae) - Math.min(ps, as_)
  if (union === 0) return 0
  return overlap / union
}

const TITLE_THRESHOLD = 0.3
const TIME_OVERLAP_THRESHOLD = 0.15
const DRIFT_THRESHOLD_MINUTES = 10

/** 予定と記録の組。時刻のずれで「予定どおり」か「ずれた」か */
function pairOf<P extends PlanSlot, A extends LogSlot>(p: P, a: A): MatchedPair<P, A> {
  const startDrift = Math.abs(timeToMinutes(p.startTime) - timeToMinutes(a.startTime!))
  const endDrift = Math.abs(timeToMinutes(p.endTime) - timeToMinutes(a.endTime!))
  const maxDrift = Math.max(startDrift, endDrift)
  return maxDrift <= DRIFT_THRESHOLD_MINUTES
    ? { status: 'matched', planned: p, actual: a }
    : { status: 'time-drift', planned: p, actual: a, driftMinutes: maxDrift }
}

/**
 * 予定（Google・習慣・自分で配置した To-Do・予定）と記録を突き合わせる。
 * ▶ で始めた記録は元の To-Do（`sourceTaskId`）と先に組にし（題名を直しても組のまま）、残りを題名の似かたと時間の重なりで組にする
 */
export function matchPlanAndActual<P extends PlanSlot, A extends LogSlot>(
  planned: readonly P[],
  actualLogs: readonly A[],
): MatchedPair<P, A>[] {
  const timedPlanned = planned.filter((e) => e.startTime && e.endTime)
  const timedActual = actualLogs.filter((t) => t.startTime && t.endTime)

  const usedPlanned = new Set<string>()
  const usedActual = new Set<string>()
  const pairs: MatchedPair<P, A>[] = []

  for (const a of timedActual) {
    if (!a.sourceTaskId) continue
    const p = timedPlanned.find((x) => x.taskId === a.sourceTaskId && !usedPlanned.has(x.id))
    if (!p) continue
    usedPlanned.add(p.id)
    usedActual.add(a.id)
    pairs.push(pairOf(p, a))
  }

  interface Candidate {
    pIdx: number
    aIdx: number
    score: number
  }
  const candidates: Candidate[] = []

  for (let pi = 0; pi < timedPlanned.length; pi++) {
    const p = timedPlanned[pi]
    if (usedPlanned.has(p.id)) continue
    for (let ai = 0; ai < timedActual.length; ai++) {
      const a = timedActual[ai]
      if (usedActual.has(a.id)) continue
      const tSim = titleSimilarity(p.summary, a.title)
      if (tSim < TITLE_THRESHOLD) continue

      const overlap = timeOverlapRatio(p.startTime, p.endTime, a.startTime!, a.endTime!)
      if (overlap < TIME_OVERLAP_THRESHOLD && tSim < 0.8) continue

      candidates.push({ pIdx: pi, aIdx: ai, score: tSim * 0.6 + overlap * 0.4 })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  for (const c of candidates) {
    const p = timedPlanned[c.pIdx]
    const a = timedActual[c.aIdx]
    const pKey = p.id ?? `planned-${c.pIdx}`
    const aKey = a.id ?? `actual-${c.aIdx}`
    if (usedPlanned.has(pKey) || usedActual.has(aKey)) continue
    usedPlanned.add(pKey)
    usedActual.add(aKey)
    pairs.push(pairOf(p, a))
  }

  for (const p of timedPlanned) {
    if (!usedPlanned.has(p.id)) {
      pairs.push({ status: 'planned-only', planned: p })
    }
  }

  for (const a of timedActual) {
    if (!usedActual.has(a.id)) {
      pairs.push({ status: 'actual-only', actual: a })
    }
  }

  return pairs
}

/** 習慣の枠に使う項目（アプリの `Habit` と同じ名前） */
export interface SlotHabit extends TimingHabit {
  archivedAt?: string | null
  restDates?: readonly string[]
}

const HABIT_SLOT_PREFIX = 'habit-slot::'

/** タイムラインの習慣の枠の id（`habit-slot::<習慣の id>::<yyyy-MM-dd>`） */
export function habitSlotId(habitId: string, dateKey: string): string {
  return `${HABIT_SLOT_PREFIX}${habitId}::${dateKey}`
}

/** 習慣の枠の id なら習慣の id と日。ほかの id は null */
export function parseHabitSlotId(id: string): { habitId: string; dateKey: string } | null {
  if (!id.startsWith(HABIT_SLOT_PREFIX)) return null
  const rest = id.slice(HABIT_SLOT_PREFIX.length)
  const at = rest.lastIndexOf('::')
  return at > 0 ? { habitId: rest.slice(0, at), dateKey: rest.slice(at + 2) } : null
}

/**
 * その日にやる習慣か。アーカイブした習慣はどの日にも入らない。休みの日（`restDates`）はどの頻度でも入らない。
 * 週に◯回の習慣はどの日にやってもよいので、毎日入る
 */
export function isHabitScheduledOn(habit: SlotHabit, dateKey: string): boolean {
  if (habit.archivedAt) return false
  if (habit.restDates?.includes(dateKey)) return false
  if (habit.frequency.type === 'daily' || habit.frequency.type === 'timesPerWeek') return true
  return habit.frequency.weekdays.includes(isoWeekdayOf(dateKey))
}

/**
 * 「予定 N 件」に入れる、その日の習慣の枠（時間を決めた習慣だけ。枠は ✓ で作る記録と同じ時間）。
 * 週に◯回の習慣は、やらなかった日の枠を入れない（やらない日の枠を「できなかった予定」にしない）
 */
export function habitPlanSlot<R extends TimingRecord>(habit: SlotHabit, dateKey: string, records: HabitRecordIndex<R>): PlanSlot | null {
  if (!isHabitScheduledOn(habit, dateKey)) return null
  if (habit.frequency.type === 'timesPerWeek' && habitDayStatus(habit, dateKey, records) === 'missed') return null
  const times = plannedRecordTimes(habit, dateKey)
  if (!times) return null
  return { id: habitSlotId(habit.id, dateKey), summary: habit.title, startTime: times.startTime, endTime: times.endTime, source: 'habit' }
}

/** 予定の時間が過ぎたか（過ぎた日はすべて。今日は終わりの時刻を過ぎたもの。日をまたぐ予定は今日のうちは過ぎていない） */
export function planEnded(dateKey: string, todayKey: string, nowHm: string, p: Pick<PlanSlot, 'startTime' | 'endTime'>): boolean {
  return dateKey < todayKey || (dateKey === todayKey && p.endTime > p.startTime && p.endTime <= nowHm)
}

export interface DayResult<P extends PlanSlot, A extends LogSlot> {
  /** 予定 N 件（数えた予定の数） */
  planned: number
  /** そのうち記録と組になった・✓ で終えた数 */
  followed: number
  /** 予定外: どの予定とも組にならなかった記録の時間（分） */
  unplannedMinutes: number
  /** 数えた予定の組（ずれやすい曜日・時間帯に使う） */
  counted: MatchedPair<P, A>[]
  /** 予定外の記録 */
  unplannedLogs: A[]
}

/**
 * その日の結果。`planned` はその日の予定（To-Do・予定・習慣の枠）、`logs` はその日にかかる記録（睡眠を除く）。
 * `logMinutes` は記録のその日にかかる分。`todayKey` / `nowHm` は今（利用者のタイムゾーンの壁時計）
 */
export function countDayResult<P extends PlanSlot, A extends LogSlot>(
  planned: readonly P[],
  logs: readonly A[],
  {
    dateKey,
    todayKey,
    nowHm,
    logMinutes,
  }: {
    dateKey: string
    todayKey: string
    nowHm: string
    logMinutes: (log: A) => number
  },
): DayResult<P, A> {
  const out: DayResult<P, A> = { planned: 0, followed: 0, unplannedMinutes: 0, counted: [], unplannedLogs: [] }
  for (const pair of matchPlanAndActual(planned, logs)) {
    if (pair.status === 'actual-only' && pair.actual) {
      out.unplannedLogs.push(pair.actual)
      out.unplannedMinutes += logMinutes(pair.actual)
      continue
    }
    if (!pair.planned) continue
    // 予定（授業・バイト）は完了できないので数えない（突き合わせには入れて、その時間の記録を「予定外」にしない）
    if (pair.planned.source === 'scheduled-event') continue
    // ✓ で終えた時刻つきの To-Do は、記録が無くても予定どおり（✓ は完了だけで記録は足さない。予定の枠が時間を表す）
    const followed =
      pair.status === 'matched' || pair.status === 'time-drift' || (pair.status === 'planned-only' && pair.planned.completed === true)
    // 今日の、まだ終わっていない予定（日をまたぐものも含む）は、先に記録できていなければ数えない
    if (!planEnded(dateKey, todayKey, nowHm, pair.planned) && !followed) continue
    out.planned++
    if (followed) out.followed++
    out.counted.push(pair)
  }
  return out
}
