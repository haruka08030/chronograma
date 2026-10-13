import type { ReviewInsight, WeekReview } from './weekReview'
import type { ReviewPeriod } from './reviewPeriod'

/**
 * ふりかえりを 1 枚の画像にする（#283）。共有・保存する画像は端末の中で `canvas` に描き、サーバーには送らない。
 *
 * - 入れるもの: 期間の日付・記録した時間の合計・日ごとの棒（ラベルの色を `gc-dot` と同じ薄い塗り＋縁で隙間なく積む）・
 *   ラベル別の時間の上位 5 件（残りは「その他」）・選べば一言（#276）・隅に小さく「Chronograma」
 * - 入れないもの: To-Do・記録の題名とメモ。作る元は日ごとのラベル別の分（`tagMinutes`）とラベル別の分（`labelMinutes`）だけで、
 *   題名を持つ `review.unplanned` は読まない。一言も題名を含まない形にしてから渡す（`shareableInsight`）
 * - 「ラベル名を隠す」なら、ラベルは色と時間だけ（名前の代わりに長さの線）
 * - 見た目は画面のふりかえりのカードのまま。ライト・ダークは画面に合わせず、共有先で読みやすいライトで作る
 *
 * 描く中身は 3 段に分ける（どれも同じ入力なら同じ出力）:
 * 1. `buildReviewImageModel`: ふりかえりの数字 → 画像に書く文字と色（言語・ラベル名はここで決まる）
 * 2. `layoutReviewImage`: 文字と色 → 描く命令（位置・大きさ）。文字の幅は `measure` で測る
 * 3. `drawReviewImage`: 描く命令 → canvas
 */

/** 画像に載せるラベルの行の数（残りは「その他」にまとめる） */
export const IMAGE_LABEL_ROWS = 5

/** 画像の幅（論理 px）。書き出すときは `IMAGE_SCALE` 倍（1080px。SNS・LINE でそのまま読める幅） */
export const IMAGE_WIDTH = 540
export const IMAGE_SCALE = 2

/** 画面と同じ書体（Inter → 日本語は端末の日本語の書体） */
export const IMAGE_FONT_FAMILY =
  'Inter, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif'

/** ライトの画面の色（tailwind の zinc と、アクセントの墨色。index.css と同じ値） */
const C = {
  surface: '#ffffff',
  tile: '#fafafa', // zinc-50
  ink: '#18181b', // zinc-900
  text: '#3f3f46', // zinc-700
  meta: '#71717a', // zinc-500
  faint: '#a1a1aa', // zinc-400
  rule: '#e4e4e7', // zinc-200
  insightBg: '#f5f6f7', // accent-50 の 70%（白の上）
  insightInk: '#202124', // accent-800
}

/** 1 本の棒の 1 段（ラベルの色と分） */
export interface ImageSegment {
  hex: string
  minutes: number
}

export interface ImageDay {
  /** 棒の下の文字（週は曜日、月は 1・8・15… 日だけ。空なら書かない） */
  label: string
  /** 多い順（下から積む） */
  segments: ImageSegment[]
  /** 棒の上の合計（週だけ。月は細いので書かない） */
  totalText: string | null
}

export interface ImageLabelRow {
  /** ラベル名。隠すときは null（色と時間だけ） */
  name: string | null
  /** 色。「その他」は null（丸を描かない） */
  hex: string | null
  minutes: number
  timeText: string
  /** 「その他」の行 */
  others?: boolean
}

/** 画像に書く文字と色（ここから先は言語・データに依らず描くだけ） */
export interface ReviewImageModel {
  period: ReviewPeriod
  title: string
  periodText: string
  totalLabel: string
  totalText: string
  perDayLabel: string
  byLabelLabel: string
  days: ImageDay[]
  labels: ImageLabelRow[]
  /** ラベル別の行が無いときの文 */
  emptyText: string
  insight: string | null
  brand: string
}

/**
 * 一言（#276）を画像に入れられる形にする。題名を含む「予定に無かった記録」はラベル名に置き換え（画面でも題名の無い記録はラベル名で書く）、
 * ラベル名を隠すときはラベルを名指しする一言は入れない（null）
 */
export function shareableInsight(insight: ReviewInsight, hideLabels: boolean): ReviewInsight | null {
  switch (insight.kind) {
    case 'labelGap':
    case 'loggedTop':
      return hideLabels ? null : insight
    case 'unplanned':
      return hideLabels ? null : { ...insight, title: '' }
    default:
      return insight
  }
}

