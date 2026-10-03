/**
 * 撮影用の種データ。
 *
 * 画面の見た目を確かめるのが目的なので、空っぽでは意味がない。
 * 想定ユーザー（学生・就活生）の使い方に合わせて、課題 / ES / バイト / ジムを置く。
 * 日付は撮影日を基準に組み立てて、「今日」「期限切れ」「近日中」が毎回同じ構図になるようにする。
 */

const PERSIST_KEY = 'chronograma-storage'
/** `taskStore.ts` の persist version と合わせる。古いと migrate が走って構図が変わる */
const PERSIST_VERSION = 35

const INBOX_ID = '__inbox__'
const SOMEDAY_ID = 'seed-someday'
const SHOPPING_ID = 'seed-shopping'

const p2 = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const shift = (base, days) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function task(fields, now) {
  const iso = now.toISOString()
  return {
    id: fields.id,
    title: fields.title,
    description: '',
    completed: fields.completed ?? false,
    completedAt: fields.completed ? iso : null,
    createdAt: iso,
    updatedAt: iso,
    order: fields.order ?? 0,
    listId: fields.listId ?? INBOX_ID,
    sectionId: null,
    parentId: fields.parentId ?? null,
    dueDate: fields.dueDate ?? null,
    dueTime: fields.dueTime ?? null,
    scheduledDate: fields.scheduledDate ?? null,
    endDate: fields.endDate ?? null,
    startTime: fields.startTime ?? null,
    endTime: fields.endTime ?? null,
    location: null,
    color: fields.color ?? null,
    priority: fields.priority ?? 'none',
    tags: fields.tags ?? [],
    recurrence: null,
    isTimeLog: fields.isTimeLog ?? false,
    isSleep: fields.isSleep ?? false,
    habitId: null,
    archivedAt: null,
    deletedAt: null,
  }
}

/**
 * 撮影用の state を作る。`theme` は 'light' | 'dark'。
 * `now` を渡せば日付の構図を固定できる。
 */
export function buildSeedState({ theme = 'light', now = new Date() } = {}) {
  const today = dayKey(now)
  const yesterday = dayKey(shift(now, -1))
  const inTwoDays = dayKey(shift(now, 2))

  const tasks = [
    // 期限切れ（赤）と今日（オレンジ）が並ぶように置く
    task({ id: 's1', title: '統計学レポート 提出', dueDate: yesterday, priority: 'high', order: 0, color: '#33B679' }, now),
    task({ id: 's2', title: 'ES 書く（第一志望）', dueDate: today, dueTime: '18:00', priority: 'high', order: 1, color: '#F6BF26' }, now),
    task({ id: 's3', title: 'バイトのシフト提出', dueDate: today, order: 2, color: '#7986CB' }, now),
    task({ id: 's4', title: 'TOEIC 申し込み', dueDate: inTwoDays, order: 3, color: '#F6BF26' }, now),
    task({ id: 's5', title: '研究室のゼミ資料を読む', order: 4 }, now),
    // 予定（タイムラインに出る薄い枠）
    task({ id: 's6', title: 'ゼミ', scheduledDate: today, startTime: '15:00', endTime: '16:30', order: 5 }, now),
    task({ id: 's7', title: 'ジム', scheduledDate: today, startTime: '19:00', endTime: '20:00', order: 6 }, now),
    // 記録（色が付く主役）。完了済みのタイムログ
    task({ id: 's8', title: '課題（確率論）', dueDate: today, startTime: '10:00', endTime: '11:30', isTimeLog: true, completed: true, order: 7, tags: ['課題'] }, now),
    task({ id: 's9', title: '授業', dueDate: today, startTime: '13:00', endTime: '14:30', isTimeLog: true, completed: true, order: 8, tags: ['授業'] }, now),
    task({ id: 's10', title: '睡眠', dueDate: yesterday, endDate: today, startTime: '23:30', endTime: '07:00', isTimeLog: true, isSleep: true, completed: true, order: 9, tags: ['睡眠'] }, now),
    // ラベルなしの記録（夕方の「ラベルなしの記録 N 件」を出す）
    task({ id: 's17', title: '昼ごはん', dueDate: today, startTime: '12:00', endTime: '12:45', isTimeLog: true, completed: true, order: 12, tags: [] }, now),
    task({ id: 's18', title: 'メール返信', dueDate: today, startTime: '16:45', endTime: '17:15', isTimeLog: true, completed: true, order: 13, tags: [] }, now),
    // 完了したタスク（統計の数字を埋める）
    task({ id: 's11', title: '履修登録', completed: true, dueDate: yesterday, order: 10 }, now),
    task({ id: 's12', title: '健康診断の予約', completed: true, dueDate: yesterday, order: 11 }, now),
    // いつか（Wish）と買い物（チェックリスト）は別リスト
    task({ id: 's13', title: '北海道に行く', listId: SOMEDAY_ID, order: 0 }, now),
    task({ id: 's14', title: '『人を動かす』を読む', listId: SOMEDAY_ID, order: 1 }, now),
    task({ id: 's15', title: '牛乳', listId: SHOPPING_ID, order: 0 }, now),
    task({ id: 's16', title: 'シャンプー', listId: SHOPPING_ID, order: 1 }, now),
    // やり残し（前の日に置いて終わっていない。今日の計画の「やり残し N 件」に出る）
    task({ id: 's19', title: '参考文献を集める', scheduledDate: yesterday, order: 14 }, now),
    task({ id: 's20', title: '就活サイトのプロフィール更新', scheduledDate: dayKey(shift(now, -2)), order: 15 }, now),
  ]

  const habits = [
    {
      id: 'h1',
      title: '朝に 10 分ストレッチ',
      color: '#7986CB',
      timeMode: 'fixed',
      startTime: '07:30',
      endTime: null,
      frequency: { type: 'daily' },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedDates: [yesterday, dayKey(shift(now, -2)), dayKey(shift(now, -3))],
    },
    {
      id: 'h2',
      title: '単語アプリ',
      color: '#33B679',
      timeMode: 'none',
      startTime: null,
      endTime: null,
      frequency: { type: 'weekly', weekdays: [1, 3, 5] },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedDates: [yesterday],
    },
  ]

  return {
    state: {
      tasks,
      lists: [
        { id: INBOX_ID, name: '未分類', color: '#7986CB', order: 0, kind: 'tasks' },
        { id: SOMEDAY_ID, name: 'いつか', color: '#F6BF26', order: 1, kind: 'someday' },
        { id: SHOPPING_ID, name: '買い物', color: '#33B679', order: 2, kind: 'checklist' },
      ],
      sections: [],
      habits,
      selectedListId: INBOX_ID,
      selectedView: 'planner',
      theme,
      calendarMode: 'week',
      selectedCalendarDateKey: today,
      sortMode: 'manual',
      notificationsEnabled: false,
      timeLogTagPresets: ['睡眠', '授業', '課題', 'バイト', '就活'],
      // 新規ユーザーと同じ割り当て順（assignColorsInOrder）。To‑Do の色ラベル（color）もこの色で名前が付く
      logCategoryColors: { 睡眠: 'peacock', 授業: 'sage', 課題: 'tangerine', バイト: 'lavender', 就活: 'banana' },
    },
    version: PERSIST_VERSION,
  }
}

export { PERSIST_KEY }
