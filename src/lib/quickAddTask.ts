import { addDays } from 'date-fns'
import i18n from '../i18n/config'
import { INBOX_LIST_ID, useTaskStore } from '../store/taskStore'
import type { Recurrence, Task } from '../types/task'
import { parseQuickAddTitle, type ParsedQuickAdd, type QuickAddRepeat } from './parseQuickAdd'
import { fromDateKey, toDateKey } from './dateKey'
import { findListByName } from './listKind'
import { displayListName } from './displayListName'
import { appTodayKey } from './timeZone'
import { formatDate } from './dateFormat'
import { isoWeekday } from './recurrence'
import { shortUrlLabel } from './linkify'
import { splitUrls } from './shareTarget'

export interface QuickAddOptions {
  /** リストを書かなかったときに入れるリスト。省略すると選んでいるリスト（無ければ未分類） */
  defaultListId?: string
  /** いま見ているリスト。`@リスト` がこれと違えば「○○に追加しました」と知らせる */
  currentListId?: string | null
  /**
   * 日付を書かなかったときの「やる日」（今日の計画・カレンダーのセル・予定作成カードの日）。
   * 省略すると日付なし（時刻だけ書いたときは今日）
   */
  defaultDate?: string
  /**
   * 時刻を書かなかったときの時間帯（予定作成カードでドラッグした枠）。
   * 「15時」のように書けば書いた時刻が勝つ
   */
  defaultTime?: { startTime: string; endTime: string }
  /**
   * サブタスクとして足す親。リストは親と同じに固定し、`@…` はリスト指定として読まず題名に残す。
   * 日付・時刻・締切は読む
   */
  parentId?: string
  /** 色（ラベル）を開いて追加したとき、その色を付ける（そのラベルの一覧に残るように） */
  color?: string
  /** 予定（完了の丸の無いもの）として作る（予定作成カードで「予定」を選んだとき）。締切・繰り返しは付けない */
  kind?: 'event'
  /** 追加欄の下のチップで選んだ値（書いた文より勝つ） */
  picks?: QuickAddPicks
  /** メモの先頭に入れる文（共有で 1 行に収まらなかった本文）。書いた URL はその下に入る */
  note?: string
}

/**
 * 追加欄の 1 行を、日時などを読む文と URL に分ける。URL は題名にも日付の読み取りにも使わず、足すときにメモへ入れる
 * （URL の `/2026/10/15/` を日付と読まない。共有でも、URL を貼っただけでも同じ）
 */
function quickAddParts(raw: string): { text: string; urls: string[] } {
  const { rest, urls } = splitUrls(raw.trim())
  return { text: rest.replace(/\n/g, ' '), urls }
}

/**
 * 追加欄の下のチップで選んだ値。書いた文から読んだ値より勝つ。
 * `undefined` は選んでいない（書いた文・既定のまま）、`null` は外した
 */
export type QuickAddPicks = {
  /** やる日 */
  date?: string | null
  /** 予定の時間帯（やる日が無ければ既定の日、無ければ今日に置く） */
  time?: { startTime: string; endTime: string } | null
  estimateMinutes?: number | null
  /** 締切（日付と、あれば時刻） */
  due?: { date: string; time: string | null } | null
  listId?: string
  /** 色（ラベル） */
  color?: string | null
}

/** チップで選んだ値を日時に重ねる。いつか・チェックリストには呼ばない */
export function applyQuickAddPicks(
  patch: SchedulePatch & Partial<Pick<Task, 'estimateMinutes'>>,
  picks: QuickAddPicks,
  opts: Pick<QuickAddOptions, 'defaultDate'>,
  todayKey: string,
): void {
  if (picks.date !== undefined) {
    patch.scheduledDate = picks.date
    // やる日を外したら時間帯も外す（時刻だけの予定は無い）
    if (picks.date === null) {
      patch.startTime = null
      patch.endTime = null
    }
  }
  if (picks.time !== undefined) {
    patch.startTime = picks.time?.startTime ?? null
    patch.endTime = picks.time?.endTime ?? null
    if (picks.time && !patch.scheduledDate) patch.scheduledDate = opts.defaultDate ?? todayKey
  }
  if (picks.estimateMinutes !== undefined) patch.estimateMinutes = picks.estimateMinutes
  if (picks.due !== undefined) {
    patch.dueDate = picks.due?.date ?? null
    patch.dueTime = picks.due?.time ?? null
    // 繰り返しは締切の日で回るので、締切を外したら繰り返しも外す
    if (!picks.due) patch.recurrence = null
  }
}