export interface ReviewImageTexts {
  title: string
  periodText: string
  totalLabel: string
  perDayLabel: string
  byLabelLabel: string
  otherLabels: string
  emptyText: string
  brand: string
}

/** ふりかえりの数字 → 画像に書く文字と色。題名・メモは受け取らない（`days[].tagMinutes` と `labelMinutes` だけを読む） */
export function buildReviewImageModel(
  review: Pick<WeekReview, 'days' | 'labelMinutes' | 'loggedMinutes'>,
  opts: {
    period: ReviewPeriod
    /** 期間のすべての日（未来の日も。棒の数をそろえる） */
    dayKeys: readonly string[]
    hideLabels: boolean
    /** 入れる一言（文にしたもの。入れないなら null） */
    insight: string | null
    texts: ReviewImageTexts
    labelText: (tag: string) => string
    labelHex: (tag: string) => string
    duration: (minutes: number) => string
    durationShort: (minutes: number) => string
    /** 棒の下の文字（`i` は期間の何日目か、0 から） */
    dayLabel: (dateKey: string, i: number) => string
  },
): ReviewImageModel {
  const byKey = new Map(review.days.map((d) => [d.dateKey, d]))
  const days: ImageDay[] = opts.dayKeys.map((key, i) => {
    const segments = (byKey.get(key)?.tagMinutes ?? [])
      .filter((x) => x.minutes > 0)
      .map((x) => ({ hex: opts.labelHex(x.tag), minutes: x.minutes }))
    const total = segments.reduce((a, x) => a + x.minutes, 0)
    return {
      label: opts.dayLabel(key, i),
      segments,
      totalText: opts.period === 'week' && total > 0 ? opts.durationShort(total) : null,
    }
  })

  const rows = review.labelMinutes.filter((x) => x.minutes > 0)
  // 6 件ちょうどなら「その他」1 件にまとめず 6 件目もそのまま（まとめても 1 行は減らない）
  const fold = rows.length > IMAGE_LABEL_ROWS + 1
  const shown = fold ? rows.slice(0, IMAGE_LABEL_ROWS) : rows
  const labels: ImageLabelRow[] = shown.map((x) => ({
    name: opts.hideLabels ? null : opts.labelText(x.tag),
    hex: opts.labelHex(x.tag),
    minutes: x.minutes,
    timeText: opts.duration(x.minutes),
  }))
  if (fold) {
    const rest = rows.slice(IMAGE_LABEL_ROWS).reduce((a, x) => a + x.minutes, 0)
    labels.push({ name: opts.texts.otherLabels, hex: null, minutes: rest, timeText: opts.duration(rest), others: true })
  }

  return {
    period: opts.period,
    title: opts.texts.title,
    periodText: opts.texts.periodText,
    totalLabel: opts.texts.totalLabel,
    totalText: opts.duration(review.loggedMinutes),
    perDayLabel: opts.texts.perDayLabel,
    byLabelLabel: opts.texts.byLabelLabel,
    days,
    labels,
    emptyText: opts.texts.emptyText,
    insight: opts.insight,
    brand: opts.texts.brand,
  }
}

/**
 * 共有するテキスト（画像を読めない人・読み上げ用の代わりの文）: 「今週の記録 18時間20分（ゼミ 6時間・就活 4時間…）」。
 * ラベル名を隠すときは合計だけ
 */
export function reviewShareText(
  model: Pick<ReviewImageModel, 'totalText' | 'labels'>,
  f: {
    /** 「今週の記録 {{time}}」の文 */
    lead: (time: string) => string
    separator: string
    open: string
    close: string
    ellipsis: string
  },
  maxLabels = 3,
): string {
  const named = model.labels.filter((x) => x.name != null && !x.others)
  const lead = f.lead(model.totalText)
  if (named.length === 0) return lead
  const parts = named.slice(0, maxLabels).map((x) => `${x.name} ${x.timeText}`)
  const more = model.labels.length > Math.min(named.length, maxLabels) ? f.ellipsis : ''
  return `${lead}${f.open}${parts.join(f.separator)}${more}${f.close}`
}

// ---- 位置を決める ----

export type ImageFontWeight = 400 | 600

/** 描く命令。座標・大きさは論理 px（描くときに `IMAGE_SCALE` 倍） */
export type DrawOp =
  | {
      kind: 'rect'
      x: number
      y: number
      w: number
      h: number
      /** 角の丸み（数 1 つで 4 隅、[左上, 右上, 右下, 左下]） */
      r?: number | [number, number, number, number]
      fill?: string
      stroke?: string
    }
  | {
      kind: 'text'
      x: number
      /** 文字の上端 */
      y: number
      text: string
      size: number
      weight: ImageFontWeight
      color: string
      align?: 'left' | 'right' | 'center'
    }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string }

