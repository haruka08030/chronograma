import type { CSSProperties } from 'react'

export interface OverlapInput {
  id: string
  top: number
  height: number
  /**
   * 重なり判定に使う実際の時間の長さ（省略時は height）。短い項目は最小高さまで
   * 引き伸ばして描くが、時間が重ならなければ列を分けない（後の項目が上に重なる）
   */
  span?: number
}

export interface OverlapSlot {
  /** 0 始まりの列番号 */
  col: number
  /** この項目が属する重なりの塊の列数 */
  cols: number
}

/**
 * 時間が重なるブロックを横に並べるための列割り当て（Google カレンダー方式）。
 * 縦位置で重なる項目を推移的にまとめた「塊」ごとに、空いている最左列へ貪欲に詰める。
 * 塊の列数はその塊内の最大同時数なので、重ならない項目は常に全幅になる。
 */
export function layoutOverlaps(items: readonly OverlapInput[]): Map<string, OverlapSlot> {
  const result = new Map<string, OverlapSlot>()
  const sorted = [...items].sort((a, b) => a.top - b.top || b.height - a.height)

  let cluster: { id: string; col: number }[] = []
  let colEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    const cols = colEnds.length
    for (const c of cluster) result.set(c.id, { col: c.col, cols })
    cluster = []
    colEnds = []
  }

  for (const item of sorted) {
    const bottom = item.top + (item.span ?? item.height)
    if (item.top >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    let col = colEnds.findIndex((end) => end <= item.top)
    if (col < 0) {
      col = colEnds.length
      colEnds.push(bottom)
    } else {
      colEnds[col] = bottom
    }
    cluster.push({ id: item.id, col })
    clusterEnd = Math.max(clusterEnd, bottom)
  }
  flush()
  return result
}

/** 狭い列（週表示など）で使う、重なりごとの右ずらし量 */
const CASCADE_STEP_PX = 14

/**
 * 列割り当てを absolute 配置の left/width にする。
 * `laneStart`/`laneWidth` は親の幅に対する %（予定=左半分 などのレーン指定用）。
 * - `columns`: 等幅で横に並べる（1 日表示など列が広いとき）
 * - `cascade`: 少しずつ右へずらして後のものを上に重ねる（週表示など列が狭いとき。
 *   等分すると 1 文字ずつ折り返して読めなくなるため）。ホバーで前面に出る
 */
export function overlapSlotStyle(
  slot: OverlapSlot | undefined,
  laneStart = 0,
  laneWidth = 100,
  gapPx = 2,
  mode: 'columns' | 'cascade' = 'columns',
): CSSProperties {
  const cols = slot?.cols ?? 1
  const col = slot?.col ?? 0
  if (mode === 'cascade') {
    const shift = col * CASCADE_STEP_PX
    return {
      left: `calc(${laneStart}% + ${gapPx + shift}px)`,
      width: `calc(${laneWidth}% - ${gapPx * 2 + shift}px)`,
      zIndex: col > 0 ? col : undefined,
    }
  }
  const w = laneWidth / cols
  return {
    left: `calc(${laneStart + col * w}% + ${gapPx}px)`,
    width: `calc(${w}% - ${gapPx * 2}px)`,
  }
}

/**
 * 予定とログを一緒に並べるときの横位置。時間が重なる塊ごとに、
 * 予定とログが混ざっていれば 予定=左半分 / ログ=右半分、片方だけなら全幅を使う
 * （1 日のどこかにログがあるだけで全体を半分にすると、空いた右半分が無駄になる）。
 * `fixedLanes` なら常に 予定=左半分 / ログ=右半分（「今日」の 2 列表示）。
 */
export function layoutPlanAndLog(
  plans: readonly OverlapInput[],
  logs: readonly OverlapInput[],
  mode: 'columns' | 'cascade',
  fixedLanes = false,
): Map<string, CSSProperties> {
  const all = [
    ...plans.map((p) => ({ ...p, isLog: false })),
    ...logs.map((l) => ({ ...l, isLog: true })),
  ].sort((a, b) => a.top - b.top)

  const clusters: (typeof all)[] = []
  let clusterEnd = -Infinity
  for (const item of all) {
    if (item.top >= clusterEnd) {
      clusters.push([])
      clusterEnd = -Infinity
    }
    clusters[clusters.length - 1]!.push(item)
    clusterEnd = Math.max(clusterEnd, item.top + (item.span ?? item.height))
  }

  const styles = new Map<string, CSSProperties>()
  for (const cluster of clusters) {
    const p = cluster.filter((x) => !x.isLog)
    const l = cluster.filter((x) => x.isLog)
    const split = fixedLanes || (p.length > 0 && l.length > 0)
    const place = (items: typeof cluster, start: number, width: number) => {
      const slots = layoutOverlaps(items)
      for (const it of items) styles.set(`${it.isLog ? 'log' : 'plan'}:${it.id}`, overlapSlotStyle(slots.get(it.id), start, width, 2, mode))
    }
    place(p, 0, split ? 50 : 100)
    place(l, split ? 50 : 0, split ? 50 : 100)
  }

  // 最小高さで引き伸ばした短い項目が次の項目にかぶるときは、後の項目を上に出す（タイトルが隠れないように）
  let visualEnd = -Infinity
  let lastZ = 0
  for (const item of all) {
    const key = `${item.isLog ? 'log' : 'plan'}:${item.id}`
    const style = styles.get(key)!
    const baseZ = Number(style.zIndex ?? 0)
    const z = item.top < visualEnd ? Math.min(Math.max(baseZ, lastZ + 1), MAX_STACK_Z) : baseZ
    if (z !== baseZ) styles.set(key, { ...style, zIndex: z })
    lastZ = z
    visualEnd = Math.max(visualEnd, item.top + item.height)
  }
  return styles
}

/** ドラッグのプレビュー（z-20）より下に収める */
const MAX_STACK_Z = 19