type SchedulePatch = Partial<Pick<Task, 'dueDate' | 'dueTime' | 'scheduledDate' | 'startTime' | 'endTime' | 'recurrence'>>

/** 日時の決め方に使う読み取り結果（`dueTime`・`repeat` は無くてもよい） */
type ScheduleInput = Pick<ParsedQuickAdd, 'date' | 'dateIsDeadline' | 'startTime' | 'endTime'> &
  Partial<Pick<ParsedQuickAdd, 'dueTime' | 'repeat'>>

/** `from` の日から数えて、繰り返しの曜日・日に最初に当たる日（`from` 自身も含む）。指定が無ければ `from` */
export function firstRepeatDay(repeat: QuickAddRepeat, from: string): string {
  const d = fromDateKey(from)
  if (repeat.weekdays?.length) {
    for (let i = 0; i < 7; i++) {
      const c = addDays(d, i)
      if (repeat.weekdays.includes(isoWeekday(c))) return toDateKey(c)
    }
  }
  if (repeat.monthDay != null) {
    // 31日のように無い月は飛ばす
    for (let i = repeat.monthDay >= d.getDate() ? 0 : 1; i < 13; i++) {
      const c: Date = new Date(d.getFullYear(), d.getMonth() + i, repeat.monthDay, 12)
      if (c.getDate() === repeat.monthDay) return toDateKey(c)
    }
  }
  return from
}

/**
 * 書いた繰り返し → 保存する繰り返し。曜日が 1 つ（毎週金）なら締切の曜日で回るので曜日は持たせない。
 * 2 つ以上（毎週月水・平日）なら次の回を決めるのに要るので持たせる
 */
function repeatRecurrence(repeat: QuickAddRepeat): Recurrence {
  const base = { type: repeat.type, interval: repeat.interval }
  return repeat.type === 'weekly' && repeat.weekdays && repeat.weekdays.length > 1 ? { ...base, weekdays: repeat.weekdays } : base
}

/**
 * 繰り返しつきの日時。繰り返しは締切の日で回る（完了すると次の締切の回ができる）ので、最初の回の日を締切にする。
 * - 最初の回 = 書いた日付。無ければ既定のやる日（無ければ今日）から数えて最初に当たる日
 * - 「毎週金曜まで」のように締切として書いたら、やる日は既定のまま（日付だけのときと同じ）
 * - そうでなければ、やる日や時刻を付けるときは最初の回の日に置く
 */
function repeatSchedule(
  parsed: ScheduleInput,
  repeat: QuickAddRepeat,
  opts: Pick<QuickAddOptions, 'defaultDate' | 'defaultTime'>,
  todayKey: string,
): SchedulePatch {
  const first = parsed.date ?? firstRepeatDay(repeat, opts.defaultDate ?? todayKey)
  const patch: SchedulePatch = { dueDate: first, recurrence: repeatRecurrence(repeat) }
  if (parsed.dateIsDeadline && parsed.dueTime) patch.dueTime = parsed.dueTime
  const typedTime = parsed.startTime != null
  const startTime = typedTime ? parsed.startTime : opts.defaultTime?.startTime
  const endTime = typedTime ? parsed.endTime : opts.defaultTime?.endTime
  if (parsed.dateIsDeadline) {
    if (startTime) patch.scheduledDate = opts.defaultDate ?? todayKey
    else if (opts.defaultDate) patch.scheduledDate = opts.defaultDate
  } else if (startTime || opts.defaultDate) {
    patch.scheduledDate = first
  }
  if (startTime) {
    patch.startTime = startTime
    patch.endTime = endTime ?? null
  }
  return patch
}