export interface ReviewImageLayout {
  width: number
  height: number
  ops: DrawOp[]
}

/** 文字の幅（論理 px）。描くときは canvas の measureText、テストでは近似 */
export type MeasureText = (text: string, size: number, weight: ImageFontWeight) => number

/** canvas の font の指定 */
export function imageFont(size: number, weight: ImageFontWeight): string {
  return `${weight} ${size}px ${IMAGE_FONT_FAMILY}`
}

/** `gc-dot` の塗り（その色 30% を白に混ぜる。`color-mix(in srgb, var(--c) 30%, var(--gc-surface))` と同じ） */
export function dotFill(hex: string, ratio = 0.3): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h)
    const n = m ? parseInt(m[1]!, 16) : 0x9aa0a6
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const c = parse(hex)
  const s = parse(C.surface)
  return `#${c
    .map((v, i) =>
      Math.round(v * ratio + s[i]! * (1 - ratio))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** 幅に収まらない文字を「…」で切る */
export function ellipsize(text: string, maxWidth: number, size: number, weight: ImageFontWeight, measure: MeasureText): string {
  if (measure(text, size, weight) <= maxWidth) return text
  const chars = Array.from(text)
  while (chars.length > 0 && measure(`${chars.join('')}…`, size, weight) > maxWidth) chars.pop()
  return `${chars.join('')}…`
}

/** 行頭に置かない約物（前の行の終わりにぶら下げる） */
const NO_LINE_START = /^[、。，．,.)）」』】！？!?・ー〜…]/

/** 幅で折り返す。英語は単語ごと、日本語は 1 文字ごと（句読点は行頭に置かない） */
export function wrapText(text: string, maxWidth: number, size: number, weight: ImageFontWeight, measure: MeasureText): string[] {
  const tokens = text.match(/[A-Za-z0-9'’%+\-.,:;!?()]+\s*|\s+|./gu) ?? []
  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    const next = line + token
    if (line && measure(next.trimEnd(), size, weight) > maxWidth && !NO_LINE_START.test(token)) {
      lines.push(line.trimEnd())
      line = token.trimStart()
    } else {
      line = next
    }
  }
  if (line.trim()) lines.push(line.trimEnd())
  return lines
}

/** 余白・大きさ（論理 px） */
const L = {
  pad: 28,
  titleSize: 20,
  metaSize: 13,
  sectionSize: 12,
  bodySize: 13,
  smallSize: 11,
  chartHeight: 150,
  /** 棒の上の合計の分の余白 */
  chartTop: 16,
  rowHeight: 26,
}

/** 文字と色 → 描く命令。同じモデル・同じ `measure` なら同じ命令 */
export function layoutReviewImage(model: ReviewImageModel, measure: MeasureText): ReviewImageLayout {
  const W = IMAGE_WIDTH
  const P = L.pad
  const inner = W - P * 2
  const ops: DrawOp[] = [{ kind: 'rect', x: 0, y: 0, w: W, h: 0, fill: C.surface }]
  const text = (
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    weight: ImageFontWeight = 400,
    align: 'left' | 'right' | 'center' = 'left',
  ) => ops.push({ kind: 'text', x, y, text: s, size, weight, color, align })

  let y = P
  // 見出しと期間
  text(P, y, ellipsize(model.title, inner, L.titleSize, 600, measure), L.titleSize, C.ink, 600)
  y += L.titleSize + 8
  text(P, y, ellipsize(model.periodText, inner, L.metaSize, 400, measure), L.metaSize, C.meta)
  y += L.metaSize + 18

  // 記録した時間の合計（画面の数字の枠と同じ薄い地）
  const tileH = 68
  ops.push({ kind: 'rect', x: P, y, w: inner, h: tileH, r: 10, fill: C.tile })
  text(P + 16, y + 14, model.totalLabel, L.smallSize, C.meta)
  text(P + 16, y + 32, model.totalText, 24, C.ink, 600)
  y += tileH + 26

  // 日ごとの棒
  text(P, y, model.perDayLabel, L.sectionSize, C.faint, 600)
  y += L.sectionSize + 10
  const n = Math.max(1, model.days.length)
  const gap = model.period === 'week' ? 12 : 3
  const colW = (inner - gap * (n - 1)) / n
  const barTop = y + L.chartTop
  const baseY = y + L.chartHeight
  const barArea = baseY - barTop
  const dayTotals = model.days.map((d) => d.segments.reduce((a, x) => a + x.minutes, 0))
  const max = Math.max(60, ...dayTotals)
  model.days.forEach((day, i) => {
    const x = P + i * (colW + gap)
    const total = dayTotals[i]!
    if (total > 0) {
      const h = Math.max(2, (total / max) * barArea)
      // 予定の枠の分だけ細くする画面の棒と同じく、列より少し細い
      const inset = model.period === 'week' ? 3 : 0
      const bx = x + inset
      const bw = colW - inset * 2
      let segBottom = baseY
      // 多い分類を下に。境目は線 1 本（上の段の下の縁を、下の段の上の縁に重ねる）
      day.segments.forEach((seg, j) => {
        const top = j === day.segments.length - 1 ? baseY - h : segBottom - (seg.minutes / total) * h
        const segTop = Math.min(segBottom, top)
        const isTop = j === day.segments.length - 1
        ops.push({
          kind: 'rect',
          x: bx,
          y: segTop,
          w: bw,
          h: Math.max(1, segBottom - segTop + (j > 0 ? 1 : 0)),
          r: isTop ? [3, 3, 0, 0] : 0,
          fill: dotFill(seg.hex),
          stroke: seg.hex,
        })
        segBottom = segTop
      })
      if (day.totalText) text(x + colW / 2, baseY - h - L.smallSize - 4, day.totalText, L.smallSize - 1, C.meta, 400, 'center')
    }
    if (day.label) text(x + colW / 2, baseY + 7, day.label, L.smallSize, C.faint, 400, 'center')
  })
  ops.push({ kind: 'line', x1: P, y1: baseY + 0.5, x2: W - P, y2: baseY + 0.5, color: C.rule })
  y = baseY + 7 + L.smallSize + 26

  // ラベル別の時間
  text(P, y, model.byLabelLabel, L.sectionSize, C.faint, 600)
  y += L.sectionSize + 12
  if (model.labels.length === 0) {
    text(P, y, model.emptyText, L.bodySize, C.meta)
    y += L.rowHeight
  } else {
    const timeW = Math.max(...model.labels.map((r) => measure(r.timeText, L.bodySize, 400)))
    const maxMinutes = Math.max(1, ...model.labels.map((r) => r.minutes))
    const nameX = P + 18
    const nameMax = W - P - timeW - 16 - nameX
    for (const row of model.labels) {
      const mid = y + L.rowHeight / 2
      if (row.hex) ops.push({ kind: 'rect', x: P + 1, y: mid - 4.5, w: 9, h: 9, r: 4.5, fill: dotFill(row.hex), stroke: row.hex })
      if (row.name != null) {
        text(
          nameX,
          mid - L.bodySize / 2 - 1,
          ellipsize(row.name, nameMax, L.bodySize, 400, measure),
          L.bodySize,
          row.others ? C.meta : C.text,
        )
      } else if (row.hex) {
        // 名前を隠すときは、長さの線（色と時間だけ）
        ops.push({
          kind: 'rect',
          x: nameX,
          y: mid - 4,
          w: Math.max(4, (row.minutes / maxMinutes) * nameMax),
          h: 8,
          r: 2,
          fill: dotFill(row.hex),
          stroke: row.hex,
        })
      }
      text(W - P, mid - L.bodySize / 2 - 1, row.timeText, L.bodySize, C.meta, 400, 'right')
      y += L.rowHeight
    }
  }

  // 一言（選んだときだけ）
  if (model.insight) {
    y += 14
    const lineH = 20
    const lines = wrapText(model.insight, inner - 28, L.bodySize - 0.5, 400, measure)
    const boxH = lines.length * lineH + 22
    ops.push({ kind: 'rect', x: P, y, w: inner, h: boxH, r: 10, fill: C.insightBg })
    lines.forEach((line, i) => text(P + 14, y + 12 + i * lineH + (lineH - L.bodySize) / 2, line, L.bodySize - 0.5, C.insightInk))
    y += boxH
  }

  // 隅に小さくアプリの名前（URL は入れない）
  y += 22
  text(W - P, y, model.brand, L.smallSize, C.faint, 600, 'right')
  y += L.smallSize + P

  const height = Math.ceil(y)
  const bg = ops[0]
  if (bg?.kind === 'rect') bg.h = height
  return { width: W, height, ops }
}

/** 画像に書かれる文字をすべて（テスト・確かめ用） */
export function layoutTexts(layout: ReviewImageLayout): string[] {
  return layout.ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []))
}

// ---- 描く ----

/** 描くのに使う canvas の機能（テストで差し替えられるよう最小限） */
export type ImageContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'setTransform'
>

function roundedPath(ctx: ImageContext, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) => Math.min(v, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + tl!, y)
  ctx.lineTo(x + w - tr!, y)
  ctx.arcTo(x + w, y, x + w, y + tr!, tr!)
  ctx.lineTo(x + w, y + h - br!)
  ctx.arcTo(x + w, y + h, x + w - br!, y + h, br!)
  ctx.lineTo(x + bl!, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl!, bl!)
  ctx.lineTo(x, y + tl!)
  ctx.arcTo(x, y, x + tl!, y, tl!)
  ctx.closePath()
}

/** 描く命令を canvas に描く（`scale` 倍の大きさで） */
export function drawReviewImage(ctx: ImageContext, layout: ReviewImageLayout, scale = IMAGE_SCALE): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.textBaseline = 'top'
  for (const op of layout.ops) {
    if (op.kind === 'rect') {
      if (!op.r && !op.stroke) {
        ctx.fillStyle = op.fill ?? 'transparent'
        ctx.fillRect(op.x, op.y, op.w, op.h)
        continue
      }
      // 縁は 1px の内側に描く（くっきりした縁。画面の border と同じ太さ）
      const half = op.stroke ? 0.5 : 0
      roundedPath(ctx, op.x + half, op.y + half, op.w - half * 2, op.h - half * 2, op.r ?? 0)
      if (op.fill) {
        ctx.fillStyle = op.fill
        ctx.fill()
      }
      if (op.stroke) {
        ctx.strokeStyle = op.stroke
        ctx.lineWidth = 1
        ctx.stroke()
      }
    } else if (op.kind === 'line') {
      ctx.strokeStyle = op.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(op.x1, op.y1)
      ctx.lineTo(op.x2, op.y2)
      ctx.stroke()
    } else {
      ctx.font = imageFont(op.size, op.weight)
      ctx.fillStyle = op.color
      ctx.textAlign = op.align ?? 'left'
      ctx.fillText(op.text, op.x, op.y)
    }
  }
}

/** 使う書体を読み込んでから描く（Inter は Web フォント。読めなくても端末の書体で描ける） */
async function loadImageFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts?.load) return
  try {
    await Promise.all([fonts.load(imageFont(13, 400), 'あA0'), fonts.load(imageFont(13, 600), 'あA0')])
  } catch {
    /* 読めなければ端末の書体で描く */
  }
}

/**
 * ふりかえりのモデルを PNG にする。canvas が使えない環境（古いブラウザ・テスト）は null
 */
export async function renderReviewImage(model: ReviewImageModel, scale = IMAGE_SCALE): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  await loadImageFonts()
  const canvas = document.createElement('canvas')
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx) return null
  const c = ctx
  const measure: MeasureText = (s, size, weight) => {
    c.font = imageFont(size, weight)
    return c.measureText(s).width
  }
  const layout = layoutReviewImage(model, measure)
  canvas.width = layout.width * scale
  canvas.height = layout.height * scale
  drawReviewImage(c, layout, scale)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

// ---- 共有・保存 ----

export type ShareImageResult = 'shared' | 'saved' | 'cancelled'

/** 共有に使う navigator の機能（テストで差し替える） */
export type ShareNavigator = Pick<Navigator, 'share' | 'canShare'> | undefined

/** この端末で画像のファイルを共有できるか（スマホの共有シート。PC のブラウザの多くはできない） */
export function canShareImageFile(file: File, nav: ShareNavigator = globalThis.navigator): boolean {
  if (!nav?.share || !nav.canShare) return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * 画像を端末の共有に渡す。共有できない環境・共有に失敗したとき（取り消し以外）は画像を保存する。
 * 共有シートを閉じた（取り消した）ときは何もしない
 */
export async function shareOrSaveImage(
  blob: Blob,
  opts: { fileName: string; title: string; text: string },
  deps: { nav?: ShareNavigator; save: (blob: Blob, fileName: string) => void },
): Promise<ShareImageResult> {
  const nav = 'nav' in deps ? deps.nav : globalThis.navigator
  const file = new File([blob], opts.fileName, { type: blob.type || 'image/png' })
  if (canShareImageFile(file, nav)) {
    try {
      await nav!.share({ files: [file], title: opts.title, text: opts.text })
      return 'shared'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
      // 押してから時間が経った・許されなかったなど。保存に切り替える
    }
  }
  deps.save(blob, opts.fileName)
  return 'saved'
}
