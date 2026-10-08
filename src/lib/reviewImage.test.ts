import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { getReview, type ReviewInsight } from './weekReview'
import { reviewPeriodDays } from './reviewPeriod'
import { toDateKey } from './dateKey'
import {
  buildReviewImageModel,
  dotFill,
  drawReviewImage,
  ellipsize,
  IMAGE_LABEL_ROWS,
  layoutReviewImage,
  layoutTexts,
  reviewShareText,
  shareableInsight,
  shareOrSaveImage,
  wrapText,
  type ImageContext,
  type MeasureText,
  type ReviewImageModel,
} from './reviewImage'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

/** テスト用の文字の幅（1 文字 = 大きさの 0.6 倍） */
const measure: MeasureText = (s, size) => Array.from(s).length * size * 0.6

const HEX: Record<string, string> = { ゼミ: '#7986CB', 就活: '#F6BF26', '': '#616161' }

// 2026-10-03 (土)。今週は 9/28（月）〜
const now = new Date('2026-10-03T20:00:00')
const SECRET = '〇〇社 最終面接の振り返り'
const MEMO = '年収の話をした'
const log = (id: string, date: string, start: string, end: string, tag: string, title = SECRET) =>
  task(id, {
    kind: 'log',
    completed: true,
    title,
    description: MEMO,
    dueDate: date,
    startTime: start,
    endTime: end,
    category: tag || null,
    tags: tag ? [tag] : [],
  })

const tasks = [
  log('a', '2026-09-28', '10:00', '13:00', 'ゼミ'),
  log('b', '2026-09-29', '10:00', '11:30', '就活'),
  log('c', '2026-09-29', '13:00', '14:00', 'ゼミ'),
  log('d', '2026-10-01', '09:00', '09:45', ''),
  // 予定に無かった記録（題名を持つ）。一言の候補にもなる
  log('e', '2026-10-02', '18:00', '21:00', '就活', '秘密の題名'),
]