/**
 * 読み取った日時から、やる日・締切・予定の時間帯を決める（純粋な計算。テスト用に分けている）。
 * - 日付だけ → やる日。「まで」「締切」「by」つき → 締切（やる日は `defaultDate`）
 * - 締切の印と時刻（「10/10 23:59 締切」）→ 締切の時刻。予定は作らない。日付が無ければ既定の日（無ければ今日）が締切
 * - 時刻つき（書いた時刻、無ければ `defaultTime`）→ その日のタイムラインの予定
 * - 繰り返しつき → 最初の回の日が締切（`repeatSchedule`）
 */
export function quickAddSchedule(
  parsed: ScheduleInput,
  opts: Pick<QuickAddOptions, 'defaultDate' | 'defaultTime'>,
  todayKey: string,
): SchedulePatch {
  if (parsed.repeat) return repeatSchedule(parsed, parsed.repeat, opts, todayKey)
  const patch: SchedulePatch = {}
  const typedTime = parsed.startTime != null
  const startTime = typedTime ? parsed.startTime : opts.defaultTime?.startTime
  const endTime = typedTime ? parsed.endTime : opts.defaultTime?.endTime
  const doDate = parsed.dateIsDeadline ? null : parsed.date
  if (startTime) {
    patch.scheduledDate = doDate ?? opts.defaultDate ?? todayKey
    patch.startTime = startTime
    patch.endTime = endTime ?? null
  } else {
    const day = doDate ?? opts.defaultDate
    if (day) patch.scheduledDate = day
  }
  if (parsed.dateIsDeadline) {
    patch.dueDate = parsed.date ?? opts.defaultDate ?? todayKey
    if (parsed.dueTime) patch.dueTime = parsed.dueTime
  }
  return patch
}

/**
 * 入力中に欄の下に出す「こう読みました」の中身。書いたものだけを返す（書かなかった既定の日は出さない）。
 * 日付は足したときと同じ決め方（`quickAddSchedule`）で、既定の日（今日の計画・カレンダーのセル）も踏まえる
 */
export type QuickAddReading = {
  /** 締切（日付と、あれば時刻） */
  due: { date: string; time: string | null } | null
  /** 時刻のある予定 */
  plan: { date: string; startTime: string; endTime: string | null } | null
  /** 時刻なしの実行日 */
  doDate: string | null
  /** 繰り返しと最初の回の日（「毎週金」の曜日は最初の回の日から出す） */
  recurrence: { rule: Recurrence; firstDate: string | null } | null
  /** 見積もり（分）。時刻なしで長さだけ書いたとき */
  estimateMinutes: number | null
  /** `@リスト` で見つかったリストの名前 */
  listName: string | null
}

/** 入力中の 1 行から読み取った内容。何も読み取れなければ null（欄の下に何も出さない） */
export function readQuickAddText(
  raw: string,
  opts: Pick<QuickAddOptions, 'defaultDate' | 'defaultTime' | 'parentId'> = {},
): QuickAddReading | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const state = useTaskStore.getState()
  const parsed = parseQuickAddTitle(quickAddParts(trimmed).text, Boolean(i18n.resolvedLanguage?.startsWith('ja')), undefined, {
    lists: opts.parentId == null,
    blockMinutes: state.defaultBlockMinutes,
  })
  const target = parsed.listName ? findListByName(state.lists, parsed.listName, (l) => displayListName(l.id, l.name)) : null
  // いつか・チェックリストに入れるなら日付は付かないので、日付は出さない
  const dated = (target?.kind ?? 'tasks') === 'tasks'
  const patch = quickAddSchedule(parsed, opts, appTodayKey())
  const reading: QuickAddReading = {
    due: dated && parsed.dateIsDeadline && patch.dueDate ? { date: patch.dueDate, time: patch.dueTime ?? null } : null,
    plan:
      dated && parsed.startTime && patch.scheduledDate
        ? { date: patch.scheduledDate, startTime: parsed.startTime, endTime: parsed.endTime }
        : null,
    doDate: dated && parsed.date && !parsed.dateIsDeadline && !parsed.startTime ? (patch.scheduledDate ?? parsed.date) : null,
    recurrence: dated && patch.recurrence ? { rule: patch.recurrence, firstDate: patch.dueDate ?? null } : null,
    estimateMinutes: dated ? parsed.estimateMinutes : null,
    listName: target ? displayListName(target.id, target.name) : null,
  }
  return Object.values(reading).some((v) => v != null) ? reading : null
}

