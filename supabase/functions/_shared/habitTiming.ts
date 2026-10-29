/**
 * 習慣の時間と、その日の結果（達成・時間外・やっていない）。アプリ（`src/lib/habitTiming.ts` から読む）と
 * Edge Function（夜のまとめ・朝のまとめの「昨日」の数え方、`dayResult.ts`）で同じものを使う。依存は持たない（どちらからも読めるように）
 */

/** 曜日（1=月 … 7=日） */
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** その日・その曜日だけの時間。時刻ひとつの習慣は終わりを持たない。`extra` は決めた曜日以外の日に置いた「この日もやる」日（その日だけの時間だけ） */
interface TimeOfDay {
  startTime: string
  endTime: string | null
  extra?: true
}

/** 判定に使う習慣の項目（アプリの `Habit` と同じ名前） */
export interface TimingHabit {
  id: string
  title: string
  timeMode: 'none' | 'fixed' | 'range'
  startTime: string | null
  endTime: string | null
  frequency: { type: 'daily' } | { type: 'weekly'; weekdays: readonly Weekday[] } | { type: 'timesPerWeek'; count: number }
  completedDates: readonly string[]
  timeOverrides?: Readonly<Record<string, TimeOfDay>>
  weekdayTimes?: Readonly<Partial<Record<Weekday, TimeOfDay>>>
  goalMinutes?: number
  /** 前の日の設定（古い順。`habitAsOf`） */
  pastRules?: readonly HabitPastRule[]
  /** `routine` はルーティン（毎日の予定のプリセット。「予定 N 件」に入れない） */
  kind?: 'routine'
}

/** 日によって変わる習慣の設定（頻度・時間・時間の目標） */
export interface HabitRuleSettings {
  timeMode: TimingHabit['timeMode']
  startTime: string | null
  endTime: string | null
  frequency: TimingHabit['frequency']
  weekdayTimes?: TimingHabit['weekdayTimes']
  goalMinutes?: number
}

/**
 * 前の日の設定。`until` より前（前の項目の `until` 以降）の日はこの設定で数える。
 * `off` は習慣を作る前（その日は予定の日に入れない）。設定を変えても、作っても、終わった日の結果は変わらない
 */
export type HabitPastRule = { until: string; off: true } | ({ until: string; off?: undefined } & HabitRuleSettings)

/** その日に当てはまる前の日の設定。今の設定の日は null */
export function habitPastRuleOn(habit: Pick<TimingHabit, 'pastRules'>, dateKey: string): HabitPastRule | null {
  if (!habit.pastRules) return null
  for (const rule of habit.pastRules) if (dateKey < rule.until) return rule
  return null
}

/** その日の設定の習慣（前の日の設定を当てはめ、`pastRules` を外したもの）。作る前の日は最初の設定 */
export function habitAsOf<H extends TimingHabit>(habit: H, dateKey: string): H {
  const rules = habit.pastRules
  if (!rules) return habit
  const at = rules.findIndex((r) => dateKey < r.until)
  const rule = at < 0 ? undefined : rules.slice(at).find((r) => !r.off)
  const rest = { ...habit }
  delete rest.pastRules
  if (!rule || rule.off) return rest
  const out: H = { ...rest, timeMode: rule.timeMode, startTime: rule.startTime, endTime: rule.endTime, frequency: rule.frequency }
  if (rule.weekdayTimes) out.weekdayTimes = rule.weekdayTimes
  else delete out.weekdayTimes
  if (rule.goalMinutes) out.goalMinutes = rule.goalMinutes
  else delete out.goalMinutes
  return out
}

/** 判定に使う記録の項目（アプリの `Task` と同じ名前）。開始日は `dueDate`、終わりの日は `endDate` */
export interface TimingRecord {
  id: string
  title: string
  habitId?: string | null
  dueDate?: string | null
  startTime?: string | null
  endTime?: string | null
  endDate?: string | null
}