function model(over: { hideLabels?: boolean; insight?: string | null; period?: 'week' | 'month' } = {}): ReviewImageModel {
  const period = over.period ?? 'week'
  const review = getReview(tasks, [], period, now, new Set(), now)
  const days = reviewPeriodDays(period, now)
  return buildReviewImageModel(review, {
    period,
    dayKeys: days.map(toDateKey),
    hideLabels: over.hideLabels ?? false,
    insight: over.insight ?? null,
    texts: {
      title: '週のふりかえり',
      periodText: '9月28日 (月) 〜 10月4日 (日)',
      totalLabel: '記録した時間',
      perDayLabel: '日ごとの記録時間',
      byLabelLabel: 'ラベル別の時間',
      otherLabels: 'その他',
      emptyText: 'まだ記録がありません',
      brand: 'Chronograma',
    },
    labelText: (tag) => tag || 'ラベルなし',
    labelHex: (tag) => HEX[tag] ?? '#039BE5',
    duration: (m) => (m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}`),
    durationShort: (m) => `${Math.floor(m / 60)}h`,
    dayLabel: (_k, i) => (period === 'week' ? '月火水木金土日'[i]! : i % 7 === 0 ? String(i + 1) : ''),
  })
}

describe('buildReviewImageModel', () => {
  it('期間のすべての日に棒を並べ、多い分類から積む', () => {
    const m = model()
    expect(m.days).toHaveLength(7)
    expect(m.days.map((d) => d.label).join('')).toBe('月火水木金土日')
    // 火曜: 就活 90 分・ゼミ 60 分（多い順）
    expect(m.days[1]!.segments).toEqual([
      { hex: '#F6BF26', minutes: 90 },
      { hex: '#7986CB', minutes: 60 },
    ])
    // 未来の日（日曜）は空
    expect(m.days[6]!.segments).toEqual([])
    expect(m.totalText).toBe('9時間15分')
  })

  it('ラベル別は多い順。ラベル名を隠すと名前は null（色と時間だけ）', () => {
    expect(model().labels.map((r) => r.name)).toEqual(['就活', 'ゼミ', 'ラベルなし'])
    const hidden = model({ hideLabels: true })
    expect(hidden.labels.map((r) => r.name)).toEqual([null, null, null])
    expect(hidden.labels.map((r) => r.hex)).toEqual(['#F6BF26', '#7986CB', '#616161'])
  })

  it('上位 5 件を超えた分は「その他」にまとめる（6 件ちょうどはまとめない）', () => {
    const many = (n: number) =>
      buildReviewImageModel(
        {
          days: [],
          loggedMinutes: 0,
          labelMinutes: Array.from({ length: n }, (_, i) => ({ tag: `L${i}`, minutes: 100 - i })),
        },
        {
          period: 'week',
          dayKeys: [],
          hideLabels: false,
          insight: null,
          texts: textsOf(model()),
          labelText: (t) => t,
          labelHex: () => '#039BE5',
          duration: String,
          durationShort: String,
          dayLabel: () => '',
        },
      ).labels
    expect(many(6)).toHaveLength(6)
    const folded = many(8)
    expect(folded).toHaveLength(IMAGE_LABEL_ROWS + 1)
    expect(folded.at(-1)).toMatchObject({ name: 'その他', others: true, minutes: 95 + 94 + 93, hex: null })
  })

  it('月は日の数だけ棒を並べ、棒の上の数字は書かない', () => {
    const m = model({ period: 'month' })
    expect(m.days).toHaveLength(31)
    expect(m.days.every((d) => d.totalText == null)).toBe(true)
  })
})

function textsOf(m: ReviewImageModel) {
  return {
    title: m.title,
    periodText: m.periodText,
    totalLabel: m.totalLabel,
    perDayLabel: m.perDayLabel,
    byLabelLabel: m.byLabelLabel,
    otherLabels: 'その他',
    emptyText: m.emptyText,
    brand: m.brand,
  }
}

describe('題名・メモは画像に入らない', () => {
  it('画像の文字にも共有の文にも、記録の題名・メモが無い', () => {
    for (const hideLabels of [false, true]) {
      for (const period of ['week', 'month'] as const) {
        const m = model({ hideLabels, period })
        const all = [...layoutTexts(layoutReviewImage(m, measure)), reviewShareText(m, shareTextOpts)].join('\n')
        expect(all).not.toContain('面接')
        expect(all).not.toContain('秘密')
        expect(all).not.toContain(MEMO)
        expect(JSON.stringify(m)).not.toContain('秘密')
      }
    }
  })

  it('ラベル名を隠すと、ラベル名はどこにも書かない', () => {
    const m = model({ hideLabels: true })
    const all = [...layoutTexts(layoutReviewImage(m, measure)), reviewShareText(m, shareTextOpts)].join('\n')
    expect(all).not.toContain('ゼミ')
    expect(all).not.toContain('就活')
    expect(all).toContain('9時間15分')
  })

  it('一言: 題名を含む「予定に無かった記録」はラベル名に置き換え、隠すときはラベルを名指しする一言を入れない', () => {
    const unplanned: ReviewInsight = { kind: 'unplanned', tag: '就活', title: '秘密の題名', minutes: 180 }
    expect(shareableInsight(unplanned, false)).toEqual({ ...unplanned, title: '' })
    expect(shareableInsight(unplanned, true)).toBeNull()
    expect(shareableInsight({ kind: 'labelGap', tag: '就活', planned: 120, logged: 0 }, true)).toBeNull()
    expect(shareableInsight({ kind: 'loggedTop', logged: 300, tag: 'ゼミ', minutes: 200 }, true)).toBeNull()
    const diff: ReviewInsight = { kind: 'loggedDiff', diff: 90 }
    expect(shareableInsight(diff, true)).toBe(diff)
  })
})

const shareTextOpts = {
  lead: (time: string) => `今週の記録 ${time}`,
  separator: '・',
  open: '（',
  close: '）',
  ellipsis: '…',
}

describe('reviewShareText', () => {
  it('合計と上位 3 件のラベル。もっとあれば …', () => {
    expect(reviewShareText(model(), shareTextOpts)).toBe('今週の記録 9時間15分（就活 4時間30分・ゼミ 4時間・ラベルなし 45分）')
    const four = {
      totalText: '10時間',
      labels: ['A', 'B', 'C', 'D'].map((n) => ({ name: n, hex: '#000000', minutes: 1, timeText: '1分' })),
    }
    expect(reviewShareText(four, shareTextOpts)).toBe('今週の記録 10時間（A 1分・B 1分・C 1分…）')
  })

  it('ラベル名を隠すときは合計だけ', () => {
    expect(reviewShareText(model({ hideLabels: true }), shareTextOpts)).toBe('今週の記録 9時間15分')
  })
})

describe('layoutReviewImage', () => {
  it('同じモデルなら同じ命令（決まった形）', () => {
    expect(layoutReviewImage(model(), measure)).toEqual(layoutReviewImage(model(), measure))
  })

  it('見出し・期間・合計・アプリ名を書き、背景は画像いっぱいの白', () => {
    const layout = layoutReviewImage(model(), measure)
    const texts = layoutTexts(layout)
    expect(texts).toEqual(expect.arrayContaining(['週のふりかえり', '9月28日 (月) 〜 10月4日 (日)', '9時間15分', 'Chronograma']))
    expect(layout.ops[0]).toMatchObject({ kind: 'rect', x: 0, y: 0, w: layout.width, h: layout.height, fill: '#ffffff' })
  })

  it('棒は gc-dot と同じ薄い塗り＋その色の縁で、境目は 1 本の線（隙間なく積む）', () => {
    const layout = layoutReviewImage(model(), measure)
    const bars = layout.ops.filter((op) => op.kind === 'rect' && op.stroke === '#F6BF26' && op.w > 20)
    expect(bars.length).toBeGreaterThan(0)
    expect(bars[0]).toMatchObject({ fill: dotFill('#F6BF26') })
    // 火曜の 2 段: 上の段の下端が下の段の上端に 1px 重なる
    const tue = layout.ops.filter(
      (op): op is Extract<typeof op, { kind: 'rect' }> => op.kind === 'rect' && !!op.stroke && op.w > 20 && op.x > 90 && op.x < 160,
    )
    expect(tue).toHaveLength(2)
    expect(tue[1]!.y + tue[1]!.h).toBeCloseTo(tue[0]!.y + 1)
    expect(tue[1]!.r).toEqual([3, 3, 0, 0])
  })

  it('一言を入れると下に足し、画像が高くなる', () => {
    const without = layoutReviewImage(model(), measure)
    const withLine = layoutReviewImage(model({ insight: '先週より記録が 1時間30分 増えました。' }), measure)
    expect(withLine.height).toBeGreaterThan(without.height)
    expect(layoutTexts(withLine).join('')).toContain('先週より記録が')
  })

  it('ラベル名を隠すと、名前の代わりに長さの線', () => {
    const shown = layoutReviewImage(model(), measure).ops.filter((op) => op.kind === 'rect' && op.h === 8)
    const hidden = layoutReviewImage(model({ hideLabels: true }), measure).ops.filter((op) => op.kind === 'rect' && op.h === 8)
    expect(shown).toHaveLength(0)
    expect(hidden).toHaveLength(3)
  })
})

describe('文字の折り返し・切り詰め', () => {
  it('日本語は 1 文字ごとに折り返し、句読点を行頭に置かない', () => {
    const lines = wrapText('あいうえおかきくけ。こさしすせ', 5 * 10 * 0.6, 10, 400, measure)
    expect(lines[0]).toBe('あいうえお')
    expect(lines.every((l) => !l.startsWith('。'))).toBe(true)
    expect(lines.join('')).toBe('あいうえおかきくけ。こさしすせ')
  })

  it('英語は単語で折り返す', () => {
    expect(wrapText('Logged 2h more than last week.', 16 * 6, 10, 400, measure)).toEqual(['Logged 2h more', 'than last week.'])
  })

  it('長いラベル名は … で切る', () => {
    expect(ellipsize('とても長いラベルの名前', 6 * 6, 10, 400, measure)).toBe('とても長い…')
    expect(ellipsize('短い', 100, 10, 400, measure)).toBe('短い')
  })
})

describe('drawReviewImage', () => {
  it('命令どおりに描く（倍率をかけ、文字は上端そろえ）', () => {
    const calls: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => calls.push(`${key}(${args.join(',')})`)),
      set: (target, key: string, value) => {
        target[key] = value
        return true
      },
    }) as unknown as ImageContext
    const layout = layoutReviewImage(model(), measure)
    drawReviewImage(ctx, layout, 2)
    expect(calls[0]).toBe('setTransform(2,0,0,2,0,0)')
    expect(ctx.textBaseline).toBe('top')
    expect(calls.filter((c) => c.startsWith('fillText(')).length).toBe(layoutTexts(layout).length)
    expect(calls.some((c) => c.startsWith('fillText(Chronograma'))).toBe(true)
  })
})

describe('shareOrSaveImage', () => {
  const blob = new Blob(['png'], { type: 'image/png' })
  const opts = { fileName: 'chronograma-review-2026-09-28.png', title: '週のふりかえり', text: '今週の記録 9時間15分' }

  it('ファイルを共有できる端末は共有に渡す（保存しない）', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const save = vi.fn()
    const result = await shareOrSaveImage(blob, opts, { nav: { share, canShare: () => true }, save })
    expect(result).toBe('shared')
    expect(save).not.toHaveBeenCalled()
    const data = share.mock.calls[0]![0] as ShareData
    expect(data.text).toBe(opts.text)
    expect(data.files![0]!.name).toBe(opts.fileName)
    expect(data.files![0]!.type).toBe('image/png')
  })

  it('共有できない環境（PC のブラウザ・canShare が無い）は保存する', async () => {
    const save = vi.fn()
    expect(await shareOrSaveImage(blob, opts, { nav: { share: vi.fn(), canShare: () => false }, save })).toBe('saved')
    expect(await shareOrSaveImage(blob, opts, { nav: undefined, save })).toBe('saved')
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith(blob, opts.fileName)
  })

  it('共有シートを閉じたら何もしない。ほかの失敗は保存に切り替える', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' })
    const save = vi.fn()
    expect(await shareOrSaveImage(blob, opts, { nav: { share: vi.fn().mockRejectedValue(abort), canShare: () => true }, save })).toBe(
      'cancelled',
    )
    expect(save).not.toHaveBeenCalled()
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' })
    expect(await shareOrSaveImage(blob, opts, { nav: { share: vi.fn().mockRejectedValue(denied), canShare: () => true }, save })).toBe(
      'saved',
    )
    expect(save).toHaveBeenCalledTimes(1)
  })
})