/** 追加欄の下のチップに出す、足したら付く値（書いた文・チップ・既定をすべて重ねた結果。足すときと同じ決め方） */
export type QuickAddDraft = {
  listId: string
  /** 入るリストが日付を付けるリスト（いつか・チェックリストでない）か */
  dated: boolean
  scheduledDate: string | null
  startTime: string | null
  endTime: string | null
  dueDate: string | null
  dueTime: string | null
  estimateMinutes: number | null
  color: string | null
}

/** 入力中の 1 行とチップから、足したら付く値を出す（`addTaskFromQuickText` と同じ決め方） */
export function quickAddDraft(
  raw: string,
  opts: Pick<QuickAddOptions, 'defaultDate' | 'defaultListId' | 'color' | 'picks'> = {},
): QuickAddDraft {
  const state = useTaskStore.getState()
  const parsed = parseQuickAddTitle(quickAddParts(raw).text, Boolean(i18n.resolvedLanguage?.startsWith('ja')), undefined, {
    blockMinutes: state.defaultBlockMinutes,
  })
  const picks = opts.picks ?? {}
  const target = parsed.listName ? findListByName(state.lists, parsed.listName, (l) => displayListName(l.id, l.name)) : null
  const listId = picks.listId ?? target?.id ?? opts.defaultListId ?? state.selectedListId ?? INBOX_LIST_ID
  const dated = (state.lists.find((l) => l.id === listId)?.kind ?? 'tasks') === 'tasks'
  const patch: SchedulePatch & Partial<Pick<Task, 'estimateMinutes'>> = {}
  if (dated) {
    const today = appTodayKey()
    Object.assign(patch, quickAddSchedule(parsed, opts, today))
    if (parsed.estimateMinutes != null) patch.estimateMinutes = parsed.estimateMinutes
    applyQuickAddPicks(patch, picks, opts, today)
  }
  return {
    listId,
    dated,
    scheduledDate: patch.scheduledDate ?? null,
    startTime: patch.startTime ?? null,
    endTime: patch.endTime ?? null,
    dueDate: patch.dueDate ?? null,
    dueTime: patch.dueTime ?? null,
    estimateMinutes: patch.estimateMinutes ?? null,
    color: picks.color !== undefined ? picks.color : (opts.color ?? null),
  }
}

/** 続けて足したときに、前に足した行のすぐ下へ入れるための記録（足した順に並ぶ。先頭に積むと逆順になる） */
let lastQuickAdd: { id: string; at: number } | null = null
const QUICK_ADD_BURST_MS = 2 * 60 * 1000

/** 直前（2 分以内）に同じ所へ足した行があれば、そのすぐ下の order。無ければ null（ふつうどおり先頭） */
function orderAfterLastQuickAdd(tasks: readonly Task[], added: Task, now: number): number | null {
  if (!lastQuickAdd || now - lastQuickAdd.at > QUICK_ADD_BURST_MS) return null
  const prev = tasks.find((t) => t.id === lastQuickAdd!.id)
  if (!prev || prev.listId !== added.listId || prev.parentId !== added.parentId || prev.sectionId !== added.sectionId) return null
  const next = tasks
    .filter(
      (t) =>
        t.id !== added.id &&
        t.listId === prev.listId &&
        t.parentId === prev.parentId &&
        t.sectionId === prev.sectionId &&
        t.order > prev.order,
    )
    .reduce<number | null>((min, t) => (min === null || t.order < min ? t.order : min), null)
  return next === null ? prev.order + 1 : (prev.order + next) / 2
}

/**
 * クイック追加の 1 行（「15時 ES 1時間」「明日まで 課題」「@買い物 牛乳」）からタスクを作る。
 * どの入力欄（上部の追加欄・今日の計画・カレンダーのセル・予定作成カード・サブタスク）でも
 * 同じ書き方なら同じ結果になるよう、解釈はここ 1 か所で行う。
 * 欄ごとの違いは「書かなかったときの既定値」（`defaultDate` / `defaultTime` / `defaultListId` / `parentId`）だけ。
 * - いつか・チェックリストのリストには日付を付けない
 * - 書いた URL は題名から外してメモへ（`quickAddParts`）
 */