/** `HH:MM` → 0 時からの分（欠けた分は 0） */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 分 → `HH:MM` */
function minutesToTime(min: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

/** 目標の時刻からこれだけずれても「時間どおり」 */
export const HABIT_ON_TIME_TOLERANCE_MIN = 15

/** 目標の時間帯の前後これだけに重なる記録を、その日の記録とみなす（前日 23:30 に寝始めた睡眠など） */
const MATCH_MARGIN_MIN = 3 * 60

/**
 * 習慣のその日の結果。
 * - done: 達成（時間を決めた習慣は時間どおり）
 * - offTime: やったが時間外（連続日数・達成率には数えない）
 * - missed: やっていない
 */
export type HabitDayStatus = 'done' | 'offTime' | 'missed'

interface Span<R extends TimingRecord = TimingRecord> {
  record: R
  /** 1970-01-01 0:00 からの分 */
  start: number
  end: number
}

/**
 * 習慣の判定に使える記録。開始日ごとに分けて持つ（`key|開始日の通し番号`）。
 * key は習慣につながった記録なら `id:習慣id`、それ以外は `title:タイトル`
 */
export interface HabitRecordIndex<R extends TimingRecord = TimingRecord> {
  active: Map<string, Span<R>[]>
  /** ゴミ箱にある、習慣につながった記録 */
  deleted: Map<string, Span<R>[]>
}

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function recordSpan<R extends TimingRecord>(record: R): Span<R> | null {
  if (!record.dueDate || !record.startTime || !record.endTime) return null
  const day = dayNumber(record.dueDate)
  const start = day * 1440 + timeToMinutes(record.startTime)
  let end = (record.endDate && record.endDate > record.dueDate ? dayNumber(record.endDate) : day) * 1440 + timeToMinutes(record.endTime)
  if (end <= start) end += 1440
  return { record, start, end }
}

const titleKey = (title: string) => `title:${title.trim()}`
const linkKey = (habitId: string) => `id:${habitId}`

function push<R extends TimingRecord>(map: Map<string, Span<R>[]>, key: string, span: Span<R>) {
  const k = `${key}|${Math.floor(span.start / 1440)}`
  const list = map.get(k)
  if (list) list.push(span)
  else map.set(k, [span])
}

/**
 * 習慣の判定に使う記録の索引。`records` は記録（睡眠も。サブタスクは入れない）、`isActive` はゴミ箱・アーカイブに無いか。
 * ゴミ箱の記録は習慣につながったものだけ（記録を消したら達成も消える）
 */
export function indexHabitRecords<R extends TimingRecord>(records: Iterable<R>, isActive: (r: R) => boolean): HabitRecordIndex<R> {
  const active = new Map<string, Span<R>[]>()
  const deleted = new Map<string, Span<R>[]>()
  for (const t of records) {
    const span = recordSpan(t)
    if (!span) continue
    if (!isActive(t)) {
      if (t.habitId) push(deleted, linkKey(t.habitId), span)
      continue
    }
    push(active, t.habitId ? linkKey(t.habitId) : titleKey(t.title), span)
  }
  return { active, deleted }
}

/**
 * 決めた曜日以外の日に置いた「この日もやる」日か（曜日を指定した習慣だけ。休み・やめた日は呼ぶ側で見る）。
 * その日はやったら時刻によらず達成、やらなくても未達成に数えない
 */
export function isHabitExtraOn(h: TimingHabit, dateKey: string): boolean {
  if (h.timeOverrides?.[dateKey]?.extra !== true) return false
  const { frequency } = habitAsOf(h, dateKey)
  return frequency.type === 'weekly' && !frequency.weekdays.includes(isoWeekdayOf(dateKey))
}

/** 時刻で判定する習慣か（時間を決めていない習慣はいつやっても達成） */
export function isTimedHabit(habit: TimingHabit): boolean {
  if (habit.timeMode === 'fixed') return !!habit.startTime
  if (habit.timeMode === 'range') return !!habit.startTime && !!habit.endTime
  return false
}

/**
 * その曜日のいつもの時間（時間を決めた習慣だけ。その日だけの時間は見ない）。
 * 曜日ごとの時間があればそれ（どの頻度でも）、無ければ習慣の時間
 */
export function habitUsualTimesOn(h: TimingHabit, dateKey: string): { startTime: string; endTime: string | null } | null {
  const habit = habitAsOf(h, dateKey)
  if (!isTimedHabit(habit)) return null
  const w = habit.weekdayTimes?.[isoWeekdayOf(dateKey)]
  const startTime = w?.startTime ?? habit.startTime!
  if (habit.timeMode !== 'range') return { startTime, endTime: null }
  return { startTime, endTime: w?.endTime ?? habit.endTime! }
}

/** yyyy-MM-dd の ISO 曜日（1=月） */
export function isoWeekdayOf(dateKey: string): Weekday {
  return (((((dayNumber(dateKey) + 3) % 7) + 7) % 7) + 1) as Weekday
}

/**
 * その日の時間（時間を決めた習慣だけ）。その日だけの時間があればそれ、無ければその曜日のいつもの時間（`habitUsualTimesOn`）。
 * 範囲の習慣で、その日の時間に終わりが無い（時刻ひとつのときに動かした）なら、いつもの長さのまま開始をずらす。
 * 時刻ひとつの習慣も、習慣の段から格子に置いた日は終わりを持つ。
 * 時間を決めていない習慣も、格子に置いた日はその枠（判定は時刻を見ないまま。`isTimedHabit`）
 */
export function habitTimesOn(h: TimingHabit, dateKey: string): { startTime: string; endTime: string | null } | null {
  const habit = habitAsOf(h, dateKey)
  const usual = habitUsualTimesOn(habit, dateKey)
  const o = habit.timeOverrides?.[dateKey]
  if (!usual) return o?.endTime ? { startTime: o.startTime, endTime: o.endTime } : null
  if (!o) return usual
  const startTime = o.startTime
  if (o.endTime) return { startTime, endTime: o.endTime }
  if (usual.endTime === null) return { startTime, endTime: null }
  const length = (timeToMinutes(usual.endTime) - timeToMinutes(usual.startTime) + 1440) % 1440
  return { startTime, endTime: minutesToTime((timeToMinutes(startTime) + length) % 1440) }
}

/** その日の目標（通しの分）。時刻ひとつの習慣は終わりを持たない */
function target(habit: TimingHabit, dateKey: string): { start: number; end: number | null } {
  const times = habitTimesOn(habit, dateKey)!
  const base = dayNumber(dateKey) * 1440
  const start = base + timeToMinutes(times.startTime)
  if (times.endTime === null) return { start, end: null }
  let end = base + timeToMinutes(times.endTime)
  if (end <= start) end += 1440
  return { start, end }
}

function candidates<R extends TimingRecord>(map: Map<string, Span<R>[]>, key: string, habit: TimingHabit, dateKey: string): Span<R>[] {
  const goal = target(habit, dateKey)
  const from = goal.start - MATCH_MARGIN_MIN
  const to = (goal.end ?? goal.start) + MATCH_MARGIN_MIN
  const out: Span<R>[] = []
  const firstDay = Math.floor(from / 1440) - 1
  for (let day = firstDay; day <= Math.floor(to / 1440); day++) {
    for (const span of map.get(`${key}|${day}`) ?? []) {
      if (span.start < to && span.end > from) out.push(span)
    }
  }
  return out
}

/** 目標からのずれ（分）。小さいほど、その日のその習慣の記録らしい */
function drift(habit: TimingHabit, dateKey: string, span: Span<TimingRecord>): number {
  const goal = target(habit, dateKey)
  return Math.abs(span.start - goal.start) + (goal.end === null ? 0 : Math.abs(span.end - goal.end))
}

/**
 * その日の習慣の記録。習慣につながった記録を優先し、無ければ習慣と同じ名前の記録を使う
 * （習慣を作る前の記録や、タイマーで付けた記録）。目標の時間帯の前後 3 時間に重なるもののうち、いちばん近いもの
 */
export function habitRecordFor<R extends TimingRecord>(index: HabitRecordIndex<R>, habit: TimingHabit, dateKey: string): R | null {
  return habitRecordsFor(index, habit, dateKey)[0] ?? null
}

/**
 * その日の習慣の記録を、目標に近い順に全部（チェックを外すときにまとめて消す）。
 * 時間を決めていない習慣は、時間の目標があればその日に始めた記録、無ければその日に始めた習慣につながった記録
 * （記録の列に落とした・格子に置いた日に ✓ した記録）
 */
export function habitRecordsFor<R extends TimingRecord>(index: HabitRecordIndex<R>, h: TimingHabit, dateKey: string): R[] {
  const habit = habitAsOf(h, dateKey)
  if (!isTimedHabit(habit)) {
    const spans = habit.goalMinutes
      ? goalSpans(index, habit, dateKey)
      : (index.active.get(`${linkKey(habit.id)}|${dayNumber(dateKey)}`) ?? [])
    return spans.map((s) => s.record)
  }
  const byDrift = (list: Span<R>[]) => list.sort((a, b) => drift(habit, dateKey, a) - drift(habit, dateKey, b)).map((s) => s.record)
  const linked = candidates(index.active, linkKey(habit.id), habit, dateKey)
  return [
    ...byDrift(linked),
    ...byDrift(candidates(index.active, titleKey(habit.title), habit, dateKey)),
    ...byDrift(farLinkedSpans(index, habit, dateKey, linked)),
  ]
}

/**
 * その日に始めた習慣につながった記録のうち、目標の前後 3 時間から外れたもの（記録の列に習慣を落とした時間が離れていた）。
 * 前後の日の目標の時間帯に入る記録はその日の分なので除く（前日の夜更かしの睡眠など）
 */
function farLinkedSpans<R extends TimingRecord>(
  index: HabitRecordIndex<R>,
  habit: TimingHabit,
  dateKey: string,
  near: Span<R>[],
): Span<R>[] {
  const day = dayNumber(dateKey)
  const sameDay = index.active.get(`${linkKey(habit.id)}|${day}`) ?? []
  if (sameDay.length === 0) return []
  const taken = new Set(near.map((s) => s.record.id))
  for (const offset of [-1, 1]) {
    const other = dateKeyOfDay(day + offset)
    if (habitTimesOn(habit, other)) for (const s of candidates(index.active, linkKey(habit.id), habit, other)) taken.add(s.record.id)
  }
  return sameDay.filter((s) => !taken.has(s.record.id))
}

function dateKeyOfDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

/**
 * 時間の目標に数える、その日の習慣の記録。時間を決めた習慣は判定と同じ目標の時間帯の前後のもの、
 * 時間を決めていない習慣はその日に始めた記録（習慣につながった記録と、同じ名前の記録）
 */
function goalSpans<R extends TimingRecord>(index: HabitRecordIndex<R>, habit: TimingHabit, dateKey: string): Span<R>[] {
  if (isTimedHabit(habit)) {
    return [
      ...candidates(index.active, linkKey(habit.id), habit, dateKey),
      ...candidates(index.active, titleKey(habit.title), habit, dateKey),
    ]
  }
  const day = dayNumber(dateKey)
  return [...(index.active.get(`${linkKey(habit.id)}|${day}`) ?? []), ...(index.active.get(`${titleKey(habit.title)}|${day}`) ?? [])]
}

/** その日の習慣の記録の合計（分）。時間の目標の判定と「12/30 分」に使う */
export function habitMinutesOn(index: HabitRecordIndex<TimingRecord>, h: TimingHabit, dateKey: string): number {
  const habit = habitAsOf(h, dateKey)
  const seen = new Set<string>()
  let total = 0
  for (const span of goalSpans(index, habit, dateKey)) {
    if (seen.has(span.record.id)) continue
    seen.add(span.record.id)
    total += span.end - span.start
  }
  return total
}

/** 記録が習慣の目標時刻を守れたか。範囲は開始・終了の両方、時刻ひとつは開始だけを ±15 分で見る */
function isOnTime(habit: TimingHabit, dateKey: string, record: TimingRecord): boolean {
  const span = recordSpan(record)
  if (!span) return false
  const goal = target(habit, dateKey)
  const within = (actual: number, want: number) => Math.abs(actual - want) <= HABIT_ON_TIME_TOLERANCE_MIN
  if (!within(span.start, goal.start)) return false
  if (goal.end !== null && !within(span.end, goal.end)) return false
  return true
}

/**
 * その日の結果。時間の目標のある習慣は、記録の合計が届いたら（チェックしていなくても）達成、届かなければ未達成
 * （時刻のずれは見ない）。手でチェックした日は目標の無い習慣と同じく達成（記録を消した日は外れる）
 */
export function habitDayStatus(h: TimingHabit, dateKey: string, index?: HabitRecordIndex<TimingRecord>): HabitDayStatus {
  const habit = habitAsOf(h, dateKey)
  const checked = habit.completedDates.includes(dateKey)
  // この日もやる日は、やったら時刻・時間の目標によらず達成
  if (isHabitExtraOn(h, dateKey)) return checked || (!!index && habitRecordsFor(index, h, dateKey).length > 0) ? 'done' : 'missed'
  if (index && habit.goalMinutes) {
    const minutes = habitMinutesOn(index, habit, dateKey)
    if (minutes >= habit.goalMinutes) return 'done'
    if (!checked) return 'missed'
    if (minutes > 0 || !isTimedHabit(habit)) return 'done'
  }
  if (!index || !isTimedHabit(habit)) return checked ? 'done' : 'missed'
  const record = habitRecordFor(index, habit, dateKey)
  // 記録があればチェックしていなくても判定する（チェックし忘れた日、習慣を作る前の記録）
  if (record) return isOnTime(habit, dateKey, record) ? 'done' : 'offTime'
  if (!checked) return 'missed'
  // 記録を消したら達成も消える。記録のない古いチェックは時刻が分からないので達成のまま
  return candidates(index.deleted, linkKey(habit.id), habit, dateKey).length > 0 ? 'missed' : 'done'
}

/**
 * チェックで作る記録（＝タイムラインの枠）のその日の時間。時刻ひとつの習慣は「1 回の目標」の長さ、
 * 目標が無ければ許容幅ぶんの長さにする
 */
export function plannedRecordTimes(h: TimingHabit, dateKey: string): { startTime: string; endTime: string } | null {
  const habit = habitAsOf(h, dateKey)
  const times = habitTimesOn(habit, dateKey)
  if (!times) return null
  if (times.endTime !== null) return { startTime: times.startTime, endTime: times.endTime }
  const end = Math.min(timeToMinutes(times.startTime) + (habit.goalMinutes ?? HABIT_ON_TIME_TOLERANCE_MIN), 23 * 60 + 59)
  return { startTime: times.startTime, endTime: minutesToTime(end) }
}