export function addTaskFromQuickText(raw: string, opts: QuickAddOptions = {}): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const state = useTaskStore.getState()
  const isSubtask = opts.parentId != null
  const { text, urls } = quickAddParts(trimmed)
  const parsed = parseQuickAddTitle(text, Boolean(i18n.resolvedLanguage?.startsWith('ja')), undefined, {
    lists: !isSubtask,
    blockMinutes: state.defaultBlockMinutes,
  })
  // URL だけ（と日付など）を書いたときの題名は URL の短い形。URL そのものはメモに入る
  const title = parsed.title || (urls[0] ? shortUrlLabel(urls[0]) : '')
  const description = [opts.note?.trim() ?? '', ...urls].filter(Boolean).join('\n')
  const picks = isSubtask ? {} : (opts.picks ?? {})
  const named = parsed.listName ? findListByName(state.lists, parsed.listName, (l) => displayListName(l.id, l.name)) : null
  // チップで選んだリストが書いた @リスト より勝つ
  const target = (picks.listId ? state.lists.find((l) => l.id === picks.listId) : null) ?? named
  const listId = target?.id ?? opts.defaultListId
  let id: string | undefined
  // 作成と日付付けは 1 回の取り消しで戻す（呼び出し側の asOneUndo の中でもよい）
  state.asOneUndo(() => {
    // サブタスクのリストは addTask が親のリストにそろえる
    id = state.addTask(title, listId, opts.parentId)
    if (!id) return
    // 続けて足したものは足した順に（前に足した行のすぐ下）
    const now = Date.now()
    const added = useTaskStore.getState().tasks.find((t) => t.id === id)
    const order = added ? orderAfterLastQuickAdd(useTaskStore.getState().tasks, added, now) : null
    if (order !== null) {
      useTaskStore.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, order } : t)) }))
    }
    lastQuickAdd = { id, at: now }
    // 入ったリスト（省略時は addTask が選ぶ）の種類で日付を付けるか決める
    const after = useTaskStore.getState()
    const addedListId = after.tasks.find((t) => t.id === id)?.listId
    const kind = after.lists.find((l) => l.id === addedListId)?.kind ?? 'tasks'
    const patch: SchedulePatch & Partial<Pick<Task, 'tags' | 'color' | 'kind' | 'estimateMinutes' | 'description'>> = {}
    if (parsed.tags.length) patch.tags = parsed.tags
    // メモが URL 1 つだけなら、行にリンクのアイコンが出る（`sourceLinkOf`）
    if (description) patch.description = description
    if (opts.color) patch.color = opts.color
    if (picks.color !== undefined) patch.color = picks.color
    // いつか・チェックリストには日付も繰り返しも付けない（付けると期限のビューに戻ってきてしまう）
    if (kind === 'tasks') {
      const today = appTodayKey()
      Object.assign(patch, quickAddSchedule(parsed, opts, today))
      // 時刻なしで書いた長さは見積もり（置くときの長さ）
      if (parsed.estimateMinutes != null) patch.estimateMinutes = parsed.estimateMinutes
      applyQuickAddPicks(patch, picks, opts, today)
    }
    // 予定にすると「まで」で読んだ締切・繰り返しは外れる（`applyTaskPatch`）。やる日・時間帯はそのまま
    if (opts.kind === 'event' && kind === 'tasks' && !isSubtask) patch.kind = 'event'
    if (Object.keys(patch).length > 0) state.updateTask(id, patch)
  })
  if (!id) return undefined

  if (target && target.id !== opts.currentListId) {
    state.showMoveBanner(i18n.t('toast.addedToList', { name: displayListName(target.id, target.name) }))
  } else {
    // 見ている日と違う日に入ったら、その欄から消えて「入らなかった」と見えないよう知らせる
    const scheduledDate = useTaskStore.getState().tasks.find((t) => t.id === id)?.scheduledDate
    if (opts.defaultDate && scheduledDate && scheduledDate !== opts.defaultDate) {
      state.showMoveBanner(i18n.t('toast.addedToDay', { date: formatDate(scheduledDate, 'monthDayWeekday') }))
    }
  }

  return id
}
